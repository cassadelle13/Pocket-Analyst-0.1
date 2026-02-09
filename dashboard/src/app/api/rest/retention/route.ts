import { NextRequest, NextResponse } from "next/server";

import type { RetentionCell } from "../../../../types/api";


import {

  parsePropertyFiltersFromURL,
  buildPropertyFilterConditions,
  safeISODate,
  sqlStringLiteral,
} from "../../../../lib/propertyFilterUtils";

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
        throw new Error(await response.text());
      }

      const data = await response.json();
      return data.data as Array<Record<string, unknown>>;
    } catch (err) {
      console.warn(`ClickHouse unavailable at ${host}:${port}:`, err);
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const days = Math.max(1, Math.min(90, Number(sp.get("days") ?? "30")));

  const startDate = safeISODate(
    sp.get("startDate"),
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());

  const propertyFilters = parsePropertyFiltersFromURL(sp);
  const propertyFilterConditions = buildPropertyFilterConditions(propertyFilters);

  const baseWhere = [
    `timestamp >= ${sqlStringLiteral(startDate)}`,
    `timestamp <= ${sqlStringLiteral(endDate)}`,
    ...propertyFilterConditions,
  ];
  const whereClause = baseWhere.length ? `WHERE ${baseWhere.join(" AND ")}` : "";

  try {
    const rows = await queryClickHouse(`
      WITH
        cohorts AS (
          SELECT
            user_id,
            toDate(min(timestamp)) AS cohort
          FROM events
          ${whereClause}
          GROUP BY user_id
        ),
        activity AS (
          SELECT
            c.cohort AS cohort,
            dateDiff('day', c.cohort, toDate(e.timestamp)) AS day,
            uniqExact(e.user_id) AS users
          FROM events e
          INNER JOIN cohorts c ON e.user_id = c.user_id
          ${whereClause}
          GROUP BY cohort, day
        ),
        sizes AS (
          SELECT cohort, count() AS cohort_users
          FROM cohorts
          GROUP BY cohort
        )
      SELECT
        a.cohort AS cohort,
        a.day AS day,
        if(s.cohort_users = 0, 0, a.users / s.cohort_users) AS retentionRate,
        a.users AS users
      FROM activity a
      INNER JOIN sizes s ON a.cohort = s.cohort
      WHERE a.day >= 0 AND a.day <= ${days}
      ORDER BY cohort DESC, day ASC
    `);

    const data: RetentionCell[] = rows.map((row) => ({
      cohort: String(row.cohort ?? ""),
      day: Number(row.day ?? 0),
      retentionRate: Number(row.retentionRate ?? 0),
      users: Number(row.users ?? 0),
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    console.error("REST retention error:", error);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
