/**
 * Type Classifier
 * 
 * Rules-based classification of SQL column types into semantic categories
 */

import type { ColumnMetadata } from './types';

type Classification = 'dimension' | 'measure' | 'timeField';

/**
 * Numeric types that represent measures (aggregatable values)
 */
const MEASURE_TYPES = new Set([
  // Integer types
  'int', 'integer', 'int2', 'int4', 'int8', 'int16', 'int32', 'int64', 'int128', 'int256',
  'smallint', 'mediumint', 'bigint', 'tinyint',
  'uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256',
  
  // Floating point types
  'float', 'float32', 'float64', 'double', 'real',
  'decimal', 'numeric', 'number',
  
  // ClickHouse specific
  'decimal32', 'decimal64', 'decimal128', 'decimal256',
]);

/**
 * Date/time types
 */
const TIME_TYPES = new Set([
  // Standard SQL
  'date', 'datetime', 'timestamp', 'time',
  'timestamptz', 'datetime2', 'smalldatetime', 'datetimeoffset',
  
  // ClickHouse specific
  'datetime64', 'date32',
]);

/**
 * String/categorical types (dimensions)
 */
const DIMENSION_TYPES = new Set([
  // String types
  'string', 'varchar', 'char', 'text', 'nvarchar', 'nchar', 'ntext',
  'tinytext', 'mediumtext', 'longtext',
  
  // Enum types
  'enum', 'enum8', 'enum16',
  
  // ClickHouse specific
  'fixedstring', 'lowcardinality',
  
  // UUID (treated as dimension)
  'uuid',
  
  // Boolean (categorical)
  'bool', 'boolean',
]);

/**
 * Normalize SQL type string for comparison
 * Removes size specifiers, nullability, and converts to lowercase
 */
function normalizeType(sqlType: string): string {
  return sqlType
    .toLowerCase()
    .replace(/\(.*?\)/g, '')  // Remove size: varchar(255) → varchar
    .replace(/\s+/g, '')       // Remove whitespace
    .replace(/nullable/g, '')  // Remove nullable keyword
    .trim();
}

/**
 * Classify a single column based on its SQL type
 */
export function classifyColumn(column: ColumnMetadata): Classification {
  const normalizedType = normalizeType(column.type);
  
  // Check time types first (most specific)
  if (TIME_TYPES.has(normalizedType)) {
    return 'timeField';
  }
  
  // Check measure types (numeric)
  if (MEASURE_TYPES.has(normalizedType)) {
    return 'measure';
  }
  
  // Check dimension types (string/categorical)
  if (DIMENSION_TYPES.has(normalizedType)) {
    return 'dimension';
  }
  
  // Fallback: check for common patterns in type name
  if (normalizedType.includes('int') || normalizedType.includes('float') || 
      normalizedType.includes('decimal') || normalizedType.includes('numeric')) {
    return 'measure';
  }
  
  if (normalizedType.includes('date') || normalizedType.includes('time')) {
    return 'timeField';
  }
  
  // Default: treat as dimension (safest fallback for unknown types)
  return 'dimension';
}

/**
 * Batch classify multiple columns
 */
export function classifyColumns(columns: ColumnMetadata[]): Map<string, Classification> {
  const classifications = new Map<string, Classification>();
  
  for (const column of columns) {
    const key = `${column.table}.${column.name}`;
    classifications.set(key, classifyColumn(column));
  }
  
  return classifications;
}
