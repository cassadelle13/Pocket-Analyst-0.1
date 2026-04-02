import { NextRequest, NextResponse } from "next/server";

import { pickDefaultConnection } from "../../../../lib/defaultConnectionPick";
import { createSemanticModel, getDataTalkMetaPool, getSemanticModelBinding, getSemanticModelById, listConnections, updateSemanticModel, upsertSemanticModelBinding } from "../../../../lib/datatalkMetaDb";
import { normalizeSemanticModelV1, validateSemanticModelV1 } from "../../../../lib/semantic/validator";
import type { SemanticModelV1 } from "../../../../lib/semantic/types";
import { SchemaIntelligenceService } from "../../../../lib/schema-intelligence";

function pickDefaultConnectionId(connections: Array<{ id: string; name: string }> | null | undefined): string {
  const picked = pickDefaultConnection(connections);
  return picked ? String(picked.id) : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

    const explicitConnectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    const connectionId = explicitConnectionId || pickDefaultConnectionId(await listConnections().catch(() => []));
    if (!connectionId) return NextResponse.json({ error: "connectionId is required (and no default connection was found)" }, { status: 400 });

    const force = body?.force === true;

    const schemaRes = await fetch(`${request.nextUrl.origin}/api/datatalk/schema`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
      cache: "no-store",
    });

    const schemaJson = await schemaRes.json().catch(() => ({}));
    if (!schemaRes.ok) {
      return NextResponse.json({ error: schemaJson?.error ?? "Failed to load schema" }, { status: 502 });
    }

    const built = SchemaIntelligenceService.buildSemanticModelV1FromSchemaResponse(schemaJson?.data ?? {});
    const model = built?.semanticModel as SemanticModelV1;
    const modelToTableKey = (built?.modelToTableKey ?? {}) as Record<string, string>;

    const validated = validateSemanticModelV1(model);
    if (!validated.ok) {
      return NextResponse.json({ error: "Generated semantic model is invalid", errors: validated.errors }, { status: 400 });
    }

    const normalized = normalizeSemanticModelV1(model);

    const existingBinding = await getSemanticModelBinding("project", projectId).catch(() => null);
    const existingModelRow = existingBinding?.semantic_model_id
      ? await getSemanticModelById(String(existingBinding.semantic_model_id)).catch(() => null)
      : null;

    const isDemoModel = (() => {
      const mj = existingModelRow?.model_json;
      const models = mj && typeof mj === "object" ? (mj as any).models : null;
      if (!models || typeof models !== "object") return false;
      const keys = Object.keys(models);
      return keys.length === 1 && keys[0] === "events";
    })();

    const isSafeToOverwrite = !!(existingModelRow && String(existingModelRow.description ?? "") === "Auto-generated from schema");

    if (existingBinding && existingModelRow && !isSafeToOverwrite && !isDemoModel && !force) {
      return NextResponse.json(
        {
          data: {
            skipped: true,
            reason: "Project already has a non-auto semantic model binding; pass force=true to rebind",
            binding: existingBinding,
            semanticModelId: existingModelRow.id,
          },
        },
        { status: 200 }
      );
    }

    const semanticModelId = isSafeToOverwrite
      ? String(existingModelRow!.id)
      : String(
          (
            await createSemanticModel({
              name: `Auto: ${projectId}`,
              description: "Auto-generated from schema",
              modelJson: normalized,
            })
          ).id
        );

    if (isSafeToOverwrite) {
      await updateSemanticModel(semanticModelId, {
        name: String(existingModelRow!.name ?? `Auto: ${projectId}`),
        description: "Auto-generated from schema",
        modelJson: normalized,
      });
    }

    const binding = await upsertSemanticModelBinding("project", projectId, semanticModelId);

    const pool = getDataTalkMetaPool();
    for (const modelName of Object.keys((normalized as any)?.models ?? {})) {
      const tableKey = String(modelToTableKey?.[modelName] ?? "").trim();
      if (!tableKey) continue;
      await pool.query(
        `
        INSERT INTO datatalk_meta.semantic_model_sources (semantic_model_id, scope_type, scope_id, model_name, connection_id, table_key)
        VALUES ($1, 'project', $2, $3, $4, $5)
        ON CONFLICT (semantic_model_id, scope_type, scope_id, model_name)
        DO UPDATE SET connection_id = EXCLUDED.connection_id, table_key = EXCLUDED.table_key, updated_at = now()
        `,
        [semanticModelId, projectId, modelName, connectionId, tableKey]
      );
    }

    return NextResponse.json(
      {
        data: {
          connectionId,
          binding,
          semanticModelId,
          model: normalized,
          modelToTableKey,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to bootstrap semantic model";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
