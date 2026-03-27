import { NextRequest, NextResponse } from "next/server";

import { getConnectionById, getSemanticModelBinding, getSemanticModelById } from "../../../../lib/datatalkMetaDb";
import { compileSemanticQuery, scopeBiFiltersForRequest } from "../../../../lib/semantic/planner";
import { classifyFieldRef } from "../../../../lib/semantic/fieldClassifier";
import type { GlobalFilterContextV1, LogicalQuery, SemanticModelV1, SemanticQueryRequest } from "../../../../lib/semantic/types";
import { buildCacheKey, getTtlPolicyByHint, withCachedResult } from "../../../../lib/queryResultCache";
import { validateLogicalQuery, validateSemanticQueryRequest } from "../../../../lib/semantic/validator";
import { createRequestId, logQueryEvent, recordQueryMetric } from "../../../../lib/queryObservability";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rid = createRequestId("semq");
  try {
    const body = (await request.json()) as SemanticQueryRequest;
    const validatedRequest = validateSemanticQueryRequest(body);
    if (!validatedRequest.ok) {
      return NextResponse.json(
        {
          error: "Invalid semantic query request",
          details: validatedRequest.errors,
          queryError: {
            code: "INVALID_REQUEST",
            message: "Invalid semantic query request",
            details: validatedRequest.errors,
          },
        },
        { status: 400 }
      );
    }

    const semanticDebug = String(process.env.SEMANTIC_DEBUG ?? "").trim() === "1" || body?.debug === true;
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";

    const hasEmbeddedSemanticModel = !!(body?.semanticModel && typeof body.semanticModel === "object");
    const semanticModelIdExplicit = typeof body?.semanticModelId === "string" ? body.semanticModelId.trim() : "";
    const binding = (!hasEmbeddedSemanticModel && semanticModelIdExplicit)
      ? null
      : (projectId ? await getSemanticModelBinding("project", projectId) : null);
    const semanticModelId = hasEmbeddedSemanticModel
      ? (semanticModelIdExplicit || "embedded")
      : (semanticModelIdExplicit || (binding?.semantic_model_id ? String(binding.semantic_model_id) : ""));
    if (!hasEmbeddedSemanticModel && !semanticModelId) {
      return NextResponse.json(
        {
          error: "semanticModelId is required (or bind one for this project)",
          queryError: { code: "INVALID_REQUEST", message: "semanticModelId is required (or bind one for this project)" },
        },
        { status: 400 }
      );
    }

    const query = (body?.query ?? null) as LogicalQuery | null;
    if (!query || typeof query !== "object") {
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

    if (semanticDebug) {
      try {
        const gf = Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [];
        const paramsKeys = (globalContext as any)?.params && typeof (globalContext as any).params === "object"
          ? Object.keys((globalContext as any).params)
          : [];
        console.log("[semantic.query]", {
          rid,
          projectId,
          semanticModelId,
          requestContext,
          globalFiltersCount: gf.length,
          paramsKeys,
          globalFilters: gf.map((f: any) => ({
            scope: f?.scope,
            pageKey: f?.pageKey,
            sourceChartId: f?.sourceChartId,
            field: f?.field,
            op: f?.op,
            valuesCount: Array.isArray(f?.values) ? f.values.length : (f?.values != null ? 1 : 0),
          })),
        });
      } catch {}
    }

    const semanticModel = hasEmbeddedSemanticModel
      ? (body.semanticModel as SemanticModelV1)
      : (((await getSemanticModelById(semanticModelId))?.model_json ?? null) as SemanticModelV1 | null);
    if (!semanticModel || typeof semanticModel !== "object") {
      return NextResponse.json(
        {
          error: "semantic model is invalid",
          queryError: { code: "INVALID_MODEL", message: "semantic model is invalid" },
        },
        { status: 400 }
      );
    }

    const validatedLogical = validateLogicalQuery(query, semanticModel);
    if (!validatedLogical.ok) {
      return NextResponse.json(
        {
          error: "logical query is invalid",
          details: validatedLogical.errors,
          queryError: {
            code: "INVALID_QUERY",
            message: "logical query is invalid",
            details: validatedLogical.errors,
          },
        },
        { status: 400 }
      );
    }

    const normalizeLogicalQuery = (rawQuery: LogicalQuery): LogicalQuery => {
      const src = String((rawQuery as any)?.sourceModel ?? "").trim();
      const modelsObj = (semanticModel as any)?.models && typeof (semanticModel as any).models === "object"
        ? (semanticModel as any).models
        : {};
      if (!src || !Object.prototype.hasOwnProperty.call(modelsObj, src)) {
        return rawQuery;
      }

      const toRef = (raw: string): string => {
        const s = String(raw ?? "").trim();
        if (!s) return "";
        return s.includes(".") ? s : `${src}.${s}`;
      };

      const dimsIn = Array.isArray((rawQuery as any)?.dimensions) ? (rawQuery as any).dimensions : [];
      const measIn = Array.isArray((rawQuery as any)?.measures) ? (rawQuery as any).measures : [];
      const measV2In = Array.isArray((rawQuery as any)?.measuresV2) ? (rawQuery as any).measuresV2 : [];
      const tableVizRequested = String((rawQuery as any)?.vizType ?? (rawQuery as any)?.__vizType ?? "").trim().toLowerCase() === "table";
      const measureAggOverridesIn = ((rawQuery as any)?.measureAggOverrides && typeof (rawQuery as any).measureAggOverrides === "object")
        ? ((rawQuery as any).measureAggOverrides as Record<string, unknown>)
        : {};
      const measureAggOverridesOut = Object.fromEntries(
        Object.entries(measureAggOverridesIn)
          .map(([k, v]) => {
            const key = toRef(String(k ?? ""));
            if (!key) return ["", ""];
            return [key, v];
          })
          .filter(([k]) => !!String(k).trim())
      ) as Record<string, unknown>;
      const hasAggOverride = (ref: string): boolean => {
        const qualified = toRef(ref);
        if (!qualified) return false;
        if (Object.prototype.hasOwnProperty.call(measureAggOverridesOut, qualified)) return true;
        const field = qualified.split(".").slice(1).join(".");
        return !!field && Object.prototype.hasOwnProperty.call(measureAggOverridesOut, field);
      };
      const noFallbackMeasure = (rawQuery as any)?.noFallbackMeasure === true;

      const dimsOut: string[] = [];
      const measOut: string[] = [];

      for (const d of dimsIn) {
        const ref = toRef(String(d ?? ""));
        if (!ref) continue;
        const kind = classifyFieldRef(ref, semanticModel as SemanticModelV1);
        if (kind === "measure") measOut.push(ref);
        else dimsOut.push(ref);
      }

      for (const m of measIn) {
        const ref = toRef(String(m ?? ""));
        if (!ref) continue;
        const kind = classifyFieldRef(ref, semanticModel as SemanticModelV1);
        if (kind === "dimension" && !hasAggOverride(ref)) dimsOut.push(ref);
        else measOut.push(ref);
      }

      const measV2Out = measV2In
        .map((m: any) => {
          const ref = toRef(String(m?.ref ?? ""));
          if (!ref) return null;
          const aggFn = String(m?.aggFn ?? "").trim();
          return aggFn ? { ref, aggFn } : { ref };
        })
        .filter(Boolean);

      const dimsUnique = Array.from(new Set(dimsOut.map((x) => String(x).trim()).filter(Boolean)));
      let measUnique = Array.from(new Set(measOut.map((x) => String(x).trim()).filter(Boolean)));
      if (measUnique.length === 0 && !noFallbackMeasure && !tableVizRequested && Object.keys(measureAggOverridesOut).length === 0) {
        const srcDef = (modelsObj as any)?.[src];
        const srcMeasures = srcDef?.measures && typeof srcDef.measures === "object" ? Object.keys(srcDef.measures) : [];
        const fallback = String(srcMeasures[0] ?? "").trim();
        if (fallback) measUnique = [`${src}.${fallback}`];
      }

      return {
        ...(rawQuery as any),
        sourceModel: src,
        dimensions: dimsUnique,
        measures: measUnique,
        ...(measV2Out.length > 0 ? { measuresV2: measV2Out } : {}),
        ...(Object.keys(measureAggOverridesOut).length > 0 ? { measureAggOverrides: measureAggOverridesOut } : {}),
        ...((noFallbackMeasure || tableVizRequested) ? { noFallbackMeasure: true } : {}),
      } as LogicalQuery;
    };
    const normalizedQuery = (() => {
      const q = normalizeLogicalQuery(query);
      const page = Number((body as any)?.page);
      const pageSize = Number((body as any)?.pageSize);
      const offsetRows = Number((body as any)?.offsetRows);
      const existingLimit = Number((q as any)?.limit);
      const existingOffset = Number((q as any)?.offset);
      const resolvedLimit = Number.isFinite(pageSize) && pageSize > 0
        ? Math.floor(pageSize)
        : (Number.isFinite(existingLimit) && existingLimit > 0 ? Math.floor(existingLimit) : 500);
      const resolvedOffset = Number.isFinite(page) && page > 0 && Number.isFinite(pageSize) && pageSize > 0
        ? Math.floor((page - 1) * pageSize)
        : (Number.isFinite(offsetRows) && offsetRows >= 0
          ? Math.floor(offsetRows)
          : (Number.isFinite(existingOffset) && existingOffset >= 0 ? Math.floor(existingOffset) : 0));
      return {
        ...(q as any),
        limit: Math.max(1, Math.min(50_000, resolvedLimit)),
        ...(resolvedOffset > 0 ? { offset: resolvedOffset } : {}),
      } as LogicalQuery;
    })();

    // Allow per-request ephemeral calculated measures (for UI preview / derived metrics builder).
    // This does not persist in DB and does not allow raw SQL injection beyond what semantic model already allows.
    // It reuses existing calculatedMeasures expression parsing in the planner.
    const ephemeralCalculatedMeasures = (body?.ephemeralCalculatedMeasures && typeof body.ephemeralCalculatedMeasures === "object")
      ? body.ephemeralCalculatedMeasures
      : null;
    const sourceModelForEphemeral = typeof (normalizedQuery as any)?.sourceModel === "string"
      ? String((normalizedQuery as any).sourceModel)
      : "";
    const semanticModelForRequest: SemanticModelV1 = (() => {
      if (!ephemeralCalculatedMeasures) return semanticModel as any;
      const sm = semanticModel as any;
      const mn = String(sourceModelForEphemeral ?? "").trim();
      if (!mn) return sm;
      const modelDef = sm?.models?.[mn];
      if (!modelDef || typeof modelDef !== "object") return sm;

      const prevCalc = modelDef.calculatedMeasures && typeof modelDef.calculatedMeasures === "object" ? modelDef.calculatedMeasures : {};
      const merged = { ...prevCalc, ...ephemeralCalculatedMeasures };
      return {
        ...sm,
        models: {
          ...sm.models,
          [mn]: {
            ...modelDef,
            calculatedMeasures: merged,
          },
        },
      } as any;
    })();

    const sourceBindings: Record<string, { connectionId: string; tableKey: string; connectionType?: string }> = {};
    if (body?.sourceBindings && typeof body.sourceBindings === "object") {
      for (const [mn, b] of Object.entries(body.sourceBindings)) {
        const modelName = String(mn ?? "").trim();
        const connectionId = String((b as any)?.connectionId ?? "").trim();
        const tableKey = String((b as any)?.tableKey ?? "").trim();
        const connectionType = String((b as any)?.connectionType ?? "").trim();
        if (modelName && connectionId && tableKey) {
          sourceBindings[modelName] = { connectionId, tableKey, ...(connectionType ? { connectionType } : {}) };
        }
      }
    }
    if (Object.keys(sourceBindings).length === 0) {
      if (!projectId) {
        return NextResponse.json(
          {
            error: "projectId is required when sourceBindings are not provided",
            queryError: { code: "INVALID_SOURCE_BINDINGS", message: "projectId is required when sourceBindings are not provided" },
          },
          { status: 400 }
        );
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
      for (const r of sourcesRes.rows as any[]) {
        const mn = String(r?.model_name ?? "").trim();
        const cid = String(r?.connection_id ?? "").trim();
        const tk = String(r?.table_key ?? "").trim();
        if (mn && cid && tk) sourceBindings[mn] = { connectionId: cid, tableKey: tk };
      }
    }

    // Dialect is based on the bound connection for the query sourceModel.
    const sourceModelName = typeof (normalizedQuery as any)?.sourceModel === "string" ? String((normalizedQuery as any).sourceModel) : "";
    const boundForSource = sourceModelName ? sourceBindings[sourceModelName] : null;
    const conn = boundForSource?.connectionId ? await getConnectionById(boundForSource.connectionId).catch(() => null) : null;
    const connType = String((boundForSource as any)?.connectionType ?? conn?.type ?? "").toLowerCase();
    const dialectHint = connType.includes("clickhouse")
      ? "clickhouse"
      : (connType.includes("mssql") || connType.includes("sqlserver") ? "mssql" : "postgres");

    let compiled: ReturnType<typeof compileSemanticQuery>;
    try {
      compiled = compileSemanticQuery({
        semanticModel: semanticModelForRequest as any,
        query: normalizedQuery,
        globalContext,
        dialectHint: dialectHint as any,
        sourceBindings,
        requestContext,
      });
    } catch (compileErr: unknown) {
      const msg = compileErr instanceof Error ? compileErr.message : "Failed to compile semantic query";
      return NextResponse.json(
        {
          error: msg,
          queryError: { code: "COMPILE_ERROR", message: msg },
        },
        { status: 400 }
      );
    }

    if (semanticDebug) {
      try {
        console.log("[semantic.query.compiled]", {
          rid,
          dialectHint,
          connectionId: compiled.connectionId,
          sqlPreview: String(compiled.sql ?? "").slice(0, 5000),
        });
      } catch {}
    }

    const compileOnly = body?.compileOnly === true;
    if (compileOnly) {
      const debug = body?.debug ? {
        sql: compiled.sql,
        rid,
        globalFilters: Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [],
        scopedGlobalFilters: scopeBiFiltersForRequest(globalContext, requestContext),
        mergedLogicalFilters: (compiled as any)?.debug?.mergedFilters,
        requestContext,
      } : undefined;
      const response = NextResponse.json({ data: { rows: [], columns: [] }, debug }, { status: 200 });
      response.headers.set("x-correlation-id", rid);
      recordQueryMetric({
        route: "/api/semantic/query",
        durationMs: Date.now() - startedAt,
        ok: true,
        correlationId: rid,
        extra: { compileOnly: true },
      });
      return response;
    }

    const cacheHint = typeof body?.cacheHint === "string" ? String(body.cacheHint) : "";
    const cachePolicy = getTtlPolicyByHint(cacheHint);
    const cacheKey = buildCacheKey({
      connectionId: compiled.connectionId,
      sql: compiled.sql,
      params: (globalContext as any)?.params ?? null,
    });

    const { value: json, cache } = await withCachedResult({
      key: cacheKey,
      policy: cachePolicy,
      fetcher: async () => {
        const res = await fetch(`${request.nextUrl.origin}/api/datatalk/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: compiled.connectionId,
            sql: compiled.sql,
            role: body?.role,
            maxRows: body?.maxRows ?? (normalizedQuery as any)?.limit,
            timeoutMs: body?.timeoutMs,
          }),
          cache: "no-store",
        });

        const parsed = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(parsed?.error ?? "Query failed"));
        }
        return parsed;
      },
    });

    const debug = body?.debug ? {
      sql: compiled.sql,
      rid,
      globalFilters: Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [],
      scopedGlobalFilters: scopeBiFiltersForRequest(globalContext, requestContext),
      mergedLogicalFilters: (compiled as any)?.debug?.mergedFilters,
      requestContext,
      cache,
    } : undefined;

    const response = NextResponse.json({ data: json?.data ?? {}, debug }, { status: 200 });
    response.headers.set("x-correlation-id", rid);
    recordQueryMetric({
      route: "/api/semantic/query",
      durationMs: Date.now() - startedAt,
      ok: true,
      correlationId: rid,
      extra: {
        cacheHit: cache.hit,
        cacheStale: cache.stale,
      },
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to run semantic query";
    logQueryEvent("error", "semantic_query_failed", { rid, message });
    recordQueryMetric({
      route: "/api/semantic/query",
      durationMs: Date.now() - startedAt,
      ok: false,
      correlationId: rid,
      extra: { message },
    });
    return NextResponse.json(
      {
        error: message,
        queryError: { code: "EXECUTION_ERROR", message },
      },
      { status: 500 }
    );
  }
}
