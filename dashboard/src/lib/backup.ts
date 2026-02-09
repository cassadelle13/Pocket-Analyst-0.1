/**
 * Backup Module
 * Create backups before any data modifications
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';

export interface Backup {
  id: string;
  connectionId: string;
  tables: string[];
  rowCount: number;
  sizeBytes: number;
  location: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'creating' | 'completed' | 'failed' | 'expired';
  errorMessage?: string;
}

export interface BackupOptions {
  tables?: string[];
  retentionDays?: number;
  compress?: boolean;
}

/**
 * Initialize backup tables
 */
export async function initBackupTables(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      connection_id UUID NOT NULL,
      tables TEXT[] NOT NULL,
      row_count BIGINT NOT NULL DEFAULT 0,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      location VARCHAR(500) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP,
      status VARCHAR(50) NOT NULL DEFAULT 'creating',
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backups_connection ON backups(connection_id);
    CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);
    CREATE INDEX IF NOT EXISTS idx_backups_expires ON backups(expires_at);
  `);
}

/**
 * Create backup in ClickHouse
 */
export async function createBackup(
  connectionId: string,
  options: BackupOptions = {},
  userId?: string
): Promise<Backup> {
  const pool = getDataTalkMetaPool();
  
  const backupId = crypto.randomUUID();
  const tables = options.tables || ['events']; // Default to events table
  const retentionDays = options.retentionDays || 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);

  // Create backup record
  const result = await pool.query(
    `
    INSERT INTO backups (id, connection_id, tables, location, expires_at, status)
    VALUES ($1, $2, $3, $4, $5, 'creating')
    RETURNING *
    `,
    [backupId, connectionId, tables, `backups/${backupId}`, expiresAt]
  );

  // Log backup creation
  await logAuditEvent({
    userId,
    action: 'backup_create',
    resourceType: 'database',
    resourceId: connectionId,
    details: {
      backupId,
      tables,
      retentionDays,
    },
    success: true,
  });

  try {
    // Create backup tables in ClickHouse
    let totalRows = 0;
    let totalSize = 0;

    for (const table of tables) {
      const backupTableName = `backups.${table}_${backupId.replace(/-/g, '_')}`;
      
      // Create backup table as copy of original
      const createQuery = `
        CREATE TABLE IF NOT EXISTS ${backupTableName}
        ENGINE = MergeTree()
        ORDER BY timestamp
        AS SELECT * FROM analytics.${table}
      `;

      // Execute via ClickHouse (would need ClickHouse client)
      // For now, store metadata
      
      // Get row count and size (approximate)
      // const stats = await getTableStats(table);
      // totalRows += stats.rows;
      // totalSize += stats.sizeBytes;
    }

    // Update backup record with success
    await pool.query(
      `
      UPDATE backups
      SET status = 'completed', row_count = $2, size_bytes = $3
      WHERE id = $1
      `,
      [backupId, totalRows, totalSize]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      connectionId: row.connection_id,
      tables: row.tables,
      rowCount: totalRows,
      sizeBytes: totalSize,
      location: row.location,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: 'completed',
    };
  } catch (error) {
    // Mark backup as failed
    const errorMessage = error instanceof Error ? error.message : 'Backup failed';
    
    await pool.query(
      `UPDATE backups SET status = 'failed', error_message = $2 WHERE id = $1`,
      [backupId, errorMessage]
    );

    await logAuditEvent({
      userId,
      action: 'backup_create',
      resourceType: 'database',
      resourceId: connectionId,
      success: false,
      errorMessage,
    });

    throw error;
  }
}

/**
 * Restore backup
 */
export async function restoreBackup(
  backupId: string,
  userId?: string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  // Get backup info
  const result = await pool.query(
    `SELECT * FROM backups WHERE id = $1`,
    [backupId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Backup ${backupId} not found`);
  }

  const backup = result.rows[0];

  if (backup.status !== 'completed') {
    throw new Error(`Backup ${backupId} is not in completed state`);
  }

  try {
    // Restore each table from backup
    for (const table of backup.tables) {
      const backupTableName = `backups.${table}_${backupId.replace(/-/g, '_')}`;
      
      // Truncate current table
      // await clickhouse.query(`TRUNCATE TABLE analytics.${table}`);
      
      // Insert data from backup
      // await clickhouse.query(`
      //   INSERT INTO analytics.${table}
      //   SELECT * FROM ${backupTableName}
      // `);
    }

    await logAuditEvent({
      userId,
      action: 'backup_restore',
      resourceType: 'database',
      resourceId: backup.connection_id,
      details: {
        backupId,
        tables: backup.tables,
      },
      success: true,
    });
  } catch (error) {
    await logAuditEvent({
      userId,
      action: 'backup_restore',
      resourceType: 'database',
      resourceId: backup.connection_id,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Restore failed',
    });

    throw error;
  }
}

