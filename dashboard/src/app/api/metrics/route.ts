import { NextRequest, NextResponse } from "next/server";


const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "storage";
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
  try {
    // Get total users
    const totalUsers = await queryClickHouse(`
      SELECT uniqExact(user_id) as count
      FROM events
    `);

    // Get active users (last 7 days)
    const activeUsers = await queryClickHouse(`
      SELECT uniqExact(user_id) as count
      FROM events
      WHERE timestamp >= now() - INTERVAL 7 DAY
    `);

    // Get events today
    const eventsToday = await queryClickHouse(`
      SELECT count() as count
      FROM events
      WHERE toDate(timestamp) = today()
    `);

    // Get retention data
    const retention = await queryClickHouse(`
      WITH 
        first_events AS (
          SELECT user_id, min(toDate(timestamp)) as first_date
          FROM events
          GROUP BY user_id
        ),
        user_activity AS (
          SELECT 
            fe.user_id,
            fe.first_date,
            toDate(e.timestamp) as activity_date
          FROM first_events fe
          JOIN events e ON fe.user_id = e.user_id
        )
      SELECT 
        'D1' as day,
        countIf(dateDiff('day', first_date, activity_date) = 1) * 100.0 / count(DISTINCT user_id) as retention
      FROM user_activity
      UNION ALL
      SELECT 
        'D7' as day,
        countIf(dateDiff('day', first_date, activity_date) = 7) * 100.0 / count(DISTINCT user_id) as retention
      FROM user_activity
      UNION ALL
      SELECT 
        'D30' as day,
        countIf(dateDiff('day', first_date, activity_date) = 30) * 100.0 / count(DISTINCT user_id) as retention
      FROM user_activity
    `);

    return NextResponse.json({
      totalUsers: totalUsers[0]?.count || 0,
      activeUsers: activeUsers[0]?.count || 0,
      eventsToday: eventsToday[0]?.count || 0,
      retention: retention || [],
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
