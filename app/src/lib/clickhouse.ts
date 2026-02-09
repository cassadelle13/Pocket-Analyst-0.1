const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || "";

export interface ClickHouseConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

export function getClickHouseConfig(): ClickHouseConfig {
  return {
    host: CLICKHOUSE_HOST,
    port: CLICKHOUSE_PORT,
    database: CLICKHOUSE_DATABASE,
    user: CLICKHOUSE_USER,
    password: CLICKHOUSE_PASSWORD,
  };
}

export async function queryClickHouse<T = Record<string, unknown>>(
  query: string,
  config?: Partial<ClickHouseConfig>
): Promise<T[]> {
  const cfg = { ...getClickHouseConfig(), ...config };
  
  const auth = cfg.password 
    ? `&user=${cfg.user}&password=${cfg.password}` 
    : `&user=${cfg.user}`;
  
  const url = `http://${cfg.host}:${cfg.port}/?database=${cfg.database}${auth}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: query + " FORMAT JSON",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickHouse error: ${errorText}`);
  }

  const data = await response.json();
  return data.data as T[];
}

export async function executeClickHouse(query: string): Promise<void> {
  const cfg = getClickHouseConfig();
  
  const auth = cfg.password 
    ? `&user=${cfg.user}&password=${cfg.password}` 
    : `&user=${cfg.user}`;
  
  const url = `http://${cfg.host}:${cfg.port}/?database=${cfg.database}${auth}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: query,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickHouse error: ${errorText}`);
  }
}

// Helper functions for common queries
export async function getRecentEvents(projectId: string, limit = 10) {
  return queryClickHouse(`
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
}

export async function getDailyMetrics(projectId: string, days = 7) {
  return queryClickHouse(`
    SELECT 
      toDate(timestamp) as date,
      count() as events,
      uniqExact(user_id) as users,
      uniqExact(session_id) as sessions
    FROM events
    WHERE project_id = '${projectId}'
      AND timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY date
    ORDER BY date
  `);
}

export async function getRetentionCohorts(projectId: string) {
  return queryClickHouse(`
    WITH first_seen AS (
      SELECT 
        user_id,
        min(toDate(timestamp)) as cohort_date
      FROM events
      WHERE project_id = '${projectId}'
      GROUP BY user_id
    )
    SELECT 
      fs.cohort_date,
      count(DISTINCT fs.user_id) as cohort_size,
      countIf(dateDiff('day', fs.cohort_date, toDate(e.timestamp)) = 1) as d1,
      countIf(dateDiff('day', fs.cohort_date, toDate(e.timestamp)) = 3) as d3,
      countIf(dateDiff('day', fs.cohort_date, toDate(e.timestamp)) = 7) as d7,
      countIf(dateDiff('day', fs.cohort_date, toDate(e.timestamp)) = 14) as d14,
      countIf(dateDiff('day', fs.cohort_date, toDate(e.timestamp)) = 30) as d30
    FROM first_seen fs
    LEFT JOIN events e ON fs.user_id = e.user_id AND e.project_id = '${projectId}'
    GROUP BY fs.cohort_date
    ORDER BY fs.cohort_date DESC
    LIMIT 10
  `);
}
