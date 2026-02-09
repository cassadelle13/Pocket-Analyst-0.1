/**
 * GDPR Compliance Module
 * Right to Access, Right to be Forgotten, Data Portability
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';
import { getUserById, deactivateUser, getUserPermissions } from './userManagement';
import { queryAuditLogs } from './auditLog';

export interface UserDataExport {
  user: {
    id: string;
    email: string;
    role: string;
    createdAt: Date;
    lastLogin?: Date;
  };
  permissions: any[];
  auditLogs: any[];
  connections: any[];
  metadata: {
    exportedAt: Date;
    exportedBy: string;
    format: 'json';
  };
}

export interface DataDeletionRequest {
  userId: string;
  requestedBy: string;
  requestedAt: Date;
  scheduledFor: Date;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  completedAt?: Date;
}

/**
 * Initialize GDPR tables
 */
export async function initGDPRTables(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_deletion_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      requested_by VARCHAR(255) NOT NULL,
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      scheduled_for TIMESTAMP NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMP,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON data_deletion_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON data_deletion_requests(status);
    CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled ON data_deletion_requests(scheduled_for);

    CREATE TABLE IF NOT EXISTS data_exports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      exported_by VARCHAR(255) NOT NULL,
      exported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      file_path VARCHAR(500),
      file_size BIGINT,
      expires_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id);
    CREATE INDEX IF NOT EXISTS idx_data_exports_expires ON data_exports(expires_at);
  `);
}

/**
 * Export all user data (GDPR Right to Access)
 */
export async function exportUserData(
  userId: string,
  exportedBy: string
): Promise<UserDataExport> {
  const pool = getDataTalkMetaPool();

  // Get user info
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Get permissions
  const permissions = await getUserPermissions(userId);

  // Get audit logs
  const auditLogs = await queryAuditLogs({
    userId,
    limit: 10000,
  });

  // Get connections
  const connectionsResult = await pool.query(
    `SELECT id, name, type, host, port, database, created_at FROM connections WHERE user_id = $1`,
    [userId]
  );

  const exportData: UserDataExport = {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    },
    permissions,
    auditLogs,
    connections: connectionsResult.rows,
    metadata: {
      exportedAt: new Date(),
      exportedBy,
      format: 'json',
    },
  };

  // Log export
  await logAuditEvent({
    userId: exportedBy,
    action: 'data_export',
    resourceType: 'user',
    resourceId: userId,
    details: {
      recordCount: auditLogs.length + connectionsResult.rows.length,
    },
    success: true,
  });

  // Record export in database
  await pool.query(
    `
    INSERT INTO data_exports (user_id, exported_by, file_size, expires_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
    `,
    [userId, exportedBy, JSON.stringify(exportData).length]
  );

  return exportData;
}

/**
 * Request user data deletion (GDPR Right to be Forgotten)
 */
export async function requestDataDeletion(
  userId: string,
  requestedBy: string,
  gracePeriodDays: number = 30
): Promise<DataDeletionRequest> {
  const pool = getDataTalkMetaPool();

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + gracePeriodDays);

  const result = await pool.query(
    `
    INSERT INTO data_deletion_requests 
      (user_id, requested_by, scheduled_for, status, notes)
    VALUES ($1, $2, $3, 'pending', $4)
    RETURNING *
    `,
    [
      userId,
      requestedBy,
      scheduledFor,
      `Data deletion scheduled for ${scheduledFor.toISOString()}. Grace period: ${gracePeriodDays} days.`,
    ]
  );

  const row = result.rows[0];

  await logAuditEvent({
    userId: requestedBy,
    action: 'user_logout',
    resourceType: 'user',
    resourceId: userId,
    details: {
      action: 'deletion_requested',
      scheduledFor,
      gracePeriodDays,
    },
    success: true,
  });

  return {
    userId: row.user_id,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    scheduledFor: row.scheduled_for,
    status: row.status,
  };
}

/**
 * Cancel data deletion request
 */
export async function cancelDataDeletion(
  requestId: string,
  cancelledBy: string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE data_deletion_requests SET status = 'cancelled' WHERE id = $1`,
    [requestId]
  );

  await logAuditEvent({
    userId: cancelledBy,
    action: 'config_change',
    resourceType: 'user',
    resourceId: requestId,
    details: {
      action: 'deletion_cancelled',
    },
    success: true,
  });
}

/**
 * Execute pending data deletions
 */
