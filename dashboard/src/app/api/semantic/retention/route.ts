import { NextRequest, NextResponse } from "next/server";

import { getConnectionById, getSemanticModelBinding, getSemanticModelById } from "../../../../lib/datatalkMetaDb";
import type { GlobalFilterContextV1, SemanticModelV1 } from "../../../../lib/semantic/types";
import { compilePivotQuery, compilePivotQueryRaw } from "../../../../lib/semantic/retentionCompiler";
import { pickPivotMode, pivotClientSide } from "../../../../lib/semantic/pivot";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const semanticDebug = String(process.env.SEMANTIC_DEBUG ?? "").trim() === "1" || body?.debug === true;
    const rid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const query = body?.query && typeof body.query === "object" ? body.query : null;
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const globalContextRaw = body?.globalContext ?? null;
    const globalContext = (globalContextRaw && typeof globalContextRaw === "object")
      ? (globalContextRaw as GlobalFilterContextV1)
      : null;

    const requestContextRaw = body?.requestContext ?? null;
    const requestContext = (requestContextRaw && typeof requestContextRaw === "object")
      ? {
          chartId: typeof (requestContextRaw as any)?.chartId === "string" ? String((requestContextRaw as any).chartId).trim() : undefined,
          pageKey: typeof (requestContextRaw as any)?.pageKey === "string" ? String((requestContextRaw as any).pageKey).trim() : undefined,
        }
      : null;

    const semanticModelIdExplicit = typeof body?.semanticModelId === "string" ? body.semanticModelId.trim() : "";
    const binding = semanticModelIdExplicit ? null : await getSemanticModelBinding("project", projectId);
    const semanticModelId = semanticModelIdExplicit || (binding?.semantic_model_id ? String(binding.semantic_model_id) : "");

    let compiled: ReturnType<typeof compilePivotQuery>;
    let dialectHint: "clickhouse" | "postgres" = "postgres";

    if (!semanticModelId) {
      const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
      if (!connectionId) {
        return NextResponse.json(
          { error: "semanticModelId is required (or provide connectionId + rawQuery for raw retention path)" },
          { status: 400 }
        );
      }

      const conn = await getConnectionById(connectionId).catch(() => null);
      if (!conn) {
        return NextResponse.json({ error: "connection not found for raw retention path" }, { status: 404 });
      }

      dialectHint = conn.type === "clickhouse" ? "clickhouse" : "postgres";

      const rawQuery = (body?.rawQuery && typeof body.rawQuery === "object")
        ? body.rawQuery
        : ((query as any)?.rawQuery && typeof (query as any).rawQuery === "object")
          ? (query as any).rawQuery
          : null;
      if (!rawQuery) {
        return NextResponse.json(
          { error: "rawQuery is required when semantic model is not bound" },
          { status: 400 }
        );
      }

      compiled = compilePivotQueryRaw({
        query: rawQuery as any,
        dialectHint,
        connectionId,
        connectionType: conn.type,
      });
    } else {
      const modelRow = await getSemanticModelById(semanticModelId);
      if (!modelRow) {
        return NextResponse.json({ error: "semantic model not found" }, { status: 404 });
      }

      const semanticModel = (modelRow.model_json ?? null) as SemanticModelV1 | null;
      if (!semanticModel || typeof semanticModel !== "object") {
        return NextResponse.json({ error: "semantic model is invalid" }, { status: 400 });
      }

      const pool = (await import("../../../../lib/datatalkMetaDb")).getDataTalkMetaPool();
      const sourcesRes = await pool.query(
        `
        SELECT model_name, connection_id, table_key
        FROM datatalk_meta.semantic_model_sources
        WHERE semantic_model_id = $1 AND scope_type = 'project' AND scope_id = $2
        `,
        [semanticModelId, projectId]
      );

      const sourceBindings: Record<string, { connectionId: string; tableKey: string; connectionType?: string }> = {};
      for (const r of sourcesRes.rows as any[]) {
        const mn = String(r?.model_name ?? "").trim();
        const cid = String(r?.connection_id ?? "").trim();
        const tk = String(r?.table_key ?? "").trim();
        if (mn && cid && tk) sourceBindings[mn] = { connectionId: cid, tableKey: tk };
      }

      const sourceModelName = typeof (query as any)?.sourceModel === "string" ? String((query as any).sourceModel) : "";
      const boundForSource = sourceModelName ? sourceBindings[sourceModelName] : null;
      const conn = boundForSource?.connectionId ? await getConnectionById(boundForSource.connectionId).catch(() => null) : null;
      dialectHint = (conn?.type === "clickhouse") ? "clickhouse" : "postgres";
      if (boundForSource && conn?.type) {
        boundForSource.connectionType = conn.type;
      }

      compiled = compilePivotQuery({
        semanticModel: semanticModel as any,
        query: query as any,
        globalContext,
        dialectHint: dialectHint as any,
        sourceBindings,
        requestContext,
      });
    }

    if (semanticDebug) {
      try {
        console.log("[semantic.cohort_pivot.compiled]", {
          rid,
          dialectHint,
          connectionId: compiled.connectionId,
          sqlPreview: String(compiled.sql ?? "").slice(0, 5000),
        });
      } catch {}
    }

    const desiredPivotMode = (query as any)?.pivotMode ?? compiled.pivot.mode;

    // First run a (potentially long) query to learn rowCount for auto mode.
    const resLong = await fetch(`${request.nextUrl.origin}/api/datatalk/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: compiled.connectionId,
        sql: compiled.sql,
        role: body?.role,
        maxRows: body?.maxRows,
        timeoutMs: body?.timeoutMs,
      }),
      cache: "no-store",
    });

    const jsonLong = await resLong.json().catch(() => ({}));
    if (!resLong.ok) {
      return NextResponse.json({ error: jsonLong?.error ?? "Query failed" }, { status: resLong.status });
    }

    const longColumns = Array.isArray(jsonLong?.data?.columns) ? (jsonLong.data.columns as string[]) : [];
    const longRows = Array.isArray(jsonLong?.data?.rows) ? (jsonLong.data.rows as unknown[][]) : [];
    const rowCount = typeof jsonLong?.data?.rowCount === "number" ? (jsonLong.data.rowCount as number) : longRows.length;

    const effectivePivotMode = pickPivotMode({
      mode: desiredPivotMode,
      rowCount,
      threshold: compiled.pivot.rowLimit,
    });

    if (effectivePivotMode === "sql" && semanticModelId) {
      const modelRow = await getSemanticModelById(semanticModelId);
      if (!modelRow) {
        return NextResponse.json({ error: "semantic model not found" }, { status: 404 });
      }
      const semanticModel = (modelRow.model_json ?? null) as SemanticModelV1 | null;
      if (!semanticModel || typeof semanticModel !== "object") {
        return NextResponse.json({ error: "semantic model is invalid" }, { status: 400 });
      }

      const pool = (await import("../../../../lib/datatalkMetaDb")).getDataTalkMetaPool();
      const sourcesRes = await pool.query(
        `
        SELECT model_name, connection_id, table_key
        FROM datatalk_meta.semantic_model_sources
        WHERE semantic_model_id = $1 AND scope_type = 'project' AND scope_id = $2
        `,
        [semanticModelId, projectId]
      );

      const sourceBindings: Record<string, { connectionId: string; tableKey: string; connectionType?: string }> = {};
      for (const r of sourcesRes.rows as any[]) {
        const mn = String(r?.model_name ?? "").trim();
        const cid = String(r?.connection_id ?? "").trim();
        const tk = String(r?.table_key ?? "").trim();
        if (mn && cid && tk) sourceBindings[mn] = { connectionId: cid, tableKey: tk };
      }

      const sourceModelName = typeof (query as any)?.sourceModel === "string" ? String((query as any).sourceModel) : "";
      const boundForSource = sourceModelName ? sourceBindings[sourceModelName] : null;
      const conn = boundForSource?.connectionId ? await getConnectionById(boundForSource.connectionId).catch(() => null) : null;
      if (boundForSource && conn?.type) {
        boundForSource.connectionType = conn.type;
      }

      const compiledWide = compilePivotQuery({
        semanticModel: semanticModel as any,
        query: { ...(query as any), pivotMode: "sql" } as any,
        globalContext,
        dialectHint: dialectHint as any,
        sourceBindings,
        requestContext,
      });

      const resWide = await fetch(`${request.nextUrl.origin}/api/datatalk/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: compiledWide.connectionId,
          sql: compiledWide.sql,
          role: body?.role,
          maxRows: body?.maxRows,
          timeoutMs: body?.timeoutMs,
        }),
        cache: "no-store",
      });

      const jsonWide = await resWide.json().catch(() => ({}));
      if (!resWide.ok) {
        return NextResponse.json({ error: jsonWide?.error ?? "Query failed" }, { status: resWide.status });
      }

      const out = { ...jsonWide.data, pivoted: null as any };
      const debug = body?.debug ? {
        rid,
        sql: compiledWide.sql,
        dialectHint,
        pivot: {
          desired: desiredPivotMode,
          effective: effectivePivotMode,
          rowCount,
          threshold: compiled.pivot.rowLimit,
        },
        ...(compiledWide.debug ? { compiledDebug: compiledWide.debug } : {}),
      } : undefined;

      return NextResponse.json({ data: out, debug }, { status: 200 });
    }

    const out = { ...jsonLong.data, pivoted: null as any };

    if (effectivePivotMode === "client") {
      const data = longRows.map((r) => {
        const o: Record<string, unknown> = {};
        for (let i = 0; i < longColumns.length; i++) {
          o[String(longColumns[i])] = (r as any)?.[i];
        }
        return o;
      });

      out.pivoted = pivotClientSide({
        data,
        spec: compiled.pivot.spec,
        rowLimit: compiled.pivot.rowLimit,
      });
    }

    const debug = body?.debug ? {
      rid,
      sql: compiled.sql,
      dialectHint,
      pivot: {
        desired: desiredPivotMode,
        effective: effectivePivotMode,
        rowCount,
        threshold: compiled.pivot.rowLimit,
      },
      ...(compiled.debug ? { compiledDebug: compiled.debug } : {}),
    } : undefined;

    return NextResponse.json({ data: out, debug }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to run cohort pivot query";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
