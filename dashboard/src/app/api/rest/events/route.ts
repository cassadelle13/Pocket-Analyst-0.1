import { NextRequest, NextResponse } from "next/server";

import { sqlStringLiteral } from "../../../../lib/propertyFilterUtils";

import { apiClient } from "../../../../lib/api-client";


const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

type Order = "ASC" | "DESC";

async function queryClickHouse(query: string) {
  const url = `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?database=${CLICKHOUSE_DATABASE}`;

  const response = await apiClient.post(
    url,
    query + " FORMAT JSON",
    {
      headers: {
        "Content-Type": "text/plain",
      },
    }
  );

  if (response.error) {
    throw new Error(`API Client error: ${response.error}`);
  }

  return response.data?.data as Array<Record<string, unknown>> || [];
}

function parseIntOr(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const projectId = sp.get("projectId") || "proj_001";
  const start = parseIntOr(sp.get("_start"), 0);
  const end = parseIntOr(sp.get("_end"), start + 25);
  const limit = Math.max(0, end - start);

  const sortFieldRaw = sp.get("_sort") || "timestamp";
  const allowedSortFields = new Set(["timestamp", "event_name", "user_id"]);
  const sortField = allowedSortFields.has(sortFieldRaw) ? sortFieldRaw : "timestamp";
  const sortOrder = (sp.get("_order") || "DESC").toUpperCase() as Order;
  const order: Order = sortOrder === "ASC" ? "ASC" : "DESC";

  try {
    const totalRows = await queryClickHouse(`
      SELECT count() AS total
      FROM events
      WHERE project_id = ${sqlStringLiteral(projectId)}
    `);

    const total = Number(totalRows?.[0]?.total ?? 0);

    const events = await queryClickHouse(`
      SELECT
        event_name,
        user_id,
        properties,
        timestamp
      FROM events
      WHERE project_id = ${sqlStringLiteral(projectId)}
      ORDER BY ${sortField} ${order}
      LIMIT ${limit}
      OFFSET ${start}
    `);

    const withId = events.map((row, idx) => ({
      id: start + idx + 1,
      ...row,
    }));

    return new NextResponse(JSON.stringify(withId), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Total-Count": total.toString(),
      },
    });
  } catch (error) {
    console.error("REST events error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}
