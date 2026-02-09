/**
 * Docker Container Discovery
 * Find database containers running in Docker
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DockerDatabase {
  type: 'postgres' | 'mysql' | 'mssql';
  containerName: string;
  containerId: string;
  host: string;
  port: number;
  internalPort: number;
  status: string;
  image: string;
  available: boolean;
  hasCredentials: boolean;  // Вместо plaintext credentials
  credentialsSource?: 'env' | 'config' | 'none';
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Find database containers
 */
export async function findDatabaseContainers(): Promise<DockerDatabase[]> {
  const databases: DockerDatabase[] = [];

  try {
    // Check if Docker is available
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.log('[DockerDiscovery] Docker not available');
      return [];
    }

    // Get all running containers
    const { stdout } = await execAsync(
      'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"'
    );

    const lines = stdout.trim().split('\n').filter(line => line);

    for (const line of lines) {
      const [containerId, containerName, image, status, ports] = line.split('|');

      // Detect database type from image name
      const dbType = detectDatabaseType(image);
      if (!dbType) continue;

      // Parse port mappings
      const portMappings = parsePorts(ports);
      
      // Check if container has credentials in env
      const hasCredentials = await checkContainerHasCredentials(containerId, dbType);
      
      for (const mapping of portMappings) {
        databases.push({
          type: dbType,
          containerName,
          containerId: containerId.substring(0, 12),
          host: 'localhost',
          port: mapping.hostPort,
          internalPort: mapping.containerPort,
          status,
          image,
          available: status.includes('Up'),
          hasCredentials: hasCredentials.has,
          credentialsSource: hasCredentials.source,
        });
      }
    }
  } catch (error) {
    console.error('[DockerDiscovery] Error:', error);
  }

  return databases;
}

/**
 * Detect database type from Docker image name
 */
function detectDatabaseType(image: string): 'postgres' | 'mysql' | 'mssql' | null {
  const imageLower = image.toLowerCase();
  
  if (imageLower.includes('postgres')) return 'postgres';
  if (imageLower.includes('mysql') || imageLower.includes('mariadb')) return 'mysql';
  if (imageLower.includes('mssql') || imageLower.includes('sqlserver')) return 'mssql';
  
  return null;
}

/**
 * Parse Docker port mappings
 */
function parsePorts(portsString: string): Array<{ hostPort: number; containerPort: number }> {
  const mappings: Array<{ hostPort: number; containerPort: number }> = [];
  
  if (!portsString) return mappings;

  // Format: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp"
  const portParts = portsString.split(',').map(p => p.trim());

  for (const part of portParts) {
    // Match pattern: "0.0.0.0:5432->5432/tcp" or "5432->5432/tcp"
    const match = part.match(/(?:[\d.]+:)?(\d+)->(\d+)\/tcp/);
    if (match) {
      const hostPort = parseInt(match[1], 10);
      const containerPort = parseInt(match[2], 10);
      
      // Only add if it's a database port
      if (isDatabasePort(containerPort)) {
        mappings.push({ hostPort, containerPort });
      }
    }
  }

  return mappings;
}

/**
 * Check if port is a common database port
 */
function isDatabasePort(port: number): boolean {
  const dbPorts = [
    5432, 5433, 5434, // PostgreSQL
    3306, 3307, 3308, // MySQL
    1433, 1434,       // MSSQL
  ];
  return dbPorts.includes(port);
}

/**
 * Get container environment variables
 */
export async function getContainerEnv(containerId: string): Promise<Record<string, string>> {
  try {
    const { stdout } = await execAsync(`docker inspect ${containerId} --format='{{json .Config.Env}}'`);
    const envArray = JSON.parse(stdout.trim());
    
    const env: Record<string, string> = {};
    for (const item of envArray) {
      const [key, ...valueParts] = item.split('=');
      env[key] = valueParts.join('=');
    }
    
    return env;
  } catch {
    return {};
  }
}

/**
 * Check if container has credentials (without returning them)
 */
async function checkContainerHasCredentials(
  containerId: string,
  dbType: 'postgres' | 'mysql' | 'mssql'
): Promise<{ has: boolean; source: 'env' | 'config' | 'none' }> {
  const env = await getContainerEnv(containerId);
  
  let hasPassword = false;
  
  switch (dbType) {
    case 'postgres':
      hasPassword = !!env.POSTGRES_PASSWORD;
      break;
    case 'mysql':
      hasPassword = !!(env.MYSQL_PASSWORD || env.MYSQL_ROOT_PASSWORD);
      break;
    case 'mssql':
      hasPassword = !!(env.SA_PASSWORD || env.MSSQL_SA_PASSWORD);
      break;
  }
  
  return {
    has: hasPassword,
    source: hasPassword ? 'env' : 'none',
  };
}

/**
 * Get database credentials from container environment
 * SECURITY: This function should only be called when actually connecting,
 * not during discovery. Credentials should be stored in credential vault.
 */
export async function getContainerCredentials(
  containerId: string,
  dbType: 'postgres' | 'mysql' | 'mssql'
): Promise<{ username?: string; password?: string; database?: string }> {
  console.warn('[DockerDiscovery] Getting credentials - should be stored in vault immediately');
  
  const env = await getContainerEnv(containerId);
  
  const credentials: { username?: string; password?: string; database?: string } = {};

  switch (dbType) {
    case 'postgres':
      credentials.username = env.POSTGRES_USER || 'postgres';
      credentials.password = env.POSTGRES_PASSWORD;
      credentials.database = env.POSTGRES_DB || 'postgres';
      break;
    
    case 'mysql':
      credentials.username = env.MYSQL_USER || 'root';
      credentials.password = env.MYSQL_PASSWORD || env.MYSQL_ROOT_PASSWORD;
      credentials.database = env.MYSQL_DATABASE;
      break;
    
    case 'mssql':
      credentials.username = env.MSSQL_USER || 'sa';
      credentials.password = env.SA_PASSWORD || env.MSSQL_SA_PASSWORD;
      credentials.database = 'master';
      break;
  }

  return credentials;
}
