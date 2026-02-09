/**
 * Audit Logging Module
 * Comprehensive logging of all user actions for security and compliance
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';

export type AuditAction =
  | 'database_connect'
  | 'database_disconnect'
  | 'query_execute'
  | 'data_export'
  | 'schema_discover'
  | 'user_login'
  | 'user_logout'
  | 'permission_change'
  | 'backup_create'
  | 'backup_restore'
  | 'config_change'
  | 'credential_store'
  | 'credential_retrieve'
  | 'credential_delete'
  | 'credential_cleanup';

export type ResourceType = 'database' | 'table' | 'query' | 'user' | 'dashboard' | 'config' | 'credential';

export interface AuditEvent {
  userId?: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export interface AuditLogEntry extends AuditEvent {
  id: string;
  timestamp: Date;
}

/**
 * Initialize audit log table in metadata database
 */
export async function initAuditLogTable(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id VARCHAR(255) NOT NULL,
      details JSONB,
      ip_address INET,
      user_agent TEXT,
      success BOOLEAN NOT NULL DEFAULT true,
      error_message TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
  `);
}

/**
 * Log an audit event
 */
export async function logAuditEvent(event: AuditEvent): Promise<string> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    INSERT INTO audit_log 
      (user_id, action, resource_type, resource_id, details, ip_address, user_agent, success, error_message)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
    `,
    [
      event.userId || null,
      event.action,
      event.resourceType,
      event.resourceId,
      event.details ? JSON.stringify(event.details) : null,
      event.ipAddress || null,
      event.userAgent || null,
      event.success,
      event.errorMessage || null,
    ]
  );

  return result.rows[0].id;
}

/**
 * Query audit logs with filters
 */
export interface AuditLogQuery {
  userId?: string;
  action?: AuditAction;
  resourceType?: ResourceType;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export async function queryAuditLogs(query: AuditLogQuery): Promise<AuditLogEntry[]> {
  const pool = getDataTalkMetaPool();

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (query.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(query.userId);
  }

  if (query.action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(query.action);
  }

  if (query.resourceType) {
    conditions.push(`resource_type = $${paramIndex++}`);
    params.push(query.resourceType);
  }

  if (query.resourceId) {
    conditions.push(`resource_id = $${paramIndex++}`);
    params.push(query.resourceId);
  }

  if (query.startDate) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  if (query.success !== undefined) {
    conditions.push(`success = $${paramIndex++}`);
    params.push(query.success);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 100;
  const offset = query.offset || 0;

  const result = await pool.query(
    `
    SELECT 
      id, user_id, action, resource_type, resource_id,
      details, ip_address, user_agent, success, error_message, timestamp
    FROM audit_log
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
    [...params, limit, offset]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: row.details,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    success: row.success,
    errorMessage: row.error_message,
    timestamp: row.timestamp,
  }));
}

/**
 * Get audit statistics
 */
export interface AuditStats {
  totalEvents: number;
  successRate: number;
  topActions: Array<{ action: AuditAction; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  recentFailures: number;
}

export async function getAuditStats(days: number = 7): Promise<AuditStats> {
  const pool = getDataTalkMetaPool();

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Total events
  const totalResult = await pool.query(
    `SELECT COUNT(*) as count FROM audit_log WHERE timestamp >= $1`,
    [startDate]
  );
  const totalEvents = parseInt(totalResult.rows[0].count);

  // Success rate
  const successResult = await pool.query(
    `
    SELECT 
      COUNT(*) FILTER (WHERE success = true) as success_count,
      COUNT(*) as total_count
    FROM audit_log
    WHERE timestamp >= $1
    `,
    [startDate]
  );
  const successRate = totalEvents > 0
    ? parseInt(successResult.rows[0].success_count) / totalEvents
    : 1.0;

  // Top actions
  const actionsResult = await pool.query(
    `
    SELECT action, COUNT(*) as count
    FROM audit_log
    WHERE timestamp >= $1
    GROUP BY action
    ORDER BY count DESC
    LIMIT 10
    `,
    [startDate]
  );
  const topActions = actionsResult.rows.map(row => ({
    action: row.action as AuditAction,
    count: parseInt(row.count),
  }));

  // Top users
  const usersResult = await pool.query(
    `
    SELECT user_id, COUNT(*) as count
    FROM audit_log
    WHERE timestamp >= $1 AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 10
    `,
    [startDate]
  );
  const topUsers = usersResult.rows.map(row => ({
    userId: row.user_id,
    count: parseInt(row.count),
  }));

  // Recent failures
  const failuresResult = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM audit_log
    WHERE timestamp >= $1 AND success = false
    `,
    [startDate]
  );
  const recentFailures = parseInt(failuresResult.rows[0].count);

  return {
    totalEvents,
    successRate,
    topActions,
    topUsers,
    recentFailures,
  };
}

/**
 * Clean up old audit logs (data retention policy)
 */
export async function cleanupOldAuditLogs(retentionDays: number = 90): Promise<number> {
  const pool = getDataTalkMetaPool();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await pool.query(
    `DELETE FROM audit_log WHERE timestamp < $1`,
    [cutoffDate]
  );

  return result.rowCount || 0;
}

/**
 * Helper to extract IP address from request
 */
export function getClientIp(headers: Headers): string | undefined {
  // Check various headers for IP address
  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  return undefined;
}

/**
 * Helper to get user agent from request
 */
export function getUserAgent(headers: Headers): string | undefined {
  return headers.get('user-agent') || undefined;
}
