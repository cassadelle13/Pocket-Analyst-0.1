import { NextRequest, NextResponse } from "next/server";
import { exportUserData } from "../../../../lib/gdprCompliance";

export const dynamic = "force-dynamic";

/**
 * POST /api/gdpr/export - Export user data (GDPR Right to Access)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // In production, verify that requester has permission
    const exportedBy = "system"; // Would get from auth token

    const exportData = await exportUserData(userId, exportedBy);

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="user_data_${userId}_${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error("[GDPR Export API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Export failed",
      },
      { status: 500 }
    );
  }
}
