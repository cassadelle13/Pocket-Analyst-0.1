import { NextRequest, NextResponse } from "next/server";

import { safeISODate, sqlDateTime64UTC, parsePropertyFiltersFromURL, propertyFilterToSQL } from "../../../../lib/propertyFilterUtils";


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
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query + " FORMAT JSON",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`ClickHouse error: ${await response.text()}`);
      }

      const data = await response.json();
      return data.data as Array<Record<string, unknown>>;
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
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());
  // Property filters from URL: prop_foo=eq:bar
  const pf = parsePropertyFiltersFromURL(sp);
  const whereExtra = pf.length > 0 ? `\n      AND ${pf.map(propertyFilterToSQL).join("\n      AND ")}` : "";

  const rows = await queryClickHouse(`
    SELECT
      coalesce(JSONExtractString(properties, 'source'), 'unknown') AS category,
      count() AS value,
      countIf(event_name = 'purchase') AS purchases,
      sumOrNull(toFloat64OrNull(JSONExtractString(properties, 'revenue'))) AS revenue_a,
      sumOrNull(toFloat64OrNull(JSONExtractString(properties, 'amount'))) AS revenue_b
    FROM events
    WHERE timestamp >= ${sqlDateTime64UTC(startDate)}
      AND timestamp <= ${sqlDateTime64UTC(endDate)}
      ${whereExtra}
    GROUP BY category
    ORDER BY value DESC
    LIMIT 12
  `);

  const normalized = rows.map((r) => {
    const value = Number(r.value ?? 0);
    const purchases = Number(r.purchases ?? 0);
    const conversion = value > 0 ? Math.round((purchases / value) * 10000) / 100 : 0;
    const revenue = Number(r.revenue_a ?? 0) + Number(r.revenue_b ?? 0);

    return {
      id: String(r.category ?? "unknown"),
      category: String(r.category ?? "unknown"),
      value,
      conversion,
      revenue,
    };
  });

  return new NextResponse(JSON.stringify(normalized), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(normalized.length),
    },
  });
}