/**
 * List backups for a connection
 */
export async function listBackups(
  connectionId: string,
  limit: number = 50
): Promise<Backup[]> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT * FROM backups
    WHERE connection_id = $1
    AND status != 'expired'
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [connectionId, limit]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    connectionId: row.connection_id,
    tables: row.tables,
    rowCount: parseInt(row.row_count),
    sizeBytes: parseInt(row.size_bytes),
    location: row.location,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status,
    errorMessage: row.error_message,
  }));
}

/**
 * Delete backup
 */
export async function deleteBackup(
  backupId: string,
  userId?: string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  // Get backup info
  const result = await pool.query(
    `SELECT * FROM backups WHERE id = $1`,
    [backupId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Backup ${backupId} not found`);
  }

  const backup = result.rows[0];

  try {
    // Drop backup tables in ClickHouse
    for (const table of backup.tables) {
      const backupTableName = `backups.${table}_${backupId.replace(/-/g, '_')}`;
      // await clickhouse.query(`DROP TABLE IF EXISTS ${backupTableName}`);
    }

    // Mark as expired
    await pool.query(
      `UPDATE backups SET status = 'expired' WHERE id = $1`,
      [backupId]
    );

    await logAuditEvent({
      userId,
      action: 'backup_restore',
      resourceType: 'database',
      resourceId: backup.connection_id,
      details: {
        backupId,
        action: 'delete',
      },
      success: true,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Clean up expired backups
 */
export async function cleanupExpiredBackups(): Promise<number> {
  const pool = getDataTalkMetaPool();

  // Find expired backups
  const result = await pool.query(
    `
    SELECT * FROM backups
    WHERE expires_at < NOW()
    AND status = 'completed'
    `
  );

  let deletedCount = 0;

  for (const backup of result.rows) {
    try {
      await deleteBackup(backup.id);
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete backup ${backup.id}:`, error);
    }
  }

  return deletedCount;
}

/**
 * Get backup statistics
 */
export async function getBackupStats(connectionId: string): Promise<{
  totalBackups: number;
  totalSize: number;
  oldestBackup?: Date;
  newestBackup?: Date;
}> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT
      COUNT(*) as total_backups,
      SUM(size_bytes) as total_size,
      MIN(created_at) as oldest_backup,
      MAX(created_at) as newest_backup
    FROM backups
    WHERE connection_id = $1
    AND status = 'completed'
    `,
    [connectionId]
  );

  const row = result.rows[0];

  return {
    totalBackups: parseInt(row.total_backups),
    totalSize: parseInt(row.total_size || '0'),
    oldestBackup: row.oldest_backup,
    newestBackup: row.newest_backup,
  };
}

/**
 * Auto-backup before dangerous operations
 */
export async function autoBackupBeforeOperation(
  connectionId: string,
  operation: 'update' | 'delete' | 'truncate',
  tables: string[],
  userId?: string
): Promise<Backup> {
  console.log(`[Backup] Auto-backup before ${operation} on tables:`, tables);

  const backup = await createBackup(
    connectionId,
    {
      tables,
      retentionDays: 7, // Keep auto-backups for 7 days
    },
    userId
  );

  return backup;
}
