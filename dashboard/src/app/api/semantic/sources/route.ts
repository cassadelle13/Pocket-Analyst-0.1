import { NextRequest, NextResponse } from "next/server";

import { getSemanticModelById } from "../../../../lib/datatalkMetaDb";
import { validateSemanticModelV1 } from "../../../../lib/semantic/validator";
import { getDataTalkMetaPool } from "../../../../lib/datatalkMetaDb";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const projectId = String(sp.get("projectId") ?? "").trim();
    const semanticModelId = String(sp.get("semanticModelId") ?? "").trim();

    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    if (!semanticModelId) return NextResponse.json({ error: "semanticModelId is required" }, { status: 400 });

    const res = await getDataTalkMetaPool().query(
      `
      SELECT id, semantic_model_id, scope_type, scope_id, model_name, connection_id, table_key, created_at, updated_at
      FROM datatalk_meta.semantic_model_sources
      WHERE semantic_model_id = $1 AND scope_type = 'project' AND scope_id = $2
      ORDER BY model_name ASC
      `,
      [semanticModelId, projectId]
    );

    return NextResponse.json({ data: res.rows }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const projectId = String(body?.projectId ?? "").trim();
    const semanticModelId = String(body?.semanticModelId ?? "").trim();
    const modelName = String(body?.modelName ?? "").trim();
    const connectionId = String(body?.connectionId ?? "").trim();
    const tableKey = String(body?.tableKey ?? "").trim();

    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    if (!semanticModelId) return NextResponse.json({ error: "semanticModelId is required" }, { status: 400 });
    if (!modelName) return NextResponse.json({ error: "modelName is required" }, { status: 400 });
    if (!connectionId) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    if (!tableKey) return NextResponse.json({ error: "tableKey is required" }, { status: 400 });

    const modelRow = await getSemanticModelById(semanticModelId);
    if (!modelRow) return NextResponse.json({ error: "semantic model not found" }, { status: 404 });

    const validated = validateSemanticModelV1(modelRow.model_json);
    if (!validated.ok) {
      return NextResponse.json({ error: "semantic model is invalid", errors: validated.errors }, { status: 400 });
    }

    const hasModel = !!(modelRow.model_json as any)?.models?.[modelName];
    if (!hasModel) {
      return NextResponse.json({ error: `Unknown modelName: ${modelName}` }, { status: 400 });
    }

    const res = await getDataTalkMetaPool().query(
      `
      INSERT INTO datatalk_meta.semantic_model_sources (semantic_model_id, scope_type, scope_id, model_name, connection_id, table_key)
      VALUES ($1, 'project', $2, $3, $4, $5)
      ON CONFLICT (semantic_model_id, scope_type, scope_id, model_name)
      DO UPDATE SET connection_id = EXCLUDED.connection_id, table_key = EXCLUDED.table_key, updated_at = now()
      RETURNING id, semantic_model_id, scope_type, scope_id, model_name, connection_id, table_key, created_at, updated_at
      `,
      [semanticModelId, projectId, modelName, connectionId, tableKey]
    );

    return NextResponse.json({ data: res.rows[0] }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upsert source";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
