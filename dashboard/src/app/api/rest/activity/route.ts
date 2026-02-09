import { NextRequest, NextResponse } from "next/server";


const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

async function queryClickHouse(query: string) {
  // Try Docker network first, then fallback to localhost
  const hosts = [process.env.CLICKHOUSE_HOST || "storage", "localhost"];
  const port = process.env.CLICKHOUSE_PORT || "8123";
  const database = process.env.CLICKHOUSE_DATABASE || "analytics";

  for (const host of hosts) {
    try {
      const url = `http://${host}:${port}/?database=${database}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: query + " FORMAT JSON",
        cache: "no-store",
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        throw new Error(`ClickHouse error: ${await response.text()}`);
      }

      const data = await response.json();
      return data.data as Array<Record<string, unknown>>;
    } catch (err) {
      console.warn(`ClickHouse unavailable at ${host}:${port}:`, err);
      continue; // Try next host
    }
  }

  // If all hosts failed, return empty array
  console.error("ClickHouse unavailable on all hosts");
  return [];
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("projectId") || "proj_001";

  const rows = await queryClickHouse(`
    SELECT
      formatDateTime(toStartOfInterval(timestamp, INTERVAL 1 HOUR), '%Y-%m-%d %H:00') AS bucket,
      count() AS events,
      uniqExact(user_id) AS users
    FROM events
    WHERE timestamp >= now() - INTERVAL 24 HOUR
    GROUP BY bucket
    ORDER BY bucket
  `);

  const normalized = rows.map((row) => ({
    id: String(row.bucket ?? ""),
    bucket: row.bucket,
    events: Number(row.events ?? 0),
    users: Number(row.users ?? 0),
  }));

  return new NextResponse(JSON.stringify(normalized), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(normalized.length),
    },
  });
}
