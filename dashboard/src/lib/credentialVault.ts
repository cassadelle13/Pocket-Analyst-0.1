/**
 * Credential Vault - Secure storage for database credentials
 * Uses AES-256-GCM encryption with environment-based master key
 */

import crypto from 'crypto';
import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or generate one
 */
function getMasterKey(): Buffer {
  const envKey = process.env.CREDENTIAL_VAULT_MASTER_KEY;
  
  if (envKey) {
    // Use provided key
    return crypto.scryptSync(envKey, 'salt', KEY_LENGTH);
  }
  
  // WARNING: In production, you MUST set CREDENTIAL_VAULT_MASTER_KEY
  console.warn('[CredentialVault] Using default master key - SET CREDENTIAL_VAULT_MASTER_KEY in production!');
  return crypto.scryptSync('default-dev-key-change-in-production', 'salt', KEY_LENGTH);
}

/**
 * Encrypt sensitive data
 */
export function encryptCredential(plaintext: string): string {
  try {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Format: salt:iv:tag:encrypted
    return [
      salt.toString('hex'),
      iv.toString('hex'),
      tag.toString('hex'),
      encrypted
    ].join(':');
  } catch (error) {
    console.error('[CredentialVault] Encryption failed:', error);
    throw new Error('Failed to encrypt credential');
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptCredential(encrypted: string): string {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted format');
    }
    
    const [saltHex, ivHex, tagHex, encryptedData] = parts;
    
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[CredentialVault] Decryption failed:', error);
    throw new Error('Failed to decrypt credential');
  }
}

/**
 * Initialize credentials vault table
 */
export async function initCredentialVaultTable(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credential_vault (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id UUID REFERENCES connection_profiles(id) ON DELETE CASCADE,
      username_encrypted TEXT,
      password_encrypted TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP,
      last_accessed TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_credential_vault_profile_id ON credential_vault(profile_id);
    CREATE INDEX IF NOT EXISTS idx_credential_vault_expires_at ON credential_vault(expires_at);
  `);
}

export interface StoredCredential {
  id: string;
  profileId: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  lastAccessed?: Date;
}

/**
 * Store encrypted credentials
 */
export async function storeCredentials(
  profileId: string,
  username: string,
  password: string,
  expiresInDays?: number
): Promise<string> {
  const pool = getDataTalkMetaPool();

  const usernameEncrypted = encryptCredential(username);
  const passwordEncrypted = encryptCredential(password);
  
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const result = await pool.query(
    `
    INSERT INTO credential_vault 
      (profile_id, username_encrypted, password_encrypted, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (profile_id) 
    DO UPDATE SET 
      username_encrypted = EXCLUDED.username_encrypted,
      password_encrypted = EXCLUDED.password_encrypted,
      updated_at = NOW(),
      expires_at = EXCLUDED.expires_at
    RETURNING id
    `,
    [profileId, usernameEncrypted, passwordEncrypted, expiresAt]
  );

  const credentialId = result.rows[0].id;

  await logAuditEvent({
    action: 'credential_store',
    resourceType: 'credential',
    resourceId: credentialId,
    details: {
      profileId,
      expiresInDays,
    },
    success: true,
  });

  return credentialId;
}

/**
 * Retrieve and decrypt credentials
 */
export async function retrieveCredentials(profileId: string): Promise<{
  username: string;
  password: string;
} | null> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT 
      id,
      username_encrypted,
      password_encrypted,
      expires_at
    FROM credential_vault
    WHERE profile_id = $1
      AND (expires_at IS NULL OR expires_at > NOW())
    `,
    [profileId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  try {
    const username = decryptCredential(row.username_encrypted);
    const password = decryptCredential(row.password_encrypted);

    // Update last accessed timestamp
    await pool.query(
      `UPDATE credential_vault SET last_accessed = NOW() WHERE id = $1`,
      [row.id]
    );

    await logAuditEvent({
      action: 'credential_retrieve',
      resourceType: 'credential',
      resourceId: row.id,
      details: {
        profileId,
      },
      success: true,
    });

    return { username, password };
  } catch (error) {
    await logAuditEvent({
      action: 'credential_retrieve',
      resourceType: 'credential',
      resourceId: row.id,
      details: {
        profileId,
        error: error instanceof Error ? error.message : 'Decryption failed',
      },
      success: false,
    });

    throw error;
  }
}

/**
 * Delete credentials
 */
export async function deleteCredentials(profileId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `DELETE FROM credential_vault WHERE profile_id = $1 RETURNING id`,
    [profileId]
  );

  if (result.rows.length > 0) {
    await logAuditEvent({
      action: 'credential_delete',
      resourceType: 'credential',
      resourceId: result.rows[0].id,
      details: {
        profileId,
      },
      success: true,
    });
  }
}

/**
 * Clean up expired credentials
 */
export async function cleanupExpiredCredentials(): Promise<number> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    DELETE FROM credential_vault 
    WHERE expires_at IS NOT NULL 
      AND expires_at < NOW()
    RETURNING id
    `
  );

  const deletedCount = result.rows.length;

  if (deletedCount > 0) {
    await logAuditEvent({
      action: 'credential_cleanup',
      resourceType: 'credential',
      resourceId: 'batch',
      details: {
        deletedCount,
      },
      success: true,
    });
  }

  return deletedCount;
}

/**
 * List all stored credentials (without decrypting)
 */
export async function listStoredCredentials(): Promise<Array<{
  id: string;
  profileId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  lastAccessed?: Date;
}>> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(`
    SELECT 
      id,
      profile_id,
      created_at,
      updated_at,
      expires_at,
      last_accessed
    FROM credential_vault
    WHERE expires_at IS NULL OR expires_at > NOW()
    ORDER BY last_accessed DESC NULLS LAST, created_at DESC
  `);

  return result.rows.map((row: any) => ({
    id: row.id,
    profileId: row.profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    lastAccessed: row.last_accessed,
  }));
}

/**
 * Check if credentials exist for profile
 */
export async function hasStoredCredentials(profileId: string): Promise<boolean> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    SELECT 1 FROM credential_vault 
    WHERE profile_id = $1 
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
    [profileId]
  );

  return result.rows.length > 0;
}