export async function executePendingDeletions(): Promise<number> {
  const pool = getDataTalkMetaPool();

  // Find pending deletions that are due
  const result = await pool.query(
    `
    SELECT * FROM data_deletion_requests
    WHERE status = 'pending'
    AND scheduled_for <= NOW()
    `
  );

  let deletedCount = 0;

  for (const request of result.rows) {
    try {
      // Mark as processing
      await pool.query(
        `UPDATE data_deletion_requests SET status = 'processing' WHERE id = $1`,
        [request.id]
      );

      // Anonymize user data
      await anonymizeUserData(request.user_id);

      // Mark as completed
      await pool.query(
        `UPDATE data_deletion_requests SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [request.id]
      );

      deletedCount++;

      await logAuditEvent({
        action: 'user_logout',
        resourceType: 'user',
        resourceId: request.user_id,
        details: {
          action: 'data_deleted',
          requestId: request.id,
        },
        success: true,
      });
    } catch (error) {
      console.error(`Failed to delete user data for ${request.user_id}:`, error);
      
      await pool.query(
        `UPDATE data_deletion_requests SET status = 'pending' WHERE id = $1`,
        [request.id]
      );
    }
  }

  return deletedCount;
}

/**
 * Anonymize user data (instead of hard delete)
 */
async function anonymizeUserData(userId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  // Anonymize user record
  await pool.query(
    `
    UPDATE users
    SET 
      email = CONCAT('deleted_', id, '@deleted.local'),
      password_hash = 'DELETED',
      is_active = false
    WHERE id = $1
    `,
    [userId]
  );

  // Anonymize audit logs (keep for compliance but remove PII)
  await pool.query(
    `
    UPDATE audit_log
    SET 
      ip_address = NULL,
      user_agent = NULL,
      details = jsonb_set(
        COALESCE(details, '{}'::jsonb),
        '{anonymized}',
        'true'::jsonb
      )
    WHERE user_id = $1
    `,
    [userId]
  );

  // Delete permissions
  await pool.query(
    `DELETE FROM permissions WHERE user_id = $1`,
    [userId]
  );

  // Anonymize connections (keep metadata but remove credentials)
  await pool.query(
    `
    UPDATE connections
    SET 
      username = 'DELETED',
      password = 'DELETED'
    WHERE user_id = $1
    `,
    [userId]
  );
}

/**
 * Get data retention statistics
 */
export async function getDataRetentionStats(): Promise<{
  totalUsers: number;
  activeUsers: number;
  deletedUsers: number;
  pendingDeletions: number;
  oldestData: Date | null;
}> {
  const pool = getDataTalkMetaPool();

  const usersResult = await pool.query(`
    SELECT
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE is_active = true) as active_users,
      COUNT(*) FILTER (WHERE email LIKE 'deleted_%') as deleted_users
    FROM users
  `);

  const deletionsResult = await pool.query(`
    SELECT COUNT(*) as pending_deletions
    FROM data_deletion_requests
    WHERE status = 'pending'
  `);

  const oldestResult = await pool.query(`
    SELECT MIN(created_at) as oldest_data
    FROM audit_log
  `);

  return {
    totalUsers: parseInt(usersResult.rows[0].total_users),
    activeUsers: parseInt(usersResult.rows[0].active_users),
    deletedUsers: parseInt(usersResult.rows[0].deleted_users),
    pendingDeletions: parseInt(deletionsResult.rows[0].pending_deletions),
    oldestData: oldestResult.rows[0].oldest_data,
  };
}

/**
 * Generate GDPR compliance report
 */
export async function generateComplianceReport(): Promise<{
  dataRetention: any;
  recentExports: number;
  recentDeletions: number;
  pendingRequests: number;
  complianceScore: number;
}> {
  const pool = getDataTalkMetaPool();

  const dataRetention = await getDataRetentionStats();

  const exportsResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM data_exports
    WHERE exported_at > NOW() - INTERVAL '30 days'
  `);

  const deletionsResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM data_deletion_requests
    WHERE completed_at > NOW() - INTERVAL '30 days'
  `);

  const pendingResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM data_deletion_requests
    WHERE status = 'pending'
    AND scheduled_for <= NOW()
  `);

  const recentExports = parseInt(exportsResult.rows[0].count);
  const recentDeletions = parseInt(deletionsResult.rows[0].count);
  const pendingRequests = parseInt(pendingResult.rows[0].count);

  // Calculate compliance score (0-100)
  let complianceScore = 100;
  
  // Deduct points for overdue deletions
  if (pendingRequests > 0) {
    complianceScore -= Math.min(50, pendingRequests * 10);
  }

  // Deduct points for very old data
  if (dataRetention.oldestData) {
    const ageInDays = (Date.now() - dataRetention.oldestData.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays > 365) {
      complianceScore -= 10;
    }
  }

  return {
    dataRetention,
    recentExports,
    recentDeletions,
    pendingRequests,
    complianceScore: Math.max(0, complianceScore),
  };
}
