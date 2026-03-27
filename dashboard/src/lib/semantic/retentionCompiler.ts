import type { GlobalFilterContextV1, LogicalFilter, LogicalQuery, PivotCohortFieldDef, SemanticModelV1 } from "./types";
import { buildCohortPivotQuery, buildWidePivotQuery, type SqlDialect } from "./retentionBuilder";
import { mergeFilters, renderWhere } from "./planner";

type PivotLogicalQuery = LogicalQuery & {
  retentionField?: string;
  pivotField?: string;
  cohortPivotField?: string;
  /** Optional: override pivot behavior from field def */
  pivotMode?: "auto" | "client" | "sql";
  pivotRowLimit?: number;
  periods?: number[];
};

export type RawPivotLogicalQuery = {
  sourceTable: string;
  sourceAlias?: string;
  cohortByExpr: string;
  eventDateExpr: string;
  metricExpr: string;
  whereConditionSql?: string;
  periods: number[];
  unit?: "day" | "week" | "month";
  pivotMode?: "auto" | "client" | "sql";
  pivotRowLimit?: number;
};

type CompiledPivot = {
  sql: string;
  connectionId: string;
  connectionType?: string;
  pivot: {
    mode: "auto" | "client" | "sql";
    rowLimit: number;
    /** Pivot spec for client-side: which keys to pivot */
    spec: {
      rowKeys: string[];
      colKey: string;
      valueKey: string;
    };
  };
  debug?: {
    mergedFilters: any[];
    where: string;
  };
};

function safeIdent(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("Empty identifier");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error(`Unsafe identifier: ${s}`);
  }
  return s;
}

function splitRef(ref: string): { model: string; field: string } {
  const s = String(ref ?? "").trim();
  const idx = s.indexOf(".");
  if (idx <= 0 || idx === s.length - 1) throw new Error(`Invalid ref: ${s}`);
  return { model: s.slice(0, idx), field: s.slice(idx + 1) };
}

export function compilePivotQuery(params: {
  semanticModel: SemanticModelV1;
  query: PivotLogicalQuery;
  globalContext?: GlobalFilterContextV1 | null;
  dialectHint: SqlDialect;
  sourceBindings: Record<string, { connectionId: string; tableKey: string; connectionType?: string }>;
  requestContext?: { chartId?: string; pageKey?: string } | null;
}): CompiledPivot {
  const semanticModel = params.semanticModel;
  const query = params.query;
  const dialect = params.dialectHint;

  const sourceModelName = safeIdent(query?.sourceModel);
  const sourceModel = (semanticModel.models as any)?.[sourceModelName];
  if (!sourceModel) throw new Error(`Unknown sourceModel: ${sourceModelName}`);

  const binding = params.sourceBindings[sourceModelName];
  const connectionId = String(binding?.connectionId ?? "").trim();
  const tableKey = String(binding?.tableKey ?? "").trim();
  if (!connectionId) throw new Error(`Missing source binding for model: ${sourceModelName} (connectionId)`);
  if (!tableKey) throw new Error(`Missing source binding for model: ${sourceModelName} (tableKey)`);

  const pivotFieldName = safeIdent(String((query as any)?.pivotField ?? (query as any)?.cohortPivotField ?? (query as any)?.retentionField ?? ""));
  const def = (sourceModel as any)?.calculatedFields?.[pivotFieldName] as PivotCohortFieldDef | undefined;
  if (!def || def.type !== "pivot_cohort") {
    throw new Error(`Unknown cohort pivot calculated field: ${sourceModelName}.${pivotFieldName}`);
  }

  const fieldSqlByRef = (ref: string): string => {
    const { model, field } = splitRef(ref);
    const modelName = safeIdent(model);
    const mDef = (semanticModel.models as any)?.[modelName];
    if (!mDef) throw new Error(`Unknown model: ${modelName}`);

    const d = (mDef?.dimensions as any)?.[field];
    if (d && String(d.sql ?? "").trim()) {
      const raw = String(d.sql).trim();
      // single-model only for now
      return raw.split("{{alias}}").join("e");
    }

    const ms = (mDef?.measures as any)?.[field];
    if (ms && String(ms.sql ?? "").trim()) {
      const raw = String(ms.sql).trim();
      return raw.split("{{alias}}").join("e");
    }

    throw new Error(`Unknown field: ${ref}`);
  };

  const cohortByExpr = fieldSqlByRef(def.cohortBy);
  const eventDateExpr = fieldSqlByRef(def.eventDate);
  const metricExpr = fieldSqlByRef(def.metric);

  const dateRangeFilters = (() => {
    const dr = (params.globalContext as any)?.dateRange;
    if (!dr || typeof dr !== "object") return [] as LogicalFilter[];
    const start = String((dr as any)?.start ?? "").trim();
    const end = String((dr as any)?.end ?? "").trim();
    if (!start && !end) return [] as LogicalFilter[];
    const targetField = String((query as any)?.time?.dimension ?? "").trim() || String(def.eventDate ?? "").trim() || String(def.cohortBy ?? "").trim();
    if (!targetField) return [] as LogicalFilter[];
    if (start && end) {
      const f: LogicalFilter = { field: targetField, op: "between", values: [start, end] };
      return [f];
    }
    if (start) {
      const f: LogicalFilter = { field: targetField, op: "gte", values: [start] };
      return [f];
    }
    const f: LogicalFilter = { field: targetField, op: "lte", values: [end] };
    return [f];
  })();

  const mergedFilters = [...mergeFilters(query?.filters, params.globalContext, params.requestContext), ...dateRangeFilters];
  const where = renderWhere(mergedFilters, fieldSqlByRef, dialect);
  const whereConditionSql = where.trim().toUpperCase().startsWith("WHERE ") ? where.trim().slice("WHERE ".length) : "";

  const periodsOverrideRaw = Array.isArray((query as any)?.periods) ? ((query as any).periods as any[]) : null;
  const periodsOverride = periodsOverrideRaw
    ? periodsOverrideRaw.map((p) => Number(p)).filter((p) => Number.isFinite(p) && p >= 0)
    : [];
  const effectivePeriods = periodsOverride.length ? periodsOverride : def.periods;

  const sql = buildCohortPivotQuery({
    dialect,
    sourceTable: tableKey,
    sourceAlias: "e",
    cohortByExpr,
    eventDateExpr,
    metricExpr,
    periods: effectivePeriods,
    unit: def.unit,
    whereConditionSql,
  });

  const pivotMode = (query.pivotMode ?? def.pivotMode ?? "auto") as any;
  const pivotRowLimit = Math.max(1, Math.min(200_000, Number(query.pivotRowLimit ?? def.pivotRowLimit ?? 50_000)));

  const sqlWide = (pivotMode === "sql")
    ? buildWidePivotQuery({
        dialect,
        sourceTable: tableKey,
        sourceAlias: "e",
        cohortByExpr,
        eventDateExpr,
        metricExpr,
        periods: effectivePeriods,
        unit: def.unit,
        whereConditionSql,
        periodColumnPrefix: "d",
      })
    : "";

  return {
    sql: sqlWide || sql,
    connectionId,
    connectionType: binding?.connectionType,
    pivot: {
      mode: pivotMode,
      rowLimit: pivotRowLimit,
      spec: {
        rowKeys: ["cohort_date"],
        colKey: "period",
        valueKey: "retention_rate",
      },
    },
    debug: {
      mergedFilters,
      where,
    },
  };
}

