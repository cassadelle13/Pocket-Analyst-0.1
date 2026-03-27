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
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());
  const startDate = safeISODate(
    sp.get("startDate"),
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  );

  const rows = await queryClickHouse(`
    WITH buckets AS (
      SELECT toUnixTimestamp(toStartOfHour(timestamp)) * 1000 AS ts,
             count() AS events,
             uniqExact(user_id) AS users,
             countIf(event_name = 'error') AS errors
      FROM events
      WHERE timestamp >= ${sqlDateTime64UTC(startDate)}
        AND timestamp <= ${sqlDateTime64UTC(endDate)}
      GROUP BY ts
      ORDER BY ts
    )
    SELECT ts, events, users, errors FROM buckets ORDER BY ts
  `);

  const normalized = rows.map((r) => ({
    ts: Number(r.ts ?? 0),
    events: Number(r.events ?? 0),
    users: Number(r.users ?? 0),
    errors: Number(r.errors ?? 0),
  }));

  return new NextResponse(JSON.stringify(normalized), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
