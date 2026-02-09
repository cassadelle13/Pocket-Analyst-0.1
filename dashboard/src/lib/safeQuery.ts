/**
 * Safe Query Builder
 * Prevents SQL injection by using parameterized queries
 */

export interface QueryParams {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Builds a safe parameterized query for ClickHouse
 * @param query SQL query with {param:Type} placeholders
 * @param params Parameters object
 * @returns Query object with query_params
 */
export function buildSafeQuery(query: string, params: QueryParams = {}) {
  return {
    query,
    query_params: params,
  };
}

/**
 * Escapes a table/column name for safe use in queries
 * Only allows alphanumeric characters, underscores, and dots
 */
export function escapeIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_\.]+$/.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}

/**
 * Validates and escapes a table name
 */
export function safeTableName(tableName: string): string {
  return escapeIdentifier(tableName);
}

/**
 * Validates and escapes a column name
 */
export function safeColumnName(columnName: string): string {
  return escapeIdentifier(columnName);
}

/**
 * Example safe queries
 */
export const SafeQueries = {
  /**
   * Select events with filters
   */
  selectEvents: (tableName: string, userId?: string, startDate?: string, endDate?: string) => {
    const table = safeTableName(tableName);
    let query = `SELECT * FROM ${table} WHERE 1=1`;
    const params: QueryParams = {};

    if (userId) {
      query += ` AND user_id = {userId:String}`;
      params.userId = userId;
    }

    if (startDate) {
      query += ` AND timestamp >= {startDate:DateTime}`;
      params.startDate = startDate;
    }

    if (endDate) {
      query += ` AND timestamp <= {endDate:DateTime}`;
      params.endDate = endDate;
    }

    query += ` LIMIT 1000`;

    return buildSafeQuery(query, params);
  },

  /**
   * Count events
   */
  countEvents: (tableName: string, eventName?: string) => {
    const table = safeTableName(tableName);
    let query = `SELECT COUNT(*) as count FROM ${table}`;
    const params: QueryParams = {};

    if (eventName) {
      query += ` WHERE event_name = {eventName:String}`;
      params.eventName = eventName;
    }

    return buildSafeQuery(query, params);
  },

  /**
   * Get unique users
   */
  uniqueUsers: (tableName: string, startDate?: string, endDate?: string) => {
    const table = safeTableName(tableName);
    let query = `SELECT COUNT(DISTINCT user_id) as unique_users FROM ${table} WHERE 1=1`;
    const params: QueryParams = {};

    if (startDate) {
      query += ` AND timestamp >= {startDate:DateTime}`;
      params.startDate = startDate;
    }

    if (endDate) {
      query += ` AND timestamp <= {endDate:DateTime}`;
      params.endDate = endDate;
    }

    return buildSafeQuery(query, params);
  },

  /**
   * Insert event (safe)
   */
  insertEvent: (tableName: string, event: any) => {
    const table = safeTableName(tableName);
    const query = `INSERT INTO ${table} FORMAT JSONEachRow`;
    
    return {
      query,
      values: [event], // ClickHouse will handle escaping in JSONEachRow format
    };
  },
};

/**
 * Validates query parameters to prevent injection
 */
export function validateQueryParams(params: QueryParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Check for suspicious patterns
      if (value.includes('--') || value.includes(';') || value.includes('/*')) {
        throw new Error(`Suspicious pattern in parameter ${key}: ${value}`);
      }
    }
  }
}
