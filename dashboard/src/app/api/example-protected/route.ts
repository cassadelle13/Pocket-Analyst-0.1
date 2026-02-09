/**
 * Example API Route with Rate Limiting
 * Shows how to apply rate limiting to any endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/middleware/rateLimitMiddleware';
import { RATE_LIMIT_PRESETS } from '@/lib/rateLimit';

async function handler(request: NextRequest) {
  // Your API logic here
  return NextResponse.json({ message: 'Success' });
}

// Export with rate limiting applied
export const GET = withRateLimit(handler, RATE_LIMIT_PRESETS.moderate);
export const POST = withRateLimit(handler, RATE_LIMIT_PRESETS.strict);
