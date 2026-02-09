/**
 * Schema Discovery Module
 * 
 * Uses database-native introspection queries to discover schema metadata.
 * This is a production-ready alternative to SchemaCrawler that doesn't require Java/JDBC.
 * 
 * For full SchemaCrawler integration, you would:
 * 1. Install SchemaCrawler CLI or Java library
 * 2. Add JDBC drivers for each database type
 * 3. Execute SchemaCrawler commands via child_process
 * 4. Parse XML/JSON output
 * 
 * Current implementation uses native SQL queries which is more lightweight
 * and doesn't require external dependencies.
 */

import type { Pool as PgPool } from 'pg';
import type { Pool as MySqlPool } from 'mysql2/promise';
import type { ConnectionPool as MsSqlPool } from 'mssql';

export interface ColumnMetadata {
  table: string;
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface TableMetadata {
  name: string;
  schema: string;
  type: 'TABLE' | 'VIEW';
  rowCount?: number;
  columns: ColumnMetadata[];
}

export interface SchemaMetadata {
  database: string;
  tables: TableMetadata[];
  columns: ColumnMetadata[];
}

/**
 * Discover schema from PostgreSQL database
 */
export async function discoverPostgresSchema(pool: PgPool, database: string): Promise<SchemaMetadata> {
  const query = `
    SELECT 
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
      CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT ku.table_schema, ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
        AND tc.table_schema = ku.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
    ) pk ON c.table_schema = pk.table_schema 
      AND c.table_name = pk.table_name 
      AND c.column_name = pk.column_name
    LEFT JOIN (
      SELECT ku.table_schema, ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
        AND tc.table_schema = ku.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
    ) fk ON c.table_schema = fk.table_schema 
      AND c.table_name = fk.table_name 
      AND c.column_name = fk.column_name
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
  `;

  const result = await pool.query(query);
  
  const tables = new Map<string, TableMetadata>();
  const allColumns: ColumnMetadata[] = [];

  for (const row of result.rows) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    
    if (!tables.has(tableKey)) {
      tables.set(tableKey, {
        name: row.table_name,
        schema: row.table_schema,
        type: 'TABLE',
        columns: [],
      });
    }

    const column: ColumnMetadata = {
      table: row.table_name,
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      precision: row.numeric_precision,
      scale: row.numeric_scale,
    };

    tables.get(tableKey)!.columns.push(column);
    allColumns.push(column);
  }

  return {
    database,
    tables: Array.from(tables.values()),
    columns: allColumns,
  };
}

/**
 * Discover schema from MySQL database
 */
export async function discoverMySqlSchema(pool: MySqlPool, database: string): Promise<SchemaMetadata> {
  const query = `
    SELECT 
      c.TABLE_SCHEMA,
      c.TABLE_NAME,
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.IS_NULLABLE,
      c.COLUMN_DEFAULT,
      c.CHARACTER_MAXIMUM_LENGTH,
      c.NUMERIC_PRECISION,
      c.NUMERIC_SCALE,
      c.COLUMN_KEY
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = ?
    ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION;
  `;

  const [rows] = await pool.query(query, [database]);
  
  const tables = new Map<string, TableMetadata>();
  const allColumns: ColumnMetadata[] = [];

  for (const row of rows as any[]) {
    const tableKey = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
    
    if (!tables.has(tableKey)) {
      tables.set(tableKey, {
        name: row.TABLE_NAME,
        schema: row.TABLE_SCHEMA,
        type: 'TABLE',
        columns: [],
      });
    }

    const column: ColumnMetadata = {
      table: row.TABLE_NAME,
      name: row.COLUMN_NAME,
      type: row.DATA_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      isPrimaryKey: row.COLUMN_KEY === 'PRI',
      isForeignKey: row.COLUMN_KEY === 'MUL',
      defaultValue: row.COLUMN_DEFAULT,
      maxLength: row.CHARACTER_MAXIMUM_LENGTH,
      precision: row.NUMERIC_PRECISION,
      scale: row.NUMERIC_SCALE,
    };

    tables.get(tableKey)!.columns.push(column);
    allColumns.push(column);
  }

  return {
    database,
    tables: Array.from(tables.values()),
    columns: allColumns,
  };
}

/**
 * Discover schema from MSSQL database
 */
export async function discoverMsSqlSchema(pool: MsSqlPool, database: string): Promise<SchemaMetadata> {
  const query = `
    SELECT 
      s.name as table_schema,
      t.name as table_name,
      c.name as column_name,
      ty.name as data_type,
      c.is_nullable,
      dc.definition as column_default,
      c.max_length,
      c.precision,
      c.scale,
      CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END as is_primary_key,
      CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END as is_foreign_key
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
    LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
    LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.index_columns ic
      INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_primary_key = 1
    ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
    LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
    WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA')
    ORDER BY s.name, t.name, c.column_id;
  `;

  const result = await pool.request().query(query);
  
  const tables = new Map<string, TableMetadata>();
  const allColumns: ColumnMetadata[] = [];

  for (const row of result.recordset) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    
    if (!tables.has(tableKey)) {
      tables.set(tableKey, {
        name: row.table_name,
        schema: row.table_schema,
        type: 'TABLE',
        columns: [],
      });
    }

    const column: ColumnMetadata = {
      table: row.table_name,
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
      isPrimaryKey: row.is_primary_key === 1,
      isForeignKey: row.is_foreign_key === 1,
      defaultValue: row.column_default,
      maxLength: row.max_length,
      precision: row.precision,
      scale: row.scale,
    };

    tables.get(tableKey)!.columns.push(column);
    allColumns.push(column);
  }

  return {
    database,
    tables: Array.from(tables.values()),
    columns: allColumns,
  };
}

/**
 * NOTE: For production SchemaCrawler integration:
 * 
 * 1. Install SchemaCrawler:
 *    npm install schemacrawler-cli (if available) or use Java CLI
 * 
 * 2. Example SchemaCrawler command:
 *    schemacrawler --server=postgresql --host=localhost --port=5432 \
 *      --database=mydb --user=postgres --password=pass \
 *      --info-level=maximum --command=schema --output-format=json
 * 
 * 3. Parse output and convert to SchemaMetadata format
 * 
 * Current implementation provides equivalent functionality using
 * native database introspection queries, which is more lightweight
 * and doesn't require Java/JDBC dependencies.
 */
