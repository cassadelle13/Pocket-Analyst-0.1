import { sqlStringLiteral } from "./propertyFilterUtils";
import { LRUCache } from "lru-cache";

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || "";

// Edge Caching: LRU cache for expensive queries (5 min TTL)
const queryCache = new LRUCache<string, any>({
  max: 100, // Maximum 100 cached queries
  ttl: 5 * 60 * 1000, // 5 minutes TTL
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

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

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: query + " FORMAT JSON",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ClickHouse error: ${errorText}`);
    }

    const data = await response.json();
    return data.data as T[];
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('ClickHouse query timeout after 30 seconds');
    }
    throw error;
  }
}

/**
 * Cached query wrapper for expensive operations
 * Use this for queries that are expensive and can tolerate 5-minute stale data
 */
export async function queryCached<T = Record<string, unknown>>(
  query: string,
  cacheKey: string,
  config?: Partial<ClickHouseConfig>
): Promise<T[]> {
  // Check cache first
  const cached = queryCache.get(cacheKey);
  if (cached !== undefined) {
    return cached as T[];
  }

  // Cache miss - query ClickHouse
  const result = await queryClickHouse<T>(query, config);
  
  // Store in cache
  queryCache.set(cacheKey, result);
  
  return result;
}

export async function executeClickHouse(query: string): Promise<void> {
  const cfg = getClickHouseConfig();
  
  const auth = cfg.password 
    ? `&user=${cfg.user}&password=${cfg.password}` 
    : `&user=${cfg.user}`;
  
  const url = `http://${cfg.host}:${cfg.port}/?database=${cfg.database}${auth}`;

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: query,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ClickHouse error: ${errorText}`);
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('ClickHouse query timeout after 30 seconds');
    }
    throw error;
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
    WHERE project_id = ${sqlStringLiteral(projectId)}
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
    WHERE project_id = ${sqlStringLiteral(projectId)}
      AND timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY date
    ORDER BY date
  `);
}

export async function getRetentionCohorts(projectId: string) {
  const query = `
    WITH first_seen AS (
      SELECT 
        user_id,
        min(toDate(timestamp)) as cohort_date
      FROM events
      WHERE project_id = ${sqlStringLiteral(projectId)}
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
    LEFT JOIN events e ON fs.user_id = e.user_id AND e.project_id = ${sqlStringLiteral(projectId)}
    GROUP BY fs.cohort_date
    ORDER BY fs.cohort_date DESC
    LIMIT 10
  `;
  
  // Use cached query with 5-minute TTL
  return queryCached(query, `retention_cohorts:${projectId}`);
}

/**
 * Clear cache for specific key or all cache
 */
export function clearQueryCache(key?: string) {
  if (key) {
    queryCache.delete(key);
  } else {
    queryCache.clear();
  }
}
