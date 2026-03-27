import { NextRequest, NextResponse } from "next/server";

import { getSemanticModelById, getSemanticModelBinding, upsertSemanticModelBinding } from "../../../../lib/datatalkMetaDb";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const projectId = String(sp.get("projectId") ?? "").trim();
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

    const binding = await getSemanticModelBinding("project", projectId);
    if (!binding) return NextResponse.json({ data: null }, { status: 200 });

    const model = await getSemanticModelById(binding.semantic_model_id);
    return NextResponse.json({ data: { binding, model } }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load binding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId = String(body?.projectId ?? "").trim();
    const semanticModelId = String(body?.semanticModelId ?? "").trim();

    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    if (!semanticModelId) return NextResponse.json({ error: "semanticModelId is required" }, { status: 400 });

    const model = await getSemanticModelById(semanticModelId);
    if (!model) return NextResponse.json({ error: "semantic model not found" }, { status: 404 });

    const binding = await upsertSemanticModelBinding("project", projectId, semanticModelId);
    return NextResponse.json({ data: { binding } }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to set binding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
