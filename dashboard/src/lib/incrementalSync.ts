/**
 * Incremental Sync Module
 * Update only new data instead of reloading everything
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';
import { generateSampleQuery, type TableSchema } from './dataSampling';

export type SyncMethod = 'timestamp' | 'id' | 'hash';

export interface SyncState {
  id: string;
  connectionId: string;
  tableName: string;
  syncMethod: SyncMethod;
  lastSyncTimestamp?: Date;
  lastSyncId?: number | string;
  lastSyncHash?: string;
  rowsSynced: number;
  lastSyncAt: Date;
  nextSyncAt?: Date;
  status: 'idle' | 'running' | 'error';
  errorMessage?: string;
}

export interface SyncJob {
  id: string;
  connectionId: string;
  tableName: string;
  schedule: 'realtime' | 'hourly' | 'daily' | 'manual';
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

/**
 * Initialize sync tables
 */
export async function initSyncTables(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id UUID NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      sync_method VARCHAR(50) NOT NULL,
      last_sync_timestamp TIMESTAMP,
      last_sync_id VARCHAR(255),
      last_sync_hash VARCHAR(255),
      rows_synced BIGINT NOT NULL DEFAULT 0,
      last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
      next_sync_at TIMESTAMP,
      status VARCHAR(50) NOT NULL DEFAULT 'idle',
      error_message TEXT,
      UNIQUE(connection_id, table_name)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_state_connection ON sync_state(connection_id);
    CREATE INDEX IF NOT EXISTS idx_sync_state_status ON sync_state(status);
    CREATE INDEX IF NOT EXISTS idx_sync_state_next_sync ON sync_state(next_sync_at);

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id UUID NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      schedule VARCHAR(50) NOT NULL DEFAULT 'manual',
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_run TIMESTAMP,
      next_run TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(connection_id, table_name)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_connection ON sync_jobs(connection_id);
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_next_run ON sync_jobs(next_run);
  `);
}

/**
 * Detect best sync method for a table
 */
export function detectSyncMethod(schema: TableSchema): SyncMethod {
  // Check for timestamp columns
  const hasTimestamp = schema.columns.some(col =>
    /updated_at|modified_at|last_modified|timestamp/i.test(col.name)
  );

  if (hasTimestamp) {
    return 'timestamp';
  }

  // Check for auto-increment ID
  const hasAutoId = schema.columns.some(col =>
    col.isPrimaryKey && /^id$/i.test(col.name)
  );

  if (hasAutoId) {
    return 'id';
  }

  // Fallback: hash-based (least efficient)
  return 'hash';
}

/**
 * Generate incremental query based on sync method
 */
export function generateIncrementalQuery(
  dbType: 'postgres' | 'mysql' | 'mssql',
  tableName: string,
  syncState: SyncState,
  schema: TableSchema,
  limit: number = 10000
): string {
  switch (syncState.syncMethod) {
    case 'timestamp': {
      const timestampCol = schema.columns.find(col =>
        /updated_at|modified_at|last_modified|timestamp/i.test(col.name)
      );

      if (!timestampCol || !syncState.lastSyncTimestamp) {
        throw new Error('Timestamp column or last sync timestamp not found');
      }

      const tsValue = syncState.lastSyncTimestamp.toISOString();

      switch (dbType) {
        case 'postgres':
          return `
            SELECT * FROM ${tableName}
            WHERE ${timestampCol.name} > '${tsValue}'::timestamp
            ORDER BY ${timestampCol.name} ASC
            LIMIT ${limit}
          `;
        case 'mysql':
          return `
            SELECT * FROM ${tableName}
            WHERE ${timestampCol.name} > '${tsValue}'
            ORDER BY ${timestampCol.name} ASC
            LIMIT ${limit}
          `;
        case 'mssql':
          return `
            SELECT TOP ${limit} * FROM ${tableName}
            WHERE ${timestampCol.name} > '${tsValue}'
            ORDER BY ${timestampCol.name} ASC
          `;
      }
      break;
    }

    case 'id': {
      const idCol = schema.columns.find(col =>
        col.isPrimaryKey && /^id$/i.test(col.name)
      );

      if (!idCol || !syncState.lastSyncId) {
        throw new Error('ID column or last sync ID not found');
      }

      switch (dbType) {
        case 'postgres':
        case 'mysql':
          return `
            SELECT * FROM ${tableName}
            WHERE ${idCol.name} > ${syncState.lastSyncId}
            ORDER BY ${idCol.name} ASC
            LIMIT ${limit}
          `;
        case 'mssql':
          return `
            SELECT TOP ${limit} * FROM ${tableName}
            WHERE ${idCol.name} > ${syncState.lastSyncId}
            ORDER BY ${idCol.name} ASC
          `;
      }
      break;
    }

    case 'hash': {
      // Hash-based sync is complex and requires comparing entire table
      // For now, fallback to full reload with limit
      return `SELECT * FROM ${tableName} LIMIT ${limit}`;
    }
  }

  throw new Error(`Unsupported sync method: ${syncState.syncMethod}`);
}

/**
 * Create or update sync state
 */
export async function upsertSyncState(
  connectionId: string,
  tableName: string,
  syncMethod: SyncMethod,
  lastValue?: Date | number | string
): Promise<SyncState> {
  const pool = getDataTalkMetaPool();

  let lastSyncTimestamp: Date | null = null;
  let lastSyncId: string | null = null;
  let lastSyncHash: string | null = null;

  if (syncMethod === 'timestamp' && lastValue instanceof Date) {
    lastSyncTimestamp = lastValue;
  } else if (syncMethod === 'id' && (typeof lastValue === 'number' || typeof lastValue === 'string')) {
    lastSyncId = String(lastValue);
  } else if (syncMethod === 'hash' && typeof lastValue === 'string') {
    lastSyncHash = lastValue;
  }

  const result = await pool.query(
    `
    INSERT INTO sync_state 
      (connection_id, table_name, sync_method, last_sync_timestamp, last_sync_id, last_sync_hash, last_sync_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (connection_id, table_name)
    DO UPDATE SET
      sync_method = EXCLUDED.sync_method,
      last_sync_timestamp = EXCLUDED.last_sync_timestamp,
      last_sync_id = EXCLUDED.last_sync_id,
      last_sync_hash = EXCLUDED.last_sync_hash,
      last_sync_at = NOW(),
      status = 'idle'
    RETURNING *
    `,
    [connectionId, tableName, syncMethod, lastSyncTimestamp, lastSyncId, lastSyncHash]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    connectionId: row.connection_id,
    tableName: row.table_name,
    syncMethod: row.sync_method,
    lastSyncTimestamp: row.last_sync_timestamp,
    lastSyncId: row.last_sync_id,
    lastSyncHash: row.last_sync_hash,
    rowsSynced: parseInt(row.rows_synced),
    lastSyncAt: row.last_sync_at,
    nextSyncAt: row.next_sync_at,
    status: row.status,
    errorMessage: row.error_message,
  };
}

/**
 * Get sync state for a table
 */
export async function getSyncState(
  connectionId: string,
  tableName: string
): Promise<SyncState | null> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `SELECT * FROM sync_state WHERE connection_id = $1 AND table_name = $2`,
    [connectionId, tableName]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    connectionId: row.connection_id,
    tableName: row.table_name,
    syncMethod: row.sync_method,
    lastSyncTimestamp: row.last_sync_timestamp,
    lastSyncId: row.last_sync_id,
    lastSyncHash: row.last_sync_hash,
    rowsSynced: parseInt(row.rows_synced),
    lastSyncAt: row.last_sync_at,
    nextSyncAt: row.next_sync_at,
    status: row.status,
    errorMessage: row.error_message,
  };
}

/**
 * Update sync state after successful sync
 */
export async function updateSyncState(
  stateId: string,
  rowsSynced: number,
  lastValue?: Date | number | string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  // Determine which column to update based on value type
  let updateClause = 'rows_synced = rows_synced + $2, last_sync_at = NOW(), status = \'idle\'';
  const params: any[] = [stateId, rowsSynced];

  if (lastValue instanceof Date) {
    updateClause += ', last_sync_timestamp = $3';
    params.push(lastValue);
  } else if (typeof lastValue === 'number' || typeof lastValue === 'string') {
    updateClause += ', last_sync_id = $3';
    params.push(String(lastValue));
  }

  await pool.query(
    `UPDATE sync_state SET ${updateClause} WHERE id = $1`,
    params
  );
}

/**
 * Mark sync as running
 */
export async function markSyncRunning(stateId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE sync_state SET status = 'running' WHERE id = $1`,
    [stateId]
  );
}

