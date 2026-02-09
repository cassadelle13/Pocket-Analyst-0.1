/**
 * User Management Module
 * Role-Based Access Control (RBAC) for PocketAnalyst
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';

export enum UserRole {
  ADMIN = 'admin',        // Full access to everything
  ANALYST = 'analyst',    // Read all data, create dashboards
  VIEWER = 'viewer',      // View dashboards only
  GUEST = 'guest'         // Limited access
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

export interface Permission {
  id: string;
  userId: string;
  resourceType: 'database' | 'table' | 'dashboard' | 'query';
  resourceId: string;
  action: 'read' | 'write' | 'delete' | 'execute';
  createdAt: Date;
}

/**
 * Initialize users and permissions tables
 */
export async function initUserTables(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'viewer',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_login TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_type VARCHAR(50) NOT NULL,
      resource_id VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, resource_type, resource_id, action)
    );

    CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource_type, resource_id);
  `);
}

/**
 * Create a new user
 */
export async function createUser(
  email: string,
  passwordHash: string,
  role: UserRole = UserRole.VIEWER
): Promise<User> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    INSERT INTO users (email, password_hash, role)
    VALUES ($1, $2, $3)
    RETURNING id, email, role, created_at, is_active
    `,
    [email, passwordHash, role]
  );

  const row = result.rows[0];

  await logAuditEvent({
    userId: row.id,
    action: 'user_login',
    resourceType: 'user',
    resourceId: row.id,
    details: { email, role },
    success: true,
  });

  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.created_at,
    isActive: row.is_active,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT id, email, role, created_at, last_login, is_active
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    isActive: row.is_active,
  };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT id, email, password_hash, role, created_at, last_login, is_active
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    isActive: row.is_active,
  };
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE users SET last_login = NOW() WHERE id = $1`,
    [userId]
  );
}

/**
 * Change user role
 */
export async function changeUserRole(
  userId: string,
  newRole: UserRole,
  changedBy?: string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE users SET role = $1 WHERE id = $2`,
    [newRole, userId]
  );

  await logAuditEvent({
    userId: changedBy,
    action: 'permission_change',
    resourceType: 'user',
    resourceId: userId,
    details: { newRole },
    success: true,
  });
}

/**
 * Grant permission to user
 */
export async function grantPermission(
  userId: string,
  resourceType: Permission['resourceType'],
  resourceId: string,
  action: Permission['action'],
  grantedBy?: string
): Promise<Permission> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    INSERT INTO permissions (user_id, resource_type, resource_id, action)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, resource_type, resource_id, action) DO NOTHING
    RETURNING id, user_id, resource_type, resource_id, action, created_at
    `,
    [userId, resourceType, resourceId, action]
  );

  await logAuditEvent({
    userId: grantedBy,
    action: 'permission_change',
    resourceType: 'user',
    resourceId: userId,
    details: { resourceType, resourceId, action, granted: true },
    success: true,
  });

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    action: row.action,
    createdAt: row.created_at,
  };
}

/**
 * Revoke permission from user
 */
export async function revokePermission(
  userId: string,
  resourceType: Permission['resourceType'],
  resourceId: string,
  action: Permission['action'],
  revokedBy?: string
): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `
    DELETE FROM permissions
    WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3 AND action = $4
    `,
    [userId, resourceType, resourceId, action]
  );

  await logAuditEvent({
    userId: revokedBy,
    action: 'permission_change',
    resourceType: 'user',
    resourceId: userId,
    details: { resourceType, resourceId, action, granted: false },
    success: true,
  });
}

/**
 * Check if user has permission
 */
export async function hasPermission(
  userId: string,
  resourceType: Permission['resourceType'],
  resourceId: string,
  action: Permission['action']
): Promise<boolean> {
  const user = await getUserById(userId);
  
  if (!user || !user.isActive) {
    return false;
  }

  // Admins have all permissions
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  // Check role-based permissions
  if (user.role === UserRole.ANALYST) {
    // Analysts can read everything and write dashboards
    if (action === 'read') return true;
    if (resourceType === 'dashboard' && (action === 'write' || action === 'execute')) return true;
  }

  if (user.role === UserRole.VIEWER) {
    // Viewers can only read dashboards
    if (resourceType === 'dashboard' && action === 'read') return true;
  }

  // Check explicit permissions
  const pool = getDataTalkMetaPool();
  const result = await pool.query(
    `
    SELECT COUNT(*) as count
    FROM permissions
    WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3 AND action = $4
    `,
    [userId, resourceType, resourceId, action]
  );

  return parseInt(result.rows[0].count) > 0;
}

/**
 * Get all permissions for a user
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT id, user_id, resource_type, resource_id, action, created_at
    FROM permissions
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    action: row.action,
    createdAt: row.created_at,
  }));
}

/**
 * List all users
 */
export async function listUsers(limit: number = 100, offset: number = 0): Promise<User[]> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT id, email, role, created_at, last_login, is_active
    FROM users
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    isActive: row.is_active,
  }));
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(userId: string, deactivatedBy?: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE users SET is_active = false WHERE id = $1`,
    [userId]
  );

  await logAuditEvent({
    userId: deactivatedBy,
    action: 'permission_change',
    resourceType: 'user',
    resourceId: userId,
    details: { deactivated: true },
    success: true,
  });
}
