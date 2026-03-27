// Utility functions for handling property filters in ClickHouse queries

export interface PropertyFilter {
  key: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
  value: string;
}

export function escapeSQLString(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function sqlStringLiteral(value: string): string {
  return `'${escapeSQLString(value)}'`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

/**
 * ClickHouse-friendly UTC DateTime64 literal.
 *
 * ClickHouse DateTime64 comparisons can fail if we pass raw ISO strings with `Z`.
 * This helper converts an ISO date into:
 *   toDateTime64('YYYY-MM-DD HH:MM:SS.mmm', 3, 'UTC')
 */
export function sqlDateTime64UTC(iso: string): string {
  const ms = Date.parse(iso);
  const d = new Date(Number.isFinite(ms) ? ms : Date.now());
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  const mmm = pad3(d.getUTCMilliseconds());
  const s = `${y}-${mo}-${da} ${hh}:${mm}:${ss}.${mmm}`;
  return `toDateTime64(${sqlStringLiteral(s)}, 3, 'UTC')`;
}

function safePropertyKey(key: string): string {
  const cleaned = String(key).replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned || "_";
}

export function safeISODate(value: string | null | undefined, fallbackISO: string): string {
  if (!value) return fallbackISO;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return fallbackISO;
  return new Date(ms).toISOString();
}

/**
 * Convert property filter to ClickHouse SQL condition
 */
export function propertyFilterToSQL(filter: PropertyFilter): string {
  const { key, operator, value } = filter;
  const safeKey = safePropertyKey(key);
  
  switch (operator) {
    case 'eq':
      return `JSONExtractString(properties, '$.${safeKey}') = ${sqlStringLiteral(value)}`;
    case 'neq':
      return `JSONExtractString(properties, '$.${safeKey}') != ${sqlStringLiteral(value)}`;
    case 'contains':
      return `JSONExtractString(properties, '$.${safeKey}') LIKE '%${escapeSQLString(String(value).replace(/[%_]/g, "\\$&"))}%'`;
    case 'gt':
      return `toFloat64OrNull(JSONExtractString(properties, '$.${safeKey}')) > ${Number.parseFloat(value)}`;
    case 'lt':
      return `toFloat64OrNull(JSONExtractString(properties, '$.${safeKey}')) < ${Number.parseFloat(value)}`;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

/**
 * Parse URL search params to extract property filters
 */
export function parsePropertyFiltersFromURL(searchParams: URLSearchParams): PropertyFilter[] {
  const filters: PropertyFilter[] = [];
  
  searchParams.forEach((value, key) => {
    if (key.startsWith('prop_')) {
      const propKey = key.replace('prop_', '');
      const [operator, propValue] = value.split(':');
      
      if (operator && propValue && ['eq', 'neq', 'contains', 'gt', 'lt'].includes(operator)) {
        filters.push({
          key: propKey,
          operator: operator as PropertyFilter['operator'],
          value: propValue,
        });
      }
    }
  });
  
  return filters;
}

/**
 * Build WHERE clause conditions from property filters
 */
export function buildPropertyFilterConditions(filters: PropertyFilter[]): string[] {
  return filters.map(propertyFilterToSQL);
}

/**
 * Check if a ClickHouse query contains property filters
 */
export function hasPropertyFilters(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    if (key.startsWith('prop_')) {
      return true;
    }
  }
  return false;
}

/**
 * Generate user_id aliasing SQL for identity stitching
 * Merges user_id with device_id/session_id from properties to treat same person on different devices as one entity
 * 
 * Usage in SELECT:
 *   SELECT getUserIdAliasSQL() as unified_user_id, ...
 * 
 * Usage in GROUP BY:
 *   GROUP BY getUserIdAliasSQL()
 */
export function getUserIdAliasSQL(): string {
  return `COALESCE(
    nullIf(user_id, ''),
    nullIf(JSONExtractString(properties, '$.device_id'), ''),
    nullIf(JSONExtractString(properties, '$.session_id'), ''),
    'anonymous'
  )`;
}

/**
 * Generate user_id aliasing SQL with custom fallback keys
 * Allows specifying which property keys to use for identity stitching
 * 
 * @param fallbackKeys - Array of property keys to check in order (e.g. ['device_id', 'fingerprint', 'session_id'])
 */
export function getUserIdAliasSQLWithKeys(fallbackKeys: string[]): string {
  const safeFallbacks = fallbackKeys
    .map(key => safePropertyKey(key))
    .map(key => `nullIf(JSONExtractString(properties, '$.${key}'), '')`)
    .join(',\n    ');
  
  return `COALESCE(
    nullIf(user_id, ''),
    ${safeFallbacks},
    'anonymous'
  )`;
}