/**
 * Mark sync as error
 */
export async function markSyncError(stateId: string, errorMessage: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE sync_state SET status = 'error', error_message = $2 WHERE id = $1`,
    [stateId, errorMessage]
  );
}

/**
 * Create sync job
 */
export async function createSyncJob(
  connectionId: string,
  tableName: string,
  schedule: SyncJob['schedule'] = 'manual'
): Promise<SyncJob> {
  const pool = getDataTalkMetaPool();

  // Calculate next run based on schedule
  let nextRun: Date | null = null;
  if (schedule !== 'manual') {
    nextRun = calculateNextRun(schedule);
  }

  const result = await pool.query(
    `
    INSERT INTO sync_jobs (connection_id, table_name, schedule, next_run)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (connection_id, table_name)
    DO UPDATE SET schedule = EXCLUDED.schedule, next_run = EXCLUDED.next_run
    RETURNING *
    `,
    [connectionId, tableName, schedule, nextRun]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    connectionId: row.connection_id,
    tableName: row.table_name,
    schedule: row.schedule,
    enabled: row.enabled,
    lastRun: row.last_run,
    nextRun: row.next_run,
  };
}

/**
 * Calculate next run time based on schedule
 */
function calculateNextRun(schedule: SyncJob['schedule']): Date {
  const now = new Date();

  switch (schedule) {
    case 'realtime':
      // Every 5 minutes
      return new Date(now.getTime() + 5 * 60 * 1000);

    case 'hourly':
      // Next hour
      return new Date(now.getTime() + 60 * 60 * 1000);

    case 'daily':
      // Tomorrow at 2 AM
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);
      return tomorrow;

    default:
      return now;
  }
}

/**
 * Get jobs that need to run
 */
export async function getJobsToRun(): Promise<SyncJob[]> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT * FROM sync_jobs
    WHERE enabled = true
    AND next_run IS NOT NULL
    AND next_run <= NOW()
    ORDER BY next_run ASC
    LIMIT 100
    `
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    connectionId: row.connection_id,
    tableName: row.table_name,
    schedule: row.schedule,
    enabled: row.enabled,
    lastRun: row.last_run,
    nextRun: row.next_run,
  }));
}

/**
 * Update job after run
 */
export async function updateJobAfterRun(jobId: string, schedule: SyncJob['schedule']): Promise<void> {
  const pool = getDataTalkMetaPool();

  const nextRun = calculateNextRun(schedule);

  await pool.query(
    `UPDATE sync_jobs SET last_run = NOW(), next_run = $2 WHERE id = $1`,
    [jobId, nextRun]
  );
}
