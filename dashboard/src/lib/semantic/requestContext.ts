import type { LogicalFilter } from "./types";

export type BiFilterScope = "report" | "page" | "visual";

export type BiFilterLike = {
  field?: unknown;
  fieldAlias?: unknown;
  op?: unknown;
  values?: unknown;
  logicGroup?: unknown;
  logicOp?: unknown;
  scope?: unknown;
  sourceChartId?: unknown;
  pageKey?: unknown;
};

export type GlobalContextV1 = {
  version: 1;
  filters: Array<{
    field: string;
    op: LogicalFilter["op"];
    values: any[];
    scope: BiFilterScope;
    sourceChartId?: string;
    pageKey?: string;
    fieldAlias?: string;
    logicGroup?: string;
    logicOp?: "and" | "or";
    topN?: { mode: "top" | "bottom"; n: number; byMeasure: string };
  }>;
  dateRange?: {
    start?: string;
    end?: string;
  };
  params?: Record<string, any>;
};

export type SemanticRequestContext = {
  chartId?: string;
  pageKey?: string;
};

export const SEMANTIC_REF_RE = /^[\p{L}_][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)+$/u;

export function buildSemanticGlobalContext(
  biFilters: unknown,
  opts?: { excludeField?: string; sourceModel?: string; dateRange?: { start?: Date | string | null; end?: Date | string | null } }
): GlobalContextV1 {
  const exclude = String(opts?.excludeField ?? "").trim();
  const sourceModel = String(opts?.sourceModel ?? "").trim();
  const raw = Array.isArray(biFilters) ? (biFilters as BiFilterLike[]) : [];
  const knownModels = Array.from(new Set(
    raw
      .map((f) => String((f as any)?.field ?? "").trim())
      .filter((field) => field.includes("."))
      .map((field) => field.split(".")[0])
      .filter(Boolean)
  ));

  const qualifyField = (fieldRaw: string, aliasRaw: string): string => {
    const field = String(fieldRaw ?? "").trim();
    if (!field) return "";
    if (SEMANTIC_REF_RE.test(field)) return field;
    const alias = String(aliasRaw ?? "").trim();
    if (SEMANTIC_REF_RE.test(alias)) return alias;
    if (field.includes(".")) return field;
    if (knownModels.length === 1) return `${knownModels[0]}.${field}`;
    if (sourceModel) return `${sourceModel}.${field}`;
    return field;
  };

  const filters = raw
    .filter((f) => {
      const fieldAlias = String((f as any)?.fieldAlias ?? "").trim();
      const field = qualifyField(String((f as any)?.field ?? "").trim(), fieldAlias);
      if (!field) return false;
      if (exclude && field === exclude) return false;
      return SEMANTIC_REF_RE.test(field) || !!fieldAlias;
    })
    .map((f) => {
      const field = qualifyField(String((f as any)?.field ?? "").trim(), String((f as any)?.fieldAlias ?? "").trim());
      const scopeRaw = (f as any)?.scope;
      const scope: BiFilterScope = (scopeRaw === "report" || scopeRaw === "page" || scopeRaw === "visual") ? scopeRaw : "visual";
      const valuesRaw = (f as any)?.values;
      const values = Array.isArray(valuesRaw) ? valuesRaw : (valuesRaw != null ? [valuesRaw] : []);

      const sourceChartId = typeof (f as any)?.sourceChartId === "string" ? String((f as any).sourceChartId) : undefined;
      const pageKey = typeof (f as any)?.pageKey === "string" ? String((f as any).pageKey) : undefined;

      const topN = (f as any)?.topN && typeof (f as any).topN === "object" ? (f as any).topN : undefined;
      return {
        field,
        fieldAlias: typeof (f as any)?.fieldAlias === "string" ? String((f as any).fieldAlias).trim() : undefined,
        op: (f as any)?.op,
        values,
        logicGroup: typeof (f as any)?.logicGroup === "string" ? String((f as any).logicGroup).trim() || undefined : undefined,
        logicOp: ((f as any)?.logicOp === "or" ? "or" : "and") as "and" | "or",
        scope,
        sourceChartId,
        pageKey,
        ...(topN ? { topN } : {}),
      };
    });

  // #region agent log
  fetch('http://127.0.0.1:7891/ingest/42f4b2b3-bbc6-4993-849a-db95471cb317',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6bac71'},body:JSON.stringify({sessionId:'6bac71',runId:'slicer-queryerror-run1',hypothesisId:'H2',location:'requestContext.ts:buildSemanticGlobalContext',message:'globalContext filter normalization',data:{rawCount:Array.isArray(raw)?raw.length:0,keptCount:filters.length,excludeField:exclude,knownModels,keptFilters:filters.map((f)=>({field:String((f as any)?.field??''),op:String((f as any)?.op??''),scope:String((f as any)?.scope??'')}))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const rawStart = opts?.dateRange?.start;
  const rawEnd = opts?.dateRange?.end;
  const start = rawStart instanceof Date ? rawStart.toISOString() : (typeof rawStart === "string" ? rawStart : undefined);
  const end = rawEnd instanceof Date ? rawEnd.toISOString() : (typeof rawEnd === "string" ? rawEnd : undefined);

  return {
    version: 1,
    filters,
    ...(start || end ? { dateRange: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
  };
}

export function buildSemanticRequestContext(input?: { chartId?: unknown; pageKey?: unknown } | null): SemanticRequestContext {
  const chartId = String((input as any)?.chartId ?? "").trim() || undefined;
  const pageKey = String((input as any)?.pageKey ?? "").trim() || undefined;
  return { chartId, pageKey };
}
