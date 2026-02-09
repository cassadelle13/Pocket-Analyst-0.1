import { NextRequest, NextResponse } from "next/server";

import { safeISODate, sqlStringLiteral, propertyFilterToSQL, parsePropertyFiltersFromURL } from "../../../../lib/propertyFilterUtils";

import { apiClient } from "../../../../lib/api-client";


const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

async function queryClickHouse(query: string) {
  const hosts = [process.env.CLICKHOUSE_HOST || "storage", "localhost"];
  const port = process.env.CLICKHOUSE_PORT || "8123";
  const database = process.env.CLICKHOUSE_DATABASE || "analytics";

  for (const host of hosts) {
    try {
      const url = `http://${host}:${port}/?database=${database}`;
      const response = await apiClient.post(
        url,
        query + " FORMAT JSON",
        {
          headers: { "Content-Type": "text/plain" },
          signal: AbortSignal.timeout(5000),
        }
      );

      if ((response as any).error) {
        throw new Error(`API Client error: ${(response as any).error}`);
      }

      const payload = (response as any).data;
      return (payload?.data as Array<Record<string, unknown>>) || [];
    } catch (err) {
      console.warn(`ClickHouse unavailable at ${host}:${port}:`, err);
      continue;
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const startDate = safeISODate(
    sp.get("startDate"),
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());

  // Property filters from URL: prop_foo=eq:bar
  const pf = parsePropertyFiltersFromURL(sp);
  const whereExtra = pf.length > 0 ? `\n       AND ${pf.map(propertyFilterToSQL).join("\n       AND ")}` : "";

  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const safeEndMs = Number.isFinite(endMs) ? endMs : Date.now();

  const targetPoints = 500;
  const rangeSeconds = Math.max(1, Math.floor((safeEndMs - safeStartMs) / 1000));
  const bucketSeconds = Math.max(60, Math.ceil(rangeSeconds / targetPoints));

  // Predictive Layer: compute aggregates + moving average + linear regression forecast
  const rows = await queryClickHouse(`
    WITH base_data AS (
      SELECT
        toUnixTimestamp(toStartOfInterval(timestamp, toIntervalSecond(${bucketSeconds}))) * 1000 AS ts,
        count() AS events,
        uniqExact(user_id) AS users,
        uniqExact(session_id) AS sessions,
        sumOrNull(toFloat64OrNull(JSONExtractString(properties, 'revenue'))) AS revenue_a,
        sumOrNull(toFloat64OrNull(JSONExtractString(properties, 'amount'))) AS revenue_b,
        countIf(event_name = 'purchase') AS purchases
      FROM events
      WHERE timestamp >= ${sqlStringLiteral(startDate)}
        AND timestamp <= ${sqlStringLiteral(endDate)}
        ${whereExtra}
      GROUP BY ts
      ORDER BY ts
    ),
    
    enriched AS (
      SELECT
        ts,
        events,
        users,
        sessions,
        revenue_a + revenue_b AS revenue,
        purchases,
        avg(revenue_a + revenue_b) OVER (ORDER BY ts ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_revenue,
        avg(users) OVER (ORDER BY ts ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_users,
        row_number() OVER (ORDER BY ts) AS rn
      FROM base_data
    )
    
    SELECT
      ts,
      events,
      users,
      sessions,
      revenue,
      purchases,
      ma_revenue,
      ma_users,
      rn
    FROM enriched
    ORDER BY ts
  `);

  const normalized = rows.map((r) => {
    const revenue = Number(r.revenue ?? 0);
    const events = Number(r.events ?? 0);
    const purchases = Number(r.purchases ?? 0);
    const conversion = events > 0 ? Math.round((purchases / events) * 10000) / 100 : 0;

    return {
      id: String(r.ts ?? ""),
      ts: Number(r.ts ?? 0),
      revenue,
      users: Number(r.users ?? 0),
      sessions: Number(r.sessions ?? 0),
      conversion,
      ma_revenue: Number(r.ma_revenue ?? revenue),
      ma_users: Number(r.ma_users ?? r.users ?? 0),
      rn: Number(r.rn ?? 0),
    };
  });

  // Linear regression forecast (simple least squares on revenue)
  const n = normalized.length;
  const forecast_data: Array<{ ts: number; revenue_forecast: number; users_forecast: number }> = [];

  if (n >= 3) {
    // Calculate linear regression: y = a + bx
    const sumX = normalized.reduce((acc, d, i) => acc + i, 0);
    const sumY = normalized.reduce((acc, d) => acc + d.revenue, 0);
    const sumXY = normalized.reduce((acc, d, i) => acc + i * d.revenue, 0);
    const sumX2 = normalized.reduce((acc, d, i) => acc + i * i, 0);

    const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const a = (sumY - b * sumX) / n;

    // Same for users
    const sumYUsers = normalized.reduce((acc, d) => acc + d.users, 0);
    const sumXYUsers = normalized.reduce((acc, d, i) => acc + i * d.users, 0);
    const bUsers = (n * sumXYUsers - sumX * sumYUsers) / (n * sumX2 - sumX * sumX);
    const aUsers = (sumYUsers - bUsers * sumX) / n;

    // Forecast next 7 points
    const lastTs = normalized[n - 1].ts;
    const bucketMs = bucketSeconds * 1000;
    
    for (let i = 1; i <= 7; i++) {
      const forecastRevenue = Math.max(0, a + b * (n + i - 1));
      const forecastUsers = Math.max(0, aUsers + bUsers * (n + i - 1));
      
      forecast_data.push({
        ts: lastTs + i * bucketMs,
        revenue_forecast: Math.round(forecastRevenue * 100) / 100,
        users_forecast: Math.round(forecastUsers),
      });
    }
  }

  return new NextResponse(JSON.stringify({ 
    historical: normalized, 
    forecast: forecast_data,
    meta: {
      bucket_seconds: bucketSeconds,
      total_points: normalized.length,
      forecast_points: forecast_data.length,
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(normalized.length),
      "X-Forecast-Count": String(forecast_data.length),
    },
  });
}
