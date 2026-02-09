import { NextRequest, NextResponse } from "next/server";

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

async function queryClickHouse(query: string) {
  const url = `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?database=${CLICKHOUSE_DATABASE}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: query + " FORMAT JSON",
  });

  if (!response.ok) {
    throw new Error(`ClickHouse error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId") || "proj_001";
  const limit = searchParams.get("limit") || "10";

  try {
    const events = await queryClickHouse(`
      SELECT 
        event_id,
        event_type,
        event_name,
        user_id,
        source,
        page_path,
        properties,
        formatDateTime(timestamp, '%Y-%m-%d %H:%i:%s') as timestamp
      FROM events
      WHERE project_id = '${projectId}'
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
