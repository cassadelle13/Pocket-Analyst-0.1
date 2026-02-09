/**
 * Environment Variables Validation
 * Validates required environment variables on application startup
 * Prevents runtime errors in production
 */

interface EnvConfig {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

const ENV_SCHEMA: EnvConfig[] = [
  // ClickHouse
  { name: 'CLICKHOUSE_HOST', required: true, description: 'ClickHouse server host' },
  { name: 'CLICKHOUSE_PORT', required: false, description: 'ClickHouse server port', defaultValue: '8123' },
  { name: 'CLICKHOUSE_DATABASE', required: true, description: 'ClickHouse database name' },
  { name: 'CLICKHOUSE_USER', required: false, description: 'ClickHouse username', defaultValue: 'default' },
  { name: 'CLICKHOUSE_PASSWORD', required: false, description: 'ClickHouse password', defaultValue: '' },
  
  // DataTalk Agent
  { name: 'DATATALK_AGENT_URL', required: true, description: 'DataTalk Agent URL' },
  { name: 'DATATALK_AGENT_SHARED_SECRET', required: true, description: 'DataTalk Agent shared secret for authentication' },
  
  // Jitsu (optional)
  { name: 'JITSU_HOST', required: false, description: 'Jitsu server host' },
  { name: 'JITSU_PORT', required: false, description: 'Jitsu server port' },
  { name: 'JITSU_WRITE_KEY', required: false, description: 'Jitsu write key' },
  
  // Dify (optional)
  { name: 'DIFY_API_URL', required: false, description: 'Dify API URL' },
  { name: 'DIFY_API_KEY', required: false, description: 'Dify API key' },
  
  // Security
  { name: 'CREDENTIAL_VAULT_MASTER_KEY', required: false, description: 'Master key for credential encryption' },
  { name: 'NETWORK_SCAN_WHITELIST_ENABLED', required: false, description: 'Enable network scan whitelist', defaultValue: 'false' },
  
  // App
  { name: 'NEXT_PUBLIC_APP_URL', required: false, description: 'Public app URL', defaultValue: 'http://localhost:3000' },
];

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates all required environment variables
 * @throws {EnvValidationError} if validation fails
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const config of ENV_SCHEMA) {
    const value = process.env[config.name];
    
    if (config.required && !value) {
      errors.push(`Missing required environment variable: ${config.name} - ${config.description}`);
    } else if (!value && config.defaultValue) {
      warnings.push(`Using default value for ${config.name}: ${config.defaultValue}`);
      process.env[config.name] = config.defaultValue;
    }
  }
  
  // Log warnings
  if (warnings.length > 0) {
    console.warn('⚠️  Environment variable warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
  
  // Throw error if validation failed
  if (errors.length > 0) {
    const errorMessage = [
      '❌ Environment validation failed:',
      ...errors.map(err => `  - ${err}`),
      '',
      'Please check your .env file and ensure all required variables are set.',
      'See .env.example for reference.'
    ].join('\n');
    
    throw new EnvValidationError(errorMessage);
  }
  
  console.log('✅ Environment variables validated successfully');
}

/**
 * Gets a required environment variable
 * @throws {EnvValidationError} if variable is not set
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new EnvValidationError(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Gets an optional environment variable with default value
 */
export function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Checks if environment variable is set
 */
export function hasEnv(name: string): boolean {
  return !!process.env[name];
}
