/**
 * Credential Sanitizer
 * Removes sensitive credentials from data before caching
 * Prevents credential leaks through memory dumps
 */

const SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'credentials',
  'auth',
  'authorization',
];

/**
 * Sanitizes credentials from an object recursively
 */
export function sanitizeCredentials(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeCredentials(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Check if this is a sensitive field
      const isSensitive = SENSITIVE_FIELDS.some(field => 
        lowerKey.includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        // Replace with placeholder
        sanitized[key] = value ? '[REDACTED]' : null;
      } else {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeCredentials(value);
      }
    }
    
    return sanitized;
  }

  // Return primitive values as-is
  return data;
}

/**
 * Checks if data contains any credentials
 */
export function hasCredentials(data: any): boolean {
  if (data === null || data === undefined) {
    return false;
  }

  if (Array.isArray(data)) {
    return data.some(item => hasCredentials(item));
  }

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_FIELDS.some(field => 
        lowerKey.includes(field.toLowerCase())
      );
      
      if (isSensitive && value) {
        return true;
      }
      
      if (hasCredentials(value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sanitizes database discovery results
 */
export function sanitizeDiscoveryResults(results: any): any {
  if (!results) return results;

  const sanitized = { ...results };

  // Sanitize network discoveries
  if (sanitized.network && Array.isArray(sanitized.network)) {
    sanitized.network = sanitized.network.map((db: any) => ({
      ...db,
      password: db.password ? '[REDACTED]' : undefined,
      credentials: db.credentials ? '[REDACTED]' : undefined,
    }));
  }

  // Sanitize docker discoveries
  if (sanitized.docker && Array.isArray(sanitized.docker)) {
    sanitized.docker = sanitized.docker.map((db: any) => ({
      ...db,
      password: db.password ? '[REDACTED]' : undefined,
      env: db.env ? sanitizeCredentials(db.env) : undefined,
    }));
  }

  // Sanitize file discoveries
  if (sanitized.files && Array.isArray(sanitized.files)) {
    sanitized.files = sanitized.files.map((db: any) => ({
      ...db,
      password: db.password ? '[REDACTED]' : undefined,
      connectionString: db.connectionString ? sanitizeConnectionString(db.connectionString) : undefined,
    }));
  }

  return sanitized;
}

/**
 * Sanitizes connection strings by removing credentials
 */
export function sanitizeConnectionString(connStr: string): string {
  if (!connStr) return connStr;

  // PostgreSQL: postgresql://user:password@host:port/db
  // MySQL: mysql://user:password@host:port/db
  // MSSQL: Server=host;Database=db;User Id=user;Password=password;
  
  // Replace password in URL format
  let sanitized = connStr.replace(
    /(:\/\/[^:]+:)([^@]+)(@)/g,
    '$1[REDACTED]$3'
  );

  // Replace password in key-value format
  sanitized = sanitized.replace(
    /(password|pwd|passwd)=([^;]+)/gi,
    '$1=[REDACTED]'
  );

  return sanitized;
}
