/**
 * Data Sampling Module
 * Smart sampling strategies to load only representative data instead of full tables
 */

export type SamplingMethod = 'random' | 'stratified' | 'time-based' | 'top-n';

export interface SamplingStrategy {
  method: SamplingMethod;
  sampleSize: number;
  conditions?: string;
  timeWindow?: string; // e.g., '7 days', '1 month'
  stratifyColumn?: string; // Column to stratify by
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  estimatedRows?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

/**
 * Determine optimal sampling strategy based on table characteristics
 */
export function determineOptimalSample(
  table: TableSchema,
  totalRows: number
): SamplingStrategy {
  // Small tables: load everything
  if (totalRows < 10000) {
    return {
      method: 'top-n',
      sampleSize: totalRows,
    };
  }

  // Check for timestamp columns
  const timestampColumn = table.columns.find(col =>
    /timestamp|created_at|updated_at|date|time/i.test(col.name)
  );

  if (timestampColumn) {
    // Medium tables with timestamp: recent data
    if (totalRows < 1000000) {
      return {
        method: 'time-based',
        sampleSize: 10000,
        timeWindow: '30 days',
      };
    }
    // Large tables with timestamp: very recent data
    return {
      method: 'time-based',
      sampleSize: 50000,
      timeWindow: '7 days',
    };
  }

  // Check for category/status columns for stratification
  const categoryColumn = table.columns.find(col =>
    /category|status|type|group|segment/i.test(col.name)
  );

  if (categoryColumn && totalRows < 1000000) {
    return {
      method: 'stratified',
      sampleSize: 10000,
      stratifyColumn: categoryColumn.name,
    };
  }

  // Default: random sampling
  const sampleRate = totalRows < 1000000 ? 0.01 : 0.001; // 1% or 0.1%
  return {
    method: 'random',
    sampleSize: Math.min(Math.floor(totalRows * sampleRate), 50000),
  };
}

/**
 * Generate SQL query for sampling based on database type and strategy
 */
export function generateSampleQuery(
  dbType: 'postgres' | 'mysql' | 'mssql',
  table: string,
  strategy: SamplingStrategy,
  schema: TableSchema
): string {
  const { method, sampleSize, timeWindow, stratifyColumn } = strategy;

  switch (method) {
    case 'random':
      return generateRandomSample(dbType, table, sampleSize);

    case 'time-based':
      return generateTimeSample(dbType, table, sampleSize, timeWindow!, schema);

    case 'stratified':
      return generateStratifiedSample(dbType, table, sampleSize, stratifyColumn!, schema);

    case 'top-n':
      return `SELECT * FROM ${table} LIMIT ${sampleSize}`;

    default:
      throw new Error(`Unknown sampling method: ${method}`);
  }
}

function generateRandomSample(
  dbType: 'postgres' | 'mysql' | 'mssql',
  table: string,
  sampleSize: number
): string {
  switch (dbType) {
    case 'postgres':
      // PostgreSQL: TABLESAMPLE for large tables, ORDER BY RANDOM() for small
      return `
        SELECT * FROM ${table}
        TABLESAMPLE SYSTEM (10)
        LIMIT ${sampleSize}
      `;

    case 'mysql':
      // MySQL: ORDER BY RAND() is slow but works
      return `
        SELECT * FROM ${table}
        ORDER BY RAND()
        LIMIT ${sampleSize}
      `;

    case 'mssql':
      // MSSQL: TABLESAMPLE
      return `
        SELECT * FROM ${table}
        TABLESAMPLE (10 PERCENT)
      `;

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

function generateTimeSample(
  dbType: 'postgres' | 'mysql' | 'mssql',
  table: string,
  sampleSize: number,
  timeWindow: string,
  schema: TableSchema
): string {
  // Find timestamp column
  const timestampCol = schema.columns.find(col =>
    /timestamp|created_at|updated_at|date/i.test(col.name)
  );

  if (!timestampCol) {
    throw new Error('No timestamp column found for time-based sampling');
  }

  const colName = timestampCol.name;

  switch (dbType) {
    case 'postgres':
      return `
        SELECT * FROM ${table}
        WHERE ${colName} > NOW() - INTERVAL '${timeWindow}'
        ORDER BY ${colName} DESC
        LIMIT ${sampleSize}
      `;

    case 'mysql':
      return `
        SELECT * FROM ${table}
        WHERE ${colName} > DATE_SUB(NOW(), INTERVAL ${timeWindow})
        ORDER BY ${colName} DESC
        LIMIT ${sampleSize}
      `;

    case 'mssql':
      // Parse timeWindow (e.g., "7 days" -> 7, "days")
      const [amount, unit] = timeWindow.split(' ');
      return `
        SELECT TOP ${sampleSize} * FROM ${table}
        WHERE ${colName} > DATEADD(${unit}, -${amount}, GETDATE())
        ORDER BY ${colName} DESC
      `;

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

function generateStratifiedSample(
  dbType: 'postgres' | 'mysql' | 'mssql',
  table: string,
  sampleSize: number,
  stratifyColumn: string,
  schema: TableSchema
): string {
  // Sample equally from each category
  // This is a simplified version - in production you'd want to:
  // 1. First query to get category counts
  // 2. Calculate samples per category
  // 3. Union queries for each category

  switch (dbType) {
    case 'postgres':
      return `
        WITH ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY ${stratifyColumn} ORDER BY RANDOM()) as rn
          FROM ${table}
        )
        SELECT * FROM ranked
        WHERE rn <= ${Math.floor(sampleSize / 10)}
        LIMIT ${sampleSize}
      `;

    case 'mysql':
      return `
        SELECT * FROM (
          SELECT *,
                 @row_num := IF(@current_cat = ${stratifyColumn}, @row_num + 1, 1) as rn,
                 @current_cat := ${stratifyColumn}
          FROM ${table}, (SELECT @row_num := 0, @current_cat := '') as vars
          ORDER BY ${stratifyColumn}, RAND()
        ) as ranked
        WHERE rn <= ${Math.floor(sampleSize / 10)}
        LIMIT ${sampleSize}
      `;

    case 'mssql':
      return `
        WITH ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY ${stratifyColumn} ORDER BY NEWID()) as rn
          FROM ${table}
        )
        SELECT TOP ${sampleSize} * FROM ranked
        WHERE rn <= ${Math.floor(sampleSize / 10)}
      `;

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

/**
 * Estimate total rows in a table (fast approximate count)
 */
export function generateCountQuery(
  dbType: 'postgres' | 'mysql' | 'mssql',
  table: string
): string {
  switch (dbType) {
    case 'postgres':
      // Use pg_class for fast estimate
      return `
        SELECT reltuples::bigint as estimated_count
        FROM pg_class
        WHERE relname = '${table}'
      `;

    case 'mysql':
      // Use information_schema for estimate
      return `
        SELECT table_rows as estimated_count
        FROM information_schema.tables
        WHERE table_name = '${table}'
      `;

    case 'mssql':
      // Use sys.dm_db_partition_stats
      return `
        SELECT SUM(row_count) as estimated_count
        FROM sys.dm_db_partition_stats
        WHERE object_id = OBJECT_ID('${table}')
        AND index_id IN (0, 1)
      `;

    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

/**
 * Calculate sample statistics
 */
export interface SampleStats {
  totalRows: number;
  sampleRows: number;
  sampleRate: number;
  method: SamplingMethod;
  estimatedAccuracy: number; // 0-1
}

export function calculateSampleStats(
  totalRows: number,
  sampleRows: number,
  method: SamplingMethod
): SampleStats {
  const sampleRate = sampleRows / totalRows;
  
  // Estimate accuracy based on sample size and method
  let estimatedAccuracy = 0.95;
  
  if (method === 'random') {
    // Random sampling is most accurate
    estimatedAccuracy = Math.min(0.99, 0.8 + (sampleRate * 0.19));
  } else if (method === 'time-based') {
    // Time-based might miss patterns in older data
    estimatedAccuracy = 0.85;
  } else if (method === 'stratified') {
    // Stratified is good for categorical analysis
    estimatedAccuracy = 0.90;
  } else if (method === 'top-n') {
    // Top-n is least representative
    estimatedAccuracy = totalRows === sampleRows ? 1.0 : 0.70;
  }

  return {
    totalRows,
    sampleRows,
    sampleRate,
    method,
    estimatedAccuracy,
  };
}
