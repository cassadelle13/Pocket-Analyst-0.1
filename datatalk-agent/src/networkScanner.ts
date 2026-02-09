/**
 * Network Scanner
 * Scan local network for database servers
 */

import net from 'net';

export interface NetworkDatabase {
  type: 'postgres' | 'mysql' | 'mssql' | 'unknown';
  host: string;
  port: number;
  available: boolean;
  latency?: number;
  error?: string;
}

// Security: Blacklist для предотвращения сканирования чувствительных сетей
const BLACKLIST_SUBNETS = [
  '10.0.0.0/8',      // Private network Class A
  '172.16.0.0/12',   // Private network Class B
  '169.254.0.0/16',  // Link-local
];

// Whitelist (если включен, сканируются только эти сети)
const WHITELIST_SUBNETS = [
  '192.168.0.0/16',  // Private network Class C (домашние сети)
  '127.0.0.0/8',     // Localhost
];

const WHITELIST_ENABLED = process.env.NETWORK_SCAN_WHITELIST_ENABLED === 'true';

/**
 * Проверка IP адреса на соответствие CIDR
 */
function isInSubnet(ip: string, cidr: string): boolean {
  const [subnet, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  
  const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  const subnetNum = subnet.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  
  return (ipNum & mask) === (subnetNum & mask);
}

/**
 * Проверка разрешено ли сканировать IP
 */
function shouldScanIP(ip: string): boolean {
  // Проверка blacklist
  for (const subnet of BLACKLIST_SUBNETS) {
    if (isInSubnet(ip, subnet)) {
      console.log(`[NetworkScanner] IP ${ip} in blacklist, skipping`);
      return false;
    }
  }
  
  // Проверка whitelist (если включен)
  if (WHITELIST_ENABLED) {
    let inWhitelist = false;
    for (const subnet of WHITELIST_SUBNETS) {
      if (isInSubnet(ip, subnet)) {
        inWhitelist = true;
        break;
      }
    }
    if (!inWhitelist) {
      console.log(`[NetworkScanner] IP ${ip} not in whitelist, skipping`);
      return false;
    }
  }
  
  return true;
}

/**
 * Test TCP connection with timeout and retry logic
 */
async function testTcpConnection(
  host: string,
  port: number,
  timeout: number = 3000,
  retries: number = 2
): Promise<{ available: boolean; latency: number; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const startTime = Date.now();
    
    const result = await new Promise<{ available: boolean; latency: number; error?: string }>((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({ available: true, latency });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ 
          available: false, 
          latency: Date.now() - startTime,
          error: 'Connection timeout'
        });
      });
      
      socket.on('error', (err: any) => {
        const latency = Date.now() - startTime;
        resolve({ 
          available: false, 
          latency,
          error: err.code || err.message || 'Connection error'
        });
      });
      
      socket.connect(port, host);
    });
    
    if (result.available) {
      return result;
    }
    
    // Exponential backoff перед retry
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
    }
  }
  
  return { 
    available: false, 
    latency: timeout,
    error: `Failed after ${retries + 1} attempts`
  };
}

/**
 * Get local network subnet
 */
export function getLocalSubnet(): string | null {
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;
      
      for (const addr of iface) {
        // Skip internal and non-IPv4 addresses
        if (addr.internal || addr.family !== 'IPv4') continue;
        
        // Get subnet from IP address (e.g., 192.168.1.100 -> 192.168.1)
        const ip = addr.address;
        const parts = ip.split('.');
        if (parts.length === 4) {
          return `${parts[0]}.${parts[1]}.${parts[2]}`;
        }
      }
    }
  } catch (error) {
    console.error('[NetworkScanner] Error getting subnet:', error);
  }
  
  return null;
}

/**
 * Scan IP range for database ports
 */
export async function scanSubnet(
  subnet: string,
  startIp: number = 1,
  endIp: number = 254,
  ports: number[] = [5432, 3306, 1433]
): Promise<NetworkDatabase[]> {
  const databases: NetworkDatabase[] = [];
  const maxConcurrent = 10; // Limit concurrent scans
  
  console.log(`[NetworkScanner] Scanning ${subnet}.${startIp}-${endIp} for ports ${ports.join(', ')}`);
  
  // Scan in batches to avoid overwhelming the network
  for (let i = startIp; i <= endIp; i += maxConcurrent) {
    const batch: Promise<void>[] = [];
    
    for (let j = 0; j < maxConcurrent && i + j <= endIp; j++) {
      const ip = `${subnet}.${i + j}`;
      
      // Security check: skip blacklisted IPs
      if (!shouldScanIP(ip)) {
        continue;
      }
      
      // Scan all ports for this IP
      for (const port of ports) {
        batch.push(
          testTcpConnection(ip, port, 2000, 1).then(result => {
            if (result.available) {
              databases.push({
                type: detectDatabaseTypeByPort(port),
                host: ip,
                port,
                available: true,
                latency: result.latency,
              });
            }
          })
        );
      }
    }
    
    await Promise.all(batch);
  }
  
  return databases;
}

/**
 * Detect database type by port
 */
function detectDatabaseTypeByPort(port: number): 'postgres' | 'mysql' | 'mssql' | 'unknown' {
  switch (port) {
    case 5432:
    case 5433:
    case 5434:
      return 'postgres';
    case 3306:
    case 3307:
    case 3308:
      return 'mysql';
    case 1433:
    case 1434:
      return 'mssql';
    default:
      return 'unknown';
  }
}

/**
 * Scan common database ports on specific host
 */
export async function scanHost(
  host: string,
  ports: number[] = [5432, 5433, 3306, 3307, 1433, 1434]
): Promise<NetworkDatabase[]> {
  const databases: NetworkDatabase[] = [];
  
  const results = await Promise.all(
    ports.map(port => testTcpConnection(host, port, 2000))
  );
  
  results.forEach((result, index) => {
    if (result.available) {
      databases.push({
        type: detectDatabaseTypeByPort(ports[index]),
        host,
        port: ports[index],
        available: true,
        latency: result.latency,
      });
    }
  });
  
  return databases;
}

/**
 * Quick scan - only scan localhost with common and alternate ports
 */
export async function quickScan(): Promise<NetworkDatabase[]> {
  const commonPorts = [
    5432, 5433, 5434, // PostgreSQL
    3306, 3307, 3308, // MySQL
    1433, 1434,       // MSSQL
  ];
  
  return scanHost('localhost', commonPorts);
}

/**
 * Full network scan - scan entire local subnet
 */
export async function fullNetworkScan(): Promise<NetworkDatabase[]> {
  const subnet = getLocalSubnet();
  
  if (!subnet) {
    console.log('[NetworkScanner] Could not determine local subnet');
    return quickScan();
  }
  
  // Scan subnet with standard ports only (to keep it fast)
  return scanSubnet(subnet, 1, 254, [5432, 3306, 1433]);
}
