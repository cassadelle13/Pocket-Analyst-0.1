import { NextResponse } from "next/server";
import { initAuditLogTable } from "../../../lib/auditLog";

export const dynamic = "force-dynamic";

/**
 * POST /api/init - Initialize database tables
 * Should be called on application startup
 */
export async function POST() {
  try {
    // Initialize audit log table
    await initAuditLogTable();

    return NextResponse.json({
      success: true,
      message: "Database tables initialized successfully",
    });
  } catch (error) {
    console.error("[Init API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      },
      { status: 500 }
    );
  }
}
