import { NextRequest, NextResponse } from "next/server";
import {
  createConnectionPreset,
  deleteConnectionPreset,
  listConnectionPresets,
} from "../../../lib/connectionPresets";
import { ConnectionPresetInput } from "../../../types/connection";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get("driverId") ?? undefined;
    const presets = await listConnectionPresets(driverId ?? undefined);

    return NextResponse.json({ success: true, presets });
  } catch (error) {
    console.error("[connection-presets][GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConnectionPresetInput | null;

    if (!body?.name?.trim() || !body.driverId || !body.payload) {
      return NextResponse.json({ error: "name, driverId and payload are required" }, { status: 400 });
    }

    const preset = await createConnectionPreset({
      name: body.name.trim(),
      driverId: body.driverId,
      payload: body.payload,
    });

    return NextResponse.json({ success: true, preset });
  } catch (error) {
    console.error("[connection-presets][POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save preset" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Preset id is required" }, { status: 400 });
    }

    const deleted = await deleteConnectionPreset(id);

    if (!deleted) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[connection-presets][DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete preset" },
      { status: 500 }
    );
  }
}
