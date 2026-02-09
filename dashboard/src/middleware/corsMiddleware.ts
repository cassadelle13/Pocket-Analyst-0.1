/**
 * CORS Middleware
 * Configures Cross-Origin Resource Sharing headers for security
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * CORS configuration
 */
interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Default CORS configuration
 */
const DEFAULT_CORS_CONFIG: CorsConfig = {
  allowedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token',
    'X-Datatalk-Agent-Secret',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Production CORS configuration (more restrictive)
 */
const PRODUCTION_CORS_CONFIG: CorsConfig = {
  allowedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || '',
    // Add your production domains here
  ].filter(Boolean),
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Datatalk-Agent-Secret',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 3600, // 1 hour
};

/**
 * Get CORS configuration based on environment
 */
function getCorsConfig(): CorsConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? PRODUCTION_CORS_CONFIG : DEFAULT_CORS_CONFIG;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!origin) return false;
  
  // Allow all origins in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // Check against whitelist
  return config.allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true;
    
    // Wildcard match (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain);
    }
    
    return false;
  });
}

/**
 * Apply CORS headers to response
 */
export function applyCorsHeaders(
  request: NextRequest,
  response: NextResponse,
  config: CorsConfig = getCorsConfig()
): NextResponse {
  const origin = request.headers.get('origin');
  
  // Check if origin is allowed
  if (origin && isOriginAllowed(origin, config)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (config.allowedOrigins.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  response.headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  response.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  response.headers.set('Access-Control-Max-Age', String(config.maxAge));
  
  if (config.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  return response;
}

/**
 * Handle preflight OPTIONS request
 */
export function handlePreflightRequest(
  request: NextRequest,
  config: CorsConfig = getCorsConfig()
): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return applyCorsHeaders(request, response, config);
}

/**
 * CORS middleware wrapper
 */
export function withCors(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config?: Partial<CorsConfig>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const corsConfig = { ...getCorsConfig(), ...config };
    
    // Handle preflight request
    if (request.method === 'OPTIONS') {
      return handlePreflightRequest(request, corsConfig);
    }
    
    // Handle actual request
    const response = await handler(request);
    return applyCorsHeaders(request, response, corsConfig);
  };
}

/**
 * Security headers middleware (additional protection)
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (basic)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: unsafe-eval needed for some chart libraries
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* https:",
    "frame-ancestors 'none'",
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', csp);
  
  // Permissions Policy
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  return response;
}

/**
 * Combined CORS + Security middleware
 */
export function withCorsAndSecurity(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config?: Partial<CorsConfig>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const corsConfig = { ...getCorsConfig(), ...config };
    
    // Handle preflight request
    if (request.method === 'OPTIONS') {
      return handlePreflightRequest(request, corsConfig);
    }
    
    // Handle actual request
    let response = await handler(request);
    response = applyCorsHeaders(request, response, corsConfig);
    response = applySecurityHeaders(response);
    
    return response;
  };
}
