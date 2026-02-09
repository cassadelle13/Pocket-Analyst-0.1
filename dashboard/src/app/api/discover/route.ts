import { NextResponse, NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rateLimit";
import discoveryCache, { CACHE_TTL, getCacheKey } from "@/lib/discoveryCache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get("x-forwarded-for") || 
               request.headers.get("x-real-ip") || 
               "unknown";
    
    const rateLimit = checkRateLimit(ip, RATE_LIMIT_PRESETS.moderate);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: rateLimit.retryAfter,
        },
        { 
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfter || 60),
          },
        }
      );
    }

    // Get mode from query params
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "quick";
    const skipCache = searchParams.get("skipCache") === "true";

    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cacheKey = getCacheKey(mode, ip);
      const cached = discoveryCache.get(cacheKey);
      
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true,
          cacheAge: Date.now() - cached.timestamp,
        });
      }
    }

    const agentUrl = process.env.DATATALK_AGENT_URL || "http://datatalk-agent:9010";
    const agentSecret = process.env.DATATALK_AGENT_SHARED_SECRET;

    const response = await fetch(`${agentUrl}/discover?mode=${mode}`, {
      method: "GET",
      headers: {
        ...(agentSecret ? { "x-datatalk-agent-secret": agentSecret } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discovery failed: ${errorText}`);
    }

    const data = await response.json();
    
    // Cache the result
    const cacheKey = getCacheKey(mode, ip);
    const ttl = mode === "full" ? CACHE_TTL.full : CACHE_TTL.quick;
    discoveryCache.set(cacheKey, { ...data, timestamp: Date.now() }, ttl);
    
    return NextResponse.json({
      ...data,
      cached: false,
    });
  } catch (error) {
    console.error("[Discover API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Discovery failed",
      },
      { status: 500 }
    );
  }
}
