import type { LogicalFilter } from "./types";

export type BiFilterScope = "report" | "page" | "visual";

export type BiFilterLike = {
  field?: unknown;
  op?: unknown;
  values?: unknown;
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

const SEMANTIC_REF_RE = /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/;

export function buildSemanticGlobalContext(
  biFilters: unknown,
  opts?: { excludeField?: string; dateRange?: { start?: Date | string | null; end?: Date | string | null } }
): GlobalContextV1 {
  const exclude = String(opts?.excludeField ?? "").trim();
  const raw = Array.isArray(biFilters) ? (biFilters as BiFilterLike[]) : [];

  const filters = raw
    .filter((f) => {
      const field = String((f as any)?.field ?? "").trim();
      if (!field) return false;
      if (exclude && field === exclude) return false;
      return SEMANTIC_REF_RE.test(field);
    })
    .map((f) => {
      const field = String((f as any)?.field ?? "").trim();
      const scopeRaw = (f as any)?.scope;
      const scope: BiFilterScope = (scopeRaw === "report" || scopeRaw === "page" || scopeRaw === "visual") ? scopeRaw : "visual";
      const valuesRaw = (f as any)?.values;
      const values = Array.isArray(valuesRaw) ? valuesRaw : (valuesRaw != null ? [valuesRaw] : []);

      const sourceChartId = typeof (f as any)?.sourceChartId === "string" ? String((f as any).sourceChartId) : undefined;
      const pageKey = typeof (f as any)?.pageKey === "string" ? String((f as any).pageKey) : undefined;

      return {
        field,
        op: (f as any)?.op,
        values,
        scope,
        sourceChartId,
        pageKey,
      };
    });

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
