/**
 * Rate Limit Middleware
 * Applies rate limiting to all API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RateLimitConfig, RATE_LIMIT_PRESETS } from '@/lib/rateLimit';

/**
 * Gets client IP from request
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

/**
 * Rate limit middleware factory
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = RATE_LIMIT_PRESETS.moderate
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = checkRateLimit(ip, config);

    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + (retryAfter || 0) * 1000),
          },
        }
      );
    }

    return handler(request);
  };
}

/**
 * Endpoint-specific rate limit configs
 */
export const ENDPOINT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Critical endpoints - strict limits
  '/api/connect': RATE_LIMIT_PRESETS.strict,
  '/api/test-connection': RATE_LIMIT_PRESETS.strict,
  '/api/discover': RATE_LIMIT_PRESETS.strict,
  
  // Authentication/sensitive - strict limits
  '/api/insights': RATE_LIMIT_PRESETS.strict,
  '/api/gdpr/delete': RATE_LIMIT_PRESETS.strict,
  '/api/gdpr/export': RATE_LIMIT_PRESETS.strict,
  
  // Data modification - moderate limits
  '/api/profiles': RATE_LIMIT_PRESETS.moderate,
  '/api/audit': RATE_LIMIT_PRESETS.moderate,
  
  // Read-only endpoints - lenient limits
  '/api/metrics': RATE_LIMIT_PRESETS.lenient,
  '/api/rest/': RATE_LIMIT_PRESETS.lenient, // All /api/rest/* endpoints
  '/api/datatalk/': RATE_LIMIT_PRESETS.lenient, // All /api/datatalk/* endpoints
};

/**
 * Gets rate limit config for endpoint
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Check exact match first
  if (ENDPOINT_RATE_LIMITS[pathname]) {
    return ENDPOINT_RATE_LIMITS[pathname];
  }
  
  // Check prefix match
  for (const [prefix, config] of Object.entries(ENDPOINT_RATE_LIMITS)) {
    if (pathname.startsWith(prefix)) {
      return config;
    }
  }
  
  // Default to moderate
  return RATE_LIMIT_PRESETS.moderate;
}
