import { NextRequest, NextResponse } from "next/server";

import {
  createSemanticModel,
  listSemanticModels,
  updateSemanticModel,
} from "../../../../lib/datatalkMetaDb";

export async function GET() {
  try {
    const data = await listSemanticModels();
    return NextResponse.json({ data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list semantic models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const modelJson = body?.modelJson ?? body?.model ?? {};

    const compileRes = await fetch(`${request.nextUrl.origin}/api/semantic/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelJson }),
      cache: "no-store",
    });

    const compiled = await compileRes.json().catch(() => ({}));
    if (!compileRes.ok || compiled?.ok !== true) {
      return NextResponse.json({ error: "Invalid semantic model", errors: compiled?.errors ?? [] }, { status: 400 });
    }

    const created = await createSemanticModel({
      name,
      description: typeof body?.description === "string" ? body.description : null,
      modelJson: compiled?.model ?? modelJson,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create semantic model";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const modelJson = body?.modelJson ?? body?.model ?? {};

    const compileRes = await fetch(`${request.nextUrl.origin}/api/semantic/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelJson }),
      cache: "no-store",
    });

    const compiled = await compileRes.json().catch(() => ({}));
    if (!compileRes.ok || compiled?.ok !== true) {
      return NextResponse.json({ error: "Invalid semantic model", errors: compiled?.errors ?? [] }, { status: 400 });
    }

    const updated = await updateSemanticModel(id, {
      name,
      description: typeof body?.description === "string" ? body.description : null,
      modelJson: compiled?.model ?? modelJson,
    });

    if (!updated) return NextResponse.json({ error: "semantic model not found" }, { status: 404 });
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update semantic model";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
