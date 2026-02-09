import { NextRequest, NextResponse } from "next/server";
import { queryAuditLogs, getAuditStats, type AuditLogQuery } from "../../../lib/auditLog";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit - Query audit logs
 * Query params: userId, action, resourceType, startDate, endDate, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const query: AuditLogQuery = {
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') as any || undefined,
      resourceType: searchParams.get('resourceType') as any || undefined,
      resourceId: searchParams.get('resourceId') || undefined,
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      success: searchParams.get('success') ? searchParams.get('success') === 'true' : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
    };

    const logs = await queryAuditLogs(query);

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("[Audit API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to query audit logs",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audit/stats - Get audit statistics
 * Query params: days (default 7)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const days = body.days || 7;

    const stats = await getAuditStats(days);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[Audit Stats API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get audit stats",
      },
      { status: 500 }
    );
  }
}
