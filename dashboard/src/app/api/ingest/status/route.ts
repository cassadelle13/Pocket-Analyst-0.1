import { NextResponse } from "next/server";

import { queryClickHouse } from "../../../../lib/clickhouse";

export async function GET() {
  try {
    const countRows = await queryClickHouse<{ c: string | number; min_ts: string; max_ts: string }>(
      `SELECT count() AS c, min(timestamp) AS min_ts, max(timestamp) AS max_ts FROM events`,
      {
        host: process.env.CLICKHOUSE_HOST || "storage",
        port: process.env.CLICKHOUSE_PORT || "8123",
        database: process.env.CLICKHOUSE_DATABASE || "analytics",
      }
    );

    const byEvent = await queryClickHouse<{ event_name: string; c: string | number }>(
      `SELECT event_name, count() AS c FROM events GROUP BY event_name ORDER BY c DESC LIMIT 20`,
      {
        host: process.env.CLICKHOUSE_HOST || "storage",
        port: process.env.CLICKHOUSE_PORT || "8123",
        database: process.env.CLICKHOUSE_DATABASE || "analytics",
      }
    );

    const total = Number(countRows?.[0]?.c ?? 0);
    const min_ts = String((countRows as any)?.[0]?.min_ts ?? "");
    const max_ts = String((countRows as any)?.[0]?.max_ts ?? "");

    return NextResponse.json(
      {
        clickhouse: {
          database: process.env.CLICKHOUSE_DATABASE || "analytics",
          table: "events",
          total,
          min_ts,
          max_ts,
          by_event_name: (byEvent ?? []).map((r: any) => ({
            event_name: String(r?.event_name ?? ""),
            c: Number(r?.c ?? 0),
          })),
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load ingest status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
