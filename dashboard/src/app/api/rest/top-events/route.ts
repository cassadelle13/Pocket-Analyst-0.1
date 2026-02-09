import { NextRequest, NextResponse } from "next/server";

import {

  parsePropertyFiltersFromURL,
  buildPropertyFilterConditions,
  safeISODate,
  sqlStringLiteral,
} from "../../../../lib/propertyFilterUtils";

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
  const startDate = safeISODate(
    sp.get("startDate"),
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());
  const window = sp.get("window") || "30 DAY";
  const limit = Number.parseInt(sp.get("limit") || "10", 10) || 10;

  // Parse property filters from URL
  const propertyFilters = parsePropertyFiltersFromURL(sp);
  const propertyFilterConditions = buildPropertyFilterConditions(propertyFilters);

  // Build WHERE clause
  const whereConditions = [
    `timestamp >= ${sqlStringLiteral(startDate)}`,
    `timestamp <= ${sqlStringLiteral(endDate)}`,
    ...propertyFilterConditions
  ];

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const rows = await queryClickHouse(`
    SELECT
      event_name AS name,
      count() AS value
    FROM events
    ${whereClause}
    GROUP BY event_name
    ORDER BY value DESC
    LIMIT ${limit}
  `);

  const withId = rows.map((row) => ({ id: String(row.name ?? ""), ...row }));

  return new NextResponse(JSON.stringify(withId), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Total-Count": String(withId.length),
    },
  });
}
