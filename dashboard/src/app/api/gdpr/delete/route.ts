import { NextRequest, NextResponse } from "next/server";
import { requestDataDeletion, cancelDataDeletion } from "../../../../lib/gdprCompliance";

export const dynamic = "force-dynamic";

/**
 * POST /api/gdpr/delete - Request user data deletion (GDPR Right to be Forgotten)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, gracePeriodDays } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // In production, verify that requester has permission
    const requestedBy = "system"; // Would get from auth token

    const deletionRequest = await requestDataDeletion(
      userId,
      requestedBy,
      gracePeriodDays || 30
    );

    return NextResponse.json({
      success: true,
      deletionRequest,
      message: `Data deletion scheduled for ${deletionRequest.scheduledFor.toISOString()}`,
    });
  } catch (error) {
    console.error("[GDPR Delete API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Deletion request failed",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gdpr/delete - Cancel deletion request
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      );
    }

    const cancelledBy = "system"; // Would get from auth token

    await cancelDataDeletion(requestId, cancelledBy);

    return NextResponse.json({
      success: true,
      message: "Deletion request cancelled",
    });
  } catch (error) {
    console.error("[GDPR Cancel Delete API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cancellation failed",
      },
      { status: 500 }
    );
  }
}
