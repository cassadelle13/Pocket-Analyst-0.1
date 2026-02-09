import { NextRequest, NextResponse } from "next/server";

import type { EventRow } from "../../../../types/api";

import { sqlStringLiteral } from "../../../../lib/propertyFilterUtils";

import { detectFormat, createSerializedResponse } from "../../../../lib/serialization";


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
  try {
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get("page") || "1", 10);
    const pageSize = parseInt(sp.get("pageSize") || "50", 10);
    const offset = (page - 1) * pageSize;
    const excludeProperties = sp.get("exclude_properties") === "true";

    // Get filters
    const eventName = sp.get("eventName") || "";
    const userId = sp.get("userId") || "";
    const source = sp.get("source") || "";

    // Build WHERE clause
    const whereConditions = [];
    if (eventName) whereConditions.push(`event_name = ${sqlStringLiteral(eventName)}`);
    if (userId) whereConditions.push(`user_id = ${sqlStringLiteral(userId)}`);
    if (source) whereConditions.push(`JSONExtractString(properties, 'source') = ${sqlStringLiteral(source)}`);

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `
      SELECT count() as total
      FROM events
      ${whereClause}
    `;

    const countResult = await queryClickHouse(countQuery);
    const total = Number(countResult[0]?.total) || 0;

    // Get events with pagination
    const eventsQuery = `
      SELECT
        toString(generateUUIDv4()) as id,
        event_name,
        user_id,
        toString(timestamp) as timestamp
        ${excludeProperties ? "" : ", toString(properties) as properties"}
      FROM events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const rows = await queryClickHouse(eventsQuery);

    const events = rows.map((row) => {
      let properties: Record<string, unknown> = {};
      if (!excludeProperties) {
        try {
          properties = JSON.parse(String(row.properties || "{}"));
        } catch {
          properties = {};
        }
      }

      return {
        event_id: String(row.id ?? ""),
        event_name: String(row.event_name ?? ""),
        user_id: String(row.user_id ?? ""),
        session_id: "", // Not in query, add if needed
        timestamp: new Date(String(row.timestamp ?? "")).getTime() || Date.now(),
        device_id: "",
        platform: "",
        country: "",
        city: "",
        properties,
      };
    });

    // Detect serialization format from Accept header
    const format = detectFormat(request.headers);

    // Return in Protobuf or JSON based on Accept header
    const responseData = {
      events,
      total_count: total,
      query_time_ms: 0, // Could add actual query time tracking
    };

    return await createSerializedResponse(responseData, {
      format,
      headers: {
        "X-Total-Count": String(total),
        "X-Page": String(page),
        "X-Page-Size": String(pageSize),
      },
    });
  } catch (error) {
    console.error("Events API failed:", error);
    return NextResponse.json(
      { events: [], total_count: 0, query_time_ms: 0 },
      { status: 200 }
    );
  }
}
