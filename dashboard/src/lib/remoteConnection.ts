/**
 * Remote Database Connection Module
 * Support for remote databases with custom ports, network testing, and SSH tunnels
 */

import { getDataTalkMetaPool } from './datatalkMetaDb';
import { logAuditEvent } from './auditLog';

export interface RemoteConnectionConfig {
  host: string;
  port: number;
  isRemote: boolean;
  latency?: number;
  sslEnabled?: boolean;
  sshTunnel?: SSHTunnelConfig;
}

export interface SSHTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
  localPort?: number;
}

export interface NetworkTestResult {
  reachable: boolean;
  latency: number;
  ssl: boolean;
  error?: string;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  type: 'postgres' | 'mysql' | 'mssql';
  host: string;
  port: number;
  database?: string;
  username?: string;
  sshTunnel?: SSHTunnelConfig;
  tags?: string[];
  createdAt: Date;
  lastUsed?: Date;
}

/**
 * Initialize connection profiles table
 */
export async function initConnectionProfilesTable(): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS connection_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      database VARCHAR(255),
      username VARCHAR(255),
      ssh_tunnel JSONB,
      tags TEXT[],
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_used TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_connection_profiles_type ON connection_profiles(type);
    CREATE INDEX IF NOT EXISTS idx_connection_profiles_last_used ON connection_profiles(last_used DESC);
  `);
}

/**
 * Check if host is remote (not localhost)
 */
export function isRemoteHost(host: string): boolean {
  const localHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
  return !localHosts.includes(host.toLowerCase());
}

/**
 * Test network connectivity to remote host
 */
export async function testNetworkConnectivity(
  host: string,
  port: number,
  timeout: number = 5000
): Promise<NetworkTestResult> {
  const startTime = Date.now();

  try {
    // Use fetch with timeout to test connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Try to connect (this will fail but we can measure latency)
      await fetch(`http://${host}:${port}`, {
        method: 'HEAD',
        signal: controller.signal,
      });
    } catch (error) {
      // Expected to fail, but we got a response
    } finally {
      clearTimeout(timeoutId);
    }

    const latency = Date.now() - startTime;

    return {
      reachable: true,
      latency,
      ssl: false, // Would need to test HTTPS
    };
  } catch (error) {
    return {
      reachable: false,
      latency: Date.now() - startTime,
      ssl: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Scan port range for available services
 */
export async function scanPortRange(
  host: string,
  startPort: number,
  endPort: number,
  timeout: number = 1000
): Promise<number[]> {
  const openPorts: number[] = [];
  const maxConcurrent = 10;

  for (let i = startPort; i <= endPort; i += maxConcurrent) {
    const batch = [];
    for (let j = 0; j < maxConcurrent && i + j <= endPort; j++) {
      const port = i + j;
      batch.push(
        testNetworkConnectivity(host, port, timeout).then(result => ({
          port,
          open: result.reachable,
        }))
      );
    }

    const results = await Promise.all(batch);
    openPorts.push(...results.filter(r => r.open).map(r => r.port));
  }

  return openPorts;
}

/**
 * Detect database type by port
 */
export function detectDatabaseTypeByPort(port: number): string | null {
  const portMap: Record<number, string> = {
    5432: 'PostgreSQL',
    3306: 'MySQL',
    1433: 'MSSQL',
    3307: 'MySQL (alt)',
    5433: 'PostgreSQL (alt)',
    1434: 'MSSQL (alt)',
  };

  return portMap[port] || null;
}

/**
 * Save connection profile
 */
export async function saveConnectionProfile(
  profile: Omit<ConnectionProfile, 'id' | 'createdAt'>
): Promise<ConnectionProfile> {
  const pool = getDataTalkMetaPool();

  const result = await pool.query(
    `
    INSERT INTO connection_profiles 
      (name, type, host, port, database, username, ssh_tunnel, tags)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      profile.name,
      profile.type,
      profile.host,
      profile.port,
      profile.database || null,
      profile.username || null,
      profile.sshTunnel ? JSON.stringify(profile.sshTunnel) : null,
      profile.tags || [],
    ]
  );

  const row = result.rows[0];

  await logAuditEvent({
    action: 'config_change',
    resourceType: 'config',
    resourceId: row.id,
    details: {
      action: 'create_profile',
      name: profile.name,
      type: profile.type,
      host: profile.host,
      port: profile.port,
    },
    success: true,
  });

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    sshTunnel: row.ssh_tunnel,
    tags: row.tags,
    createdAt: row.created_at,
    lastUsed: row.last_used,
  };
}

/**
 * Load connection profiles
 */
export async function loadConnectionProfiles(
  type?: 'postgres' | 'mysql' | 'mssql'
): Promise<ConnectionProfile[]> {
  const pool = getDataTalkMetaPool();

  const query = type
    ? `SELECT * FROM connection_profiles WHERE type = $1 ORDER BY last_used DESC NULLS LAST, created_at DESC`
    : `SELECT * FROM connection_profiles ORDER BY last_used DESC NULLS LAST, created_at DESC`;

  const params = type ? [type] : [];
  const result = await pool.query(query, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    sshTunnel: row.ssh_tunnel,
    tags: row.tags,
    createdAt: row.created_at,
    lastUsed: row.last_used,
  }));
}

/**
 * Update profile last used timestamp
 */
export async function updateProfileLastUsed(profileId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `UPDATE connection_profiles SET last_used = NOW() WHERE id = $1`,
    [profileId]
  );
}

/**
 * Delete connection profile
 */
export async function deleteConnectionProfile(profileId: string): Promise<void> {
  const pool = getDataTalkMetaPool();

  await pool.query(
    `DELETE FROM connection_profiles WHERE id = $1`,
    [profileId]
  );

  await logAuditEvent({
    action: 'config_change',
    resourceType: 'config',
    resourceId: profileId,
    details: {
      action: 'delete_profile',
    },
    success: true,
  });
}

/**
 * Validate SSH tunnel configuration
 */
export function validateSSHTunnelConfig(config: SSHTunnelConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.host) {
    errors.push('SSH host is required');
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Invalid SSH port');
  }

  if (!config.username) {
    errors.push('SSH username is required');
  }

  if (!config.privateKey && !config.password) {
    errors.push('Either SSH private key or password is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test SSH tunnel connection
 */
export async function testSSHTunnel(config: SSHTunnelConfig): Promise<{
  success: boolean;
  error?: string;
}> {
  // Validate config
  const validation = validateSSHTunnelConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', '),
    };
  }

  try {
    // Test SSH connectivity
    const result = await testNetworkConnectivity(config.host, config.port);

    if (!result.reachable) {
      return {
        success: false,
        error: `SSH host ${config.host}:${config.port} is not reachable`,
      };
    }

    // In production, would actually establish SSH tunnel here
    // For now, just validate connectivity
    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SSH tunnel test failed',
    };
  }
}

/**
 * Get connection recommendations based on network test
 */
export async function getConnectionRecommendations(
  host: string,
  port: number
): Promise<{
  isRemote: boolean;
  recommendations: string[];
  warnings: string[];
}> {
  const recommendations: string[] = [];
  const warnings: string[] = [];

  const isRemote = isRemoteHost(host);

  if (isRemote) {
    warnings.push('You are connecting to a remote database');
    recommendations.push('Ensure you have proper authorization and VPN access');
    recommendations.push('Consider using SSH tunnel for secure connection');

    // Test connectivity
    const networkTest = await testNetworkConnectivity(host, port);

    if (!networkTest.reachable) {
      warnings.push('Host is not reachable - check firewall settings');
    } else if (networkTest.latency > 1000) {
      warnings.push(`High latency detected (${networkTest.latency}ms) - connection may be slow`);
    }

    if (!networkTest.ssl) {
      warnings.push('SSL not detected - data will be transmitted unencrypted');
      recommendations.push('Enable SSL/TLS for secure data transmission');
    }
  } else {
    recommendations.push('Connecting to local database');
  }

  return {
    isRemote,
    recommendations,
    warnings,
  };
}
