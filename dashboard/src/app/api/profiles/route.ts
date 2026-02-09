import { NextRequest, NextResponse } from "next/server";
import {
  saveConnectionProfile,
  loadConnectionProfiles,
  deleteConnectionProfile,
  updateProfileLastUsed,
} from "../../../lib/remoteConnection";

export const dynamic = "force-dynamic";

/**
 * GET /api/profiles - Load connection profiles
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as any;

    const profiles = await loadConnectionProfiles(type);

    return NextResponse.json({
      success: true,
      profiles,
    });
  } catch (error) {
    console.error("[Profiles API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load profiles",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profiles - Save connection profile
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, host, port, database, username, sshTunnel, tags } = body;

    if (!name || !type || !host || !port) {
      return NextResponse.json(
        { error: "Name, type, host, and port are required" },
        { status: 400 }
      );
    }

    const profile = await saveConnectionProfile({
      name,
      type,
      host,
      port,
      database,
      username,
      sshTunnel,
      tags,
    });

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("[Profiles API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save profile",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/profiles - Delete connection profile
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("id");

    if (!profileId) {
      return NextResponse.json(
        { error: "Profile ID is required" },
        { status: 400 }
      );
    }

    await deleteConnectionProfile(profileId);

    return NextResponse.json({
      success: true,
      message: "Profile deleted",
    });
  } catch (error) {
    console.error("[Profiles API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete profile",
      },
      { status: 500 }
    );
  }
}