export function compilePivotQueryRaw(params: {
  query: RawPivotLogicalQuery;
  dialectHint: SqlDialect;
  connectionId: string;
  connectionType?: string;
}): CompiledPivot {
  const query = params.query;
  const dialect = params.dialectHint;

  const sourceTable = String(query?.sourceTable ?? "").trim();
  const sourceAlias = String(query?.sourceAlias ?? "e").trim() || "e";
  const cohortByExpr = String(query?.cohortByExpr ?? "").trim();
  const eventDateExpr = String(query?.eventDateExpr ?? "").trim();
  const metricExpr = String(query?.metricExpr ?? "").trim();
  const whereConditionSql = String(query?.whereConditionSql ?? "").trim();
  const periods = Array.isArray(query?.periods)
    ? query.periods.map((p) => Number(p)).filter((p) => Number.isFinite(p) && p >= 0)
    : [];

  if (!sourceTable) throw new Error("sourceTable is required for raw cohort pivot query");
  if (!cohortByExpr) throw new Error("cohortByExpr is required for raw cohort pivot query");
  if (!eventDateExpr) throw new Error("eventDateExpr is required for raw cohort pivot query");
  if (!metricExpr) throw new Error("metricExpr is required for raw cohort pivot query");
  if (!periods.length) throw new Error("periods must be a non-empty array for raw cohort pivot query");

  const sql = buildCohortPivotQuery({
    dialect,
    sourceTable,
    sourceAlias,
    cohortByExpr,
    eventDateExpr,
    metricExpr,
    periods,
    unit: query.unit,
    whereConditionSql,
  });

  const pivotMode = (query.pivotMode ?? "auto") as any;
  const pivotRowLimit = Math.max(1, Math.min(200_000, Number(query.pivotRowLimit ?? 50_000)));

  const sqlWide = (pivotMode === "sql")
    ? buildWidePivotQuery({
        dialect,
        sourceTable,
        sourceAlias,
        cohortByExpr,
        eventDateExpr,
        metricExpr,
        periods,
        unit: query.unit,
        whereConditionSql,
        periodColumnPrefix: "d",
      })
    : "";

  return {
    sql: sqlWide || sql,
    connectionId: String(params.connectionId ?? "").trim(),
    connectionType: params.connectionType,
    pivot: {
      mode: pivotMode,
      rowLimit: pivotRowLimit,
      spec: {
        rowKeys: ["cohort_date"],
        colKey: "period",
        valueKey: "retention_rate",
      },
    },
    debug: {
      mergedFilters: [],
      where: whereConditionSql ? `WHERE ${whereConditionSql}` : "",
    },
  };
}

// Backward compatibility alias.
export const compileRetentionQuery = compilePivotQuery;
