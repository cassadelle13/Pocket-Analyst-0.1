import { NextRequest, NextResponse } from "next/server";

import { getSemanticModelBinding, getSemanticModelById } from "../../../../lib/datatalkMetaDb";
import type { GlobalFilterContextV1, LogicalQuery, SemanticModelV1 } from "../../../../lib/semantic/types";
import { compileSemanticQuery } from "../../../../lib/semantic/planner";
import { createRequestId, recordQueryMetric } from "../../../../lib/queryObservability";

function normalizeFieldKey(field: string): string {
  return String(field ?? "").trim();
}

function parseTableAndColumn(field: string): { table: string; column: string } | null {
  const f = normalizeFieldKey(field);
  const parts = f.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const column = parts[parts.length - 1];
    const table = parts.slice(0, parts.length - 1).join(".");
    if (table && column) return { table, column };
  }
  return null;
}

function splitRefMaybe(ref: string): { model: string; field: string } | null {
  const s = String(ref ?? "").trim();
  const idx = s.indexOf(".");
  if (idx <= 0 || idx === s.length - 1) return null;
  return { model: s.slice(0, idx).trim(), field: s.slice(idx + 1).trim() };
}

function fieldKeyExistsInModelDef(mdl: unknown, fieldKey: string): boolean {
  if (!mdl || typeof mdl !== "object") return false;
  const o = mdl as Record<string, unknown>;
  const dims = o.dimensions && typeof o.dimensions === "object" ? (o.dimensions as object) : null;
  const meas = o.measures && typeof o.measures === "object" ? (o.measures as object) : null;
  const calcF = o.calculatedFields && typeof o.calculatedFields === "object" ? (o.calculatedFields as object) : null;
  const calcM = o.calculatedMeasures && typeof o.calculatedMeasures === "object" ? (o.calculatedMeasures as object) : null;
  return !!(
    (dims && Object.prototype.hasOwnProperty.call(dims, fieldKey))
    || (meas && Object.prototype.hasOwnProperty.call(meas, fieldKey))
    || (calcF && Object.prototype.hasOwnProperty.call(calcF, fieldKey))
    || (calcM && Object.prototype.hasOwnProperty.call(calcM, fieldKey))
  );
}

/**
 * Resolves `field` to a semantic model key and field name, supporting:
 * - `Model.field`
 * - `schema.Model.field` / `catalog.schema.Model.field` (skips leading segments when the first is not a model id)
 */
