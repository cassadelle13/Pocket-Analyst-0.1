import { NextRequest, NextResponse } from "next/server";

import { safeISODate, sqlDateTime64UTC } from "../../../../lib/propertyFilterUtils";

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
      if (!response.ok) throw new Error(await response.text());
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

  const rows = await queryClickHouse(`
    SELECT
      coalesce(event_name, 'unknown') AS category,
      count() AS value
    FROM events
    WHERE timestamp >= ${sqlDateTime64UTC(startDate)}
      AND timestamp <= ${sqlDateTime64UTC(endDate)}
    GROUP BY category
    ORDER BY value DESC
    LIMIT 20
  `);

  const normalized = rows.map((r) => ({
    id: String(r.category ?? 'unknown'),
    category: String(r.category ?? 'unknown'),
    value: Number(r.value ?? 0),
  }));

  return new NextResponse(JSON.stringify(normalized), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