function parseSemanticRefAgainstModel(semanticModel: SemanticModelV1, field: string): { model: string; fieldKey: string } | null {
  const s = normalizeFieldKey(field);
  const parts = s.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const models = (semanticModel as any)?.models;
  if (!models || typeof models !== "object") return null;

  const candidates: Array<{ model: string; fieldKey: string }> = [];
  candidates.push({ model: parts[0], fieldKey: parts.slice(1).join(".") });
  if (parts.length >= 3) {
    candidates.push({ model: parts[1], fieldKey: parts.slice(2).join(".") });
  }
  if (parts.length >= 4) {
    candidates.push({ model: parts[2], fieldKey: parts.slice(3).join(".") });
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const sig = `${c.model}\0${c.fieldKey}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const mdl = (models as any)[c.model];
    if (!mdl || typeof mdl !== "object") continue;
    if (fieldKeyExistsInModelDef(mdl, c.fieldKey)) {
      return { model: c.model, fieldKey: c.fieldKey };
    }
  }
  return null;
}

function safeIdentifier(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error(`Unsafe identifier: ${s}`);
  }
  return s;
}

function resolveSemanticFieldRef(semanticModel: SemanticModelV1, fieldInput: string): { sourceModel: string; ref: string } | null {
  const input = normalizeFieldKey(fieldInput);
  const models = (semanticModel as any)?.models;
  if (!models || typeof models !== "object") return null;

  // 1) Exact model.field (and multi-segment field keys)
  const parsedStrict = parseSemanticRefAgainstModel(semanticModel, input);
  if (parsedStrict) {
    return { sourceModel: parsedStrict.model, ref: `${parsedStrict.model}.${parsedStrict.fieldKey}` };
  }

  const parsed = parseTableAndColumn(input);
  const needle = parsed ? `${parsed.table}.${parsed.column}`.toLowerCase() : "";
  const colNeedle = parsed ? parsed.column.toLowerCase() : "";

  // 2) Match by SQL containing table.column (best effort)
  for (const [modelName, modelDef] of Object.entries(models)) {
    if (!modelDef || typeof modelDef !== "object") continue;
    const dims = (modelDef as any).dimensions && typeof (modelDef as any).dimensions === "object" ? (modelDef as any).dimensions : {};
    const meas = (modelDef as any).measures && typeof (modelDef as any).measures === "object" ? (modelDef as any).measures : {};
    for (const [k, v] of Object.entries(dims)) {
      const sql = String((v as any)?.sql ?? "").trim();
      if (needle && sql.toLowerCase().includes(needle)) return { sourceModel: String(modelName), ref: `${modelName}.${k}` };
    }
    for (const [k, v] of Object.entries(meas)) {
      const sql = String((v as any)?.sql ?? "").trim();
      if (needle && sql.toLowerCase().includes(needle)) return { sourceModel: String(modelName), ref: `${modelName}.${k}` };
    }
  }

  // 3) Fallback: match by field key name == column
  if (colNeedle) {
    for (const [modelName, modelDef] of Object.entries(models)) {
      if (!modelDef || typeof modelDef !== "object") continue;
      const dims = (modelDef as any).dimensions && typeof (modelDef as any).dimensions === "object" ? (modelDef as any).dimensions : {};
      const meas = (modelDef as any).measures && typeof (modelDef as any).measures === "object" ? (modelDef as any).measures : {};
      for (const k of Object.keys(dims)) {
        if (String(k).toLowerCase() === colNeedle) return { sourceModel: String(modelName), ref: `${modelName}.${k}` };
      }
      for (const k of Object.keys(meas)) {
        if (String(k).toLowerCase() === colNeedle) return { sourceModel: String(modelName), ref: `${modelName}.${k}` };
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rid = createRequestId("semv");
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body", queryError: { code: "INVALID_REQUEST", message: "Malformed JSON in request body" } },
        { status: 400 }
      );
    }

    const semanticDebug = String(process.env.SEMANTIC_DEBUG ?? "").trim() === "1" || body?.debug === true;
    const debug = body?.debug === true;
    const allowLegacy = body?.allowLegacy === true;

    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required (missing or empty)" }, { status: 400 });
    }

    const field = typeof body?.field === "string" ? body.field.trim() : "";
    if (!field) {
      return NextResponse.json({ error: "field is required (missing or empty)" }, { status: 400 });
    }

    // Power BI-like strictness: require at least Model.field (field key may contain dots).
    if (!field.includes(".")) {
      return NextResponse.json(
        {
          error: "field must be a semantic ref in format 'Model.field'",
          ...(debug ? { debug: { received: field } } : {}),
        },
        { status: 400 }
      );
    }

    const purpose = typeof body?.purpose === "string" ? body.purpose.trim().toLowerCase() : "";
    const search = typeof body?.search === "string" ? body.search.trim() : "";
    const sortOrderRaw = String(body?.sortOrder ?? "asc").trim().toLowerCase();
    const sortOrder: "asc" | "desc" = sortOrderRaw === "desc" ? "desc" : "asc";
    const limitRaw = Number(body?.limit ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 30;
    const pageRaw = Number(body?.page ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const offset = (page - 1) * limit;

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
    if (!semanticModelId) {
      return NextResponse.json({ error: "semanticModelId is required (or bind one for this project)" }, { status: 400 });
    }

    if (semanticDebug) {
      try {
        const gf = Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [];
        console.log("[semantic.values]", {
          rid,
          projectId,
          semanticModelIdExplicit: semanticModelIdExplicit || undefined,
          semanticModelId,
          requestContext,
          field,
          search,
          limit,
          globalFiltersCount: gf.length,
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

    const modelRow = await getSemanticModelById(semanticModelId);
    if (!modelRow) {
      return NextResponse.json({ error: "semantic model not found" }, { status: 404 });
    }

    const semanticModel = (modelRow.model_json ?? null) as SemanticModelV1 | null;
    if (!semanticModel || typeof semanticModel !== "object") {
      return NextResponse.json({ error: "semantic model is invalid" }, { status: 400 });
    }

    let resolved: { sourceModel: string; ref: string } | null = null;
    let strictParts: { model: string; fieldKey: string } | null = null;

    if (allowLegacy) {
      resolved = resolveSemanticFieldRef(semanticModel as any, field);
      if (!resolved) {
        return NextResponse.json({ error: "field not found in semantic model" }, { status: 400 });
      }
      strictParts = parseSemanticRefAgainstModel(semanticModel, field)
        ?? parseSemanticRefAgainstModel(semanticModel, resolved.ref);
      if (!strictParts) {
        const sp = splitRefMaybe(resolved.ref);
        strictParts = sp ? { model: sp.model, fieldKey: sp.field } : null;
      }
    } else {
      strictParts = parseSemanticRefAgainstModel(semanticModel, field);
      if (!strictParts) {
        return NextResponse.json({ error: "field not found in semantic model" }, { status: 400 });
      }
      resolved = { sourceModel: strictParts.model, ref: `${strictParts.model}.${strictParts.fieldKey}` };
    }

    if (!resolved || !strictParts) {
      return NextResponse.json({ error: "field not found in semantic model" }, { status: 400 });
    }

    if (purpose === "slicer") {
      const models = (semanticModel as any)?.models;
      const mdl = models && typeof models === "object" ? (models as any)[strictParts.model] : null;
      const fk = strictParts.fieldKey;
      const dims = mdl && typeof mdl === "object" ? (mdl as any).dimensions : null;
      const meas = mdl && typeof mdl === "object" ? (mdl as any).measures : null;
      const cf = mdl && typeof mdl === "object" ? (mdl as any).calculatedFields : null;
      const cm = mdl && typeof mdl === "object" ? (mdl as any).calculatedMeasures : null;
      const isDim = dims && typeof dims === "object" && Object.prototype.hasOwnProperty.call(dims, fk);
      const isCf = cf && typeof cf === "object" && Object.prototype.hasOwnProperty.call(cf, fk);
      const isMeas = meas && typeof meas === "object" && Object.prototype.hasOwnProperty.call(meas, fk);
      const isCm = cm && typeof cm === "object" && Object.prototype.hasOwnProperty.call(cm, fk);
      if ((isMeas || isCm) && !isDim && !isCf) {
        return NextResponse.json(
          { error: "Slicer values are only supported for dimensions and time fields, not measures" },
          { status: 400 }
        );
      }
    }

    const q: LogicalQuery = {
      sourceModel: resolved.sourceModel,
      dimensions: [resolved.ref],
      filters: search ? [{ field: resolved.ref, op: "contains", values: [search] }] : [],
    } as any;

    const pool = (await import("../../../../lib/datatalkMetaDb")).getDataTalkMetaPool();
    const sourcesRes = await pool.query(
      `
      SELECT model_name, connection_id, table_key
      FROM datatalk_meta.semantic_model_sources
      WHERE semantic_model_id = $1 AND scope_type = 'project' AND scope_id = $2
      `,
      [semanticModelId, projectId]
    );

    const sourceBindings: Record<string, { connectionId: string; tableKey: string }> = {};
    for (const r of sourcesRes.rows as any[]) {
      const mn = String(r?.model_name ?? "").trim();
      const cid = String(r?.connection_id ?? "").trim();
      const tk = String(r?.table_key ?? "").trim();
      if (mn && cid && tk) sourceBindings[mn] = { connectionId: cid, tableKey: tk };
    }

    const boundForSource = resolved.sourceModel ? sourceBindings[resolved.sourceModel] : null;
    const connectionIdForDialect = String(boundForSource?.connectionId ?? "").trim();
    let dialectHint: "clickhouse" | "postgres" | "mssql" = "postgres";
    if (connectionIdForDialect) {
      const { getConnectionById } = await import("../../../../lib/datatalkMetaDb");
      const conn = await getConnectionById(connectionIdForDialect).catch(() => null);
      if (conn?.type === "clickhouse") dialectHint = "clickhouse";
      else if (conn?.type === "mssql") dialectHint = "mssql";
      else dialectHint = "postgres";
    }

    const compiled = compileSemanticQuery({
      semanticModel: semanticModel as any,
      query: q as any,
      globalContext,
      dialectHint: dialectHint as any,
      sourceBindings,
      requestContext,
    });

    // We want distinct suggestions; wrap the compiled SQL.
    // Assumes first selected column alias is the field name (planner uses alias = field).
    const selectedFieldAlias = safeIdentifier(strictParts.fieldKey);
    const distinctSql = dialectHint === "clickhouse"
      ? `SELECT DISTINCT toString(${selectedFieldAlias}) as v FROM (${compiled.sql}) sub ORDER BY v ${sortOrder.toUpperCase()} LIMIT ${limit} OFFSET ${offset}`
      : dialectHint === "mssql"
        ? `SELECT DISTINCT CAST(${selectedFieldAlias} AS NVARCHAR(MAX)) as v FROM (${compiled.sql}) sub ORDER BY v ${sortOrder.toUpperCase()} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
        : `SELECT DISTINCT CAST(${selectedFieldAlias} AS TEXT) as v FROM (${compiled.sql}) sub ORDER BY v ${sortOrder.toUpperCase()} LIMIT ${limit} OFFSET ${offset}`;

    const compileOnly = body?.compileOnly === true;
    if (compileOnly) {
      const gf = Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [];
      const response = NextResponse.json({
        data: { values: [] },
        ...(debug ? {
          debug: {
            rid,
            resolved,
            dialectHint,
            compiledSql: compiled.sql,
            distinctSql,
            globalFilters: gf,
            mergedLogicalFilters: (compiled as any)?.debug?.mergedFilters,
            requestContext,
          }
        } : {}),
      }, { status: 200 });
      response.headers.set("x-correlation-id", rid);
      recordQueryMetric({
        route: "/api/semantic/values",
        durationMs: Date.now() - startedAt,
        ok: true,
        correlationId: rid,
        extra: { compileOnly: true },
      });
      return response;
    }

    const res = await fetch(`${request.nextUrl.origin}/api/datatalk/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId: compiled.connectionId,
        sql: distinctSql,
        role: body?.role,
        maxRows: limit,
        timeoutMs: body?.timeoutMs,
      }),
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({
        error: json?.error ?? "Query failed",
        ...(debug ? { debug: { resolved, dialectHint, compiledSql: compiled.sql, distinctSql } } : {}),
      }, { status: res.status });
    }

    const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
    const values: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const v = Array.isArray(r) ? r[0] : (r?.v ?? null);
      const s = String(v ?? "").trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      values.push(s);
      if (values.length >= limit) break;
    }

    recordQueryMetric({
      route: "/api/semantic/values",
      durationMs: Date.now() - startedAt,
      ok: true,
      correlationId: rid,
      extra: { page, limit },
    });
    const response = NextResponse.json({
      data: {
        values,
      },
      ...(debug ? { debug: { resolved, dialectHint, compiledSql: compiled.sql, distinctSql } } : {}),
    }, { status: 200 });
    response.headers.set("x-correlation-id", rid);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch semantic values";
    recordQueryMetric({
      route: "/api/semantic/values",
      durationMs: Date.now() - startedAt,
      ok: false,
      correlationId: rid,
      extra: { message },
    });
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set("x-correlation-id", rid);
    return response;
  }
}
