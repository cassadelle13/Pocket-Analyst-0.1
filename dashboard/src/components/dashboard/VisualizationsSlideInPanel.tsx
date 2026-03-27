"use client";

import { BarChart3, CalendarDays, Eye, EyeOff, Layers, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Editor from "@monaco-editor/react";
import { buildExprContextForPipelineStep, createPipelineExprSessionForStep, getEditorDiagnostics, getExpressionCompletionsAt, getExpressionHover } from "../../lib/semantic/expressionEngine";
import { classifyFieldRef, uiAggToAggFn } from "../../lib/semantic/fieldClassifier";
import { useSemanticModel } from "../../context/SemanticModelContext";
import { useGlobalFilters } from "../../store/globalFiltersContext";
import type { VizType } from "@/types/viz";

type PipelineStepBaseV1 = {
  id: string;
  kind: "compute" | "transform";
  name: string;
  description?: string;
};

type PipelineDepV1 =
  | { type: "field"; name: string }
  | { type: "compute"; id: string };

type ComputeStepV1 = PipelineStepBaseV1 & {
  kind: "compute";
  outputId: string;
  uiFormula: string;
  formula: string;
  calcMode?: "formula" | "direct";
  aggregation?: "none" | "sum" | "avg" | "min" | "max" | "count" | "countd";
  resultType?: "number" | "string" | "date" | "boolean";
  hidden?: boolean;
  meta?: {
    deps?: PipelineDepV1[];
    level?: "row" | "aggregate";
    execution?: "sql" | "client";
    canCompileToSql?: boolean;
  };
};

type TransformStepV1 = PipelineStepBaseV1 & {
  kind: "transform";
  type: "cohort_pivot";
  meta?: {
    execution?: "client" | "sql";
  };
  config: {
    enabled: boolean;
    cohortField: string;
    activityField: string;
    userField: string;
    usersField?: string;
    period?: "day" | "week" | "month";
    unit: "day" | "week" | "month" | "quarter" | "year";
    periods: number[];
    pivotMode: "auto" | "client" | "sql";
    maxRows: number;
    rawMode?: boolean;
    rawConnectionId?: string;
    rawTableKey?: string;
  };
};

type ChartPipelineV1 = {
  version: 1;
  steps: Array<ComputeStepV1 | TransformStepV1>;
};

function makeStepId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function extractMetricIdFromRef(ref: string): string {
  const s = String(ref ?? "").trim();
  if (!s) return "";
  const parts = s.split(".");
  return String(parts[parts.length - 1] ?? "").trim();
}

function normalizePeriods(raw: unknown): number[] {
  const arr = Array.isArray(raw) ? raw : [];
  const nums = arr
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.trunc(n));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function calcPresetRange(kind: "last7" | "last30" | "last90" | "thisMonth" | "thisQuarter"): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  if (kind === "last7") return { start: new Date(now.getTime() - 7 * 86400000), end };
  if (kind === "last30") return { start: new Date(now.getTime() - 30 * 86400000), end };
  if (kind === "last90") return { start: new Date(now.getTime() - 90 * 86400000), end };
  if (kind === "thisMonth") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }
  const month = now.getMonth();
  const qStartMonth = Math.floor(month / 3) * 3;
  return { start: new Date(now.getFullYear(), qStartMonth, 1), end };
}

function readPipelineFromChartData(chartData: any): ChartPipelineV1 {
  const cd = (chartData && typeof chartData === "object") ? chartData : {};
  const existing = (cd as any).pipeline;
  if (existing && typeof existing === "object" && Number((existing as any).version) === 1 && Array.isArray((existing as any).steps)) {
    return existing as ChartPipelineV1;
  }

  const steps: Array<ComputeStepV1 | TransformStepV1> = [];

  const derived = Array.isArray((cd as any).derivedMetrics) ? (cd as any).derivedMetrics : [];
  for (const m of derived) {
    const outputId = String(m?.id ?? "").trim();
    if (!outputId) continue;
    steps.push({
      id: makeStepId("compute"),
      kind: "compute",
      name: String(m?.name ?? outputId) || outputId,
      description: String(m?.description ?? "").trim() || undefined,
      outputId,
      uiFormula: String(m?.uiFormula ?? ""),
      formula: String(m?.formula ?? ""),
      calcMode: String((m as any)?.config?.calcMode ?? "formula") === "direct" ? "direct" : "formula",
      aggregation: (() => {
        const a = String((m as any)?.config?.aggregation ?? "none").toLowerCase();
        return (a === "sum" || a === "avg" || a === "min" || a === "max" || a === "count" || a === "countd") ? (a as any) : "none";
      })(),
      resultType: (() => {
        const t = String((m as any)?.config?.resultType ?? "").toLowerCase();
        return (t === "number" || t === "string" || t === "date" || t === "boolean") ? (t as any) : undefined;
      })(),
      hidden: Boolean((m as any)?.config?.hidden),
    });
  }

  const cohortPivot = (cd as any)?.pivot?.cohort;
  if (cohortPivot && typeof cohortPivot === "object" && Boolean(cohortPivot.enabled)) {
    const unitRaw = String(cohortPivot.unit ?? cohortPivot.period ?? "day");
    const unit: "day" | "week" | "month" | "quarter" | "year" =
      (unitRaw === "week" || unitRaw === "month" || unitRaw === "quarter" || unitRaw === "year") ? unitRaw : "day";
    const periods = normalizePeriods((cohortPivot as any)?.periods);
    const pivotModeRaw = String((cohortPivot as any)?.pivotMode ?? "auto");
    const pivotMode: "auto" | "client" | "sql" =
      (pivotModeRaw === "client" || pivotModeRaw === "sql") ? pivotModeRaw : "auto";
    const maxRowsRaw = Number((cohortPivot as any)?.maxRows ?? 50000);
    const maxRows = Number.isFinite(maxRowsRaw) && maxRowsRaw > 0 ? Math.trunc(maxRowsRaw) : 50000;
    steps.push({
      id: makeStepId("transform"),
      kind: "transform",
      type: "cohort_pivot",
      name: "Cohort Analysis",
      config: {
        enabled: Boolean(cohortPivot.enabled),
        cohortField: String(cohortPivot.cohortField ?? ""),
        activityField: String(cohortPivot.activityField ?? ""),
        userField: String(cohortPivot.userField ?? ""),
        usersField: String((cohortPivot as any).usersField ?? ""),
        period: unit === "quarter" || unit === "year" ? "day" : unit,
        unit,
        periods: periods.length ? periods : [0, 1, 7, 14, 30],
        pivotMode,
        maxRows,
        rawMode: Boolean((cohortPivot as any).rawMode),
        rawConnectionId: String((cohortPivot as any).rawConnectionId ?? ""),
        rawTableKey: String((cohortPivot as any).rawTableKey ?? ""),
      },
      meta: { execution: "client" },
    });
  }

  return { version: 1, steps };
}

function writePipelineToChartPatch(p: ChartPipelineV1): any {
  const steps = Array.isArray(p?.steps) ? p.steps : [];

  const derivedMetrics: DerivedMetric[] = steps
    .filter((s): s is ComputeStepV1 => !!s && typeof s === "object" && (s as any).kind === "compute")
    .map((s) => ({
      id: String(s.outputId ?? "").trim(),
      type: "formula" as const,
      name: String(s.name ?? "").trim() || String(s.outputId ?? "").trim(),
      description: String(s.description ?? "").trim() || undefined,
      formula: String(s.formula ?? "").trim(),
      uiFormula: String(s.uiFormula ?? "").trim() || undefined,
      config: {
        calcMode: (s.calcMode === "direct" ? "direct" : "formula") as "formula" | "direct",
        aggregation: s.aggregation ?? "none",
        ...(s.resultType ? { resultType: s.resultType } : {}),
        hidden: Boolean(s.hidden),
      },
    }))
    .filter((m) => !!m.id && !!m.formula);

  const cohortPivotStep = steps.find((s) =>
    s &&
    typeof s === "object" &&
    (s as any).kind === "transform" &&
    ((s as any).type === "cohort_pivot")
  ) as TransformStepV1 | undefined;
  const cohortPivotPatch = cohortPivotStep
    ? {
        pivot: {
          cohort: {
            ...(cohortPivotStep.config as any),
          },
        },
      }
    : undefined;

  return {
    pipeline: p,
    derivedMetrics,
    ...(cohortPivotPatch ? cohortPivotPatch : {}),
  };
}

type ColumnMappingLike = {
  xColumn?: string;
  groupBy?: string;
  yColumns?: Array<{ col: string; agg?: string; fieldType?: "dimension" | "measure" | "time" } | any>;
  y2Columns?: Array<{ col: string; agg?: string; fieldType?: "dimension" | "measure" | "time" } | any>;
  colorByMeasure?: boolean;
  tooltipColumns?: string[];
  detailsColumns?: string[];
  drilldownColumns?: string[];
  details2Columns?: string[];
  orderBy?: Array<{ field?: string; dir?: "asc" | "desc" }>;
};

type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";

type DragFieldInfo = {
  ref: string;
  fieldType?: "dimension" | "measure" | "time";
  semanticType?: string;
};

type ParsedDrop =
  | { kind: "field"; field: DragFieldInfo }
  | { kind: "calendar"; baseTimeRef: string; granularity: CalendarGranularity };

let lastCalendarDrop: { baseTimeRef: string; granularity: CalendarGranularity } | null = null;

function inferFieldTypeFromSemanticType(semanticType: string): DragFieldInfo["fieldType"] {
  const t = String(semanticType ?? "").trim().toLowerCase();
  if (!t) return undefined;
  if (t.includes("timestamp") || t.includes("datetime") || t.includes("date") || t.includes("time")) return "time";
  if (t.includes("int") || t.includes("numeric") || t.includes("decimal") || t.includes("double") || t.includes("float") || t.includes("real") || t.includes("number")) {
    return "measure";
  }
  return "dimension";
}

function parseDropEvent(e: React.DragEvent): ParsedDrop | null {
  const raw = e.dataTransfer.getData("application/json")
    || e.dataTransfer.getData("text/plain")
    || e.dataTransfer.getData("text")
    || "";
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && String((data as any)?.synthetic ?? "") === "calendar") {
      const granularity = String((data as any)?.granularity ?? "").trim() as CalendarGranularity;
      const baseTimeRef = String((data as any)?.baseTimeRef ?? "").trim();
      if (!baseTimeRef) return null;
      if (granularity !== "day" && granularity !== "week" && granularity !== "month" && granularity !== "quarter" && granularity !== "year") return null;
      lastCalendarDrop = { baseTimeRef, granularity };
      return { kind: "calendar", baseTimeRef, granularity };
    }
    const tableName = data && typeof data === "object" ? String((data as any)?.table ?? "").trim() : "";
    const fieldName = data && typeof data === "object" ? String((data as any)?.name ?? "").trim() : "";
    const tableDotName = (tableName && fieldName) ? `${tableName}.${fieldName}` : "";
    const ref = String(
      (data as any)?.column?.ref
        ?? (data as any)?.ref
        ?? (tableDotName || undefined)
        ?? (data as any)?.column?.name
        ?? (data as any)?.name
        ?? raw
    ).trim();
    if (!ref) return null;

    const kind = data && typeof data === "object" ? String((data as any)?.kind ?? "").trim() : "";
    const fieldType = data && typeof data === "object" ? String((data as any)?.fieldType ?? "").trim() : "";
    const semanticType = data && typeof data === "object" ? String((data as any)?.semanticType ?? (data as any)?.column?.type ?? "").trim() : "";
    return {
      kind: "field",
      field: {
        ref,
        fieldType:
          (fieldType === "dimension" || fieldType === "measure" || fieldType === "time")
            ? (fieldType as any)
            : inferFieldTypeFromSemanticType(semanticType),
        semanticType: semanticType ? semanticType : undefined,
      },
    };
  } catch {
    const ref = String(raw).trim();
    return ref ? { kind: "field", field: { ref } } : null;
  }
}

type DerivedMetricType = "formula";

type DerivedMetric = {
  id: string;
  type: DerivedMetricType;
  name: string;
  description?: string;
  formula: string;
  uiFormula?: string;
  config?: {
    timeGrain?: string;
    filters?: any[];
    window?: any;
    calcMode?: "formula" | "direct";
    aggregation?: "none" | "sum" | "avg" | "min" | "max" | "count" | "countd";
    resultType?: "number" | "string" | "date" | "boolean";
    hidden?: boolean;
  };
};

function uniqStrings(arr: unknown): string[] {
  const a = Array.isArray(arr) ? arr : [];
  return Array.from(new Set(a.map((x) => String(x)).filter(Boolean)));
}

function listAllSemanticFieldRefs(modelJson: any, sourceModel?: string): string[] {
  const mj = modelJson && typeof modelJson === "object" ? modelJson : null;
  const models = mj?.models && typeof mj.models === "object" ? mj.models : {};
  const modelNames = Object.keys(models);
  const ordered = sourceModel ? [sourceModel, ...modelNames.filter((m) => m !== sourceModel)] : modelNames;
  const out: string[] = [];
  for (const mName of ordered) {
    const m = (models as any)?.[mName];
    if (!m || typeof m !== "object") continue;
    const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
    const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
    for (const f of [...dims, ...meas]) {
      const ref = `${mName}.${f}`;
      out.push(ref);
    }
  }
  return out;
}

function measureLikeScore(ref: string): number {
  const s = String(ref ?? "").trim().toLowerCase();
  if (!s) return 0;
  let n = 0;
  if (s.includes("count")) n += 5;
  if (s.includes("sum") || s.includes("total")) n += 4;
  if (s.includes("amount") || s.includes("price") || s.includes("revenue")) n += 4;
  if (s.includes("paid") || s.includes("generation")) n += 3;
  if (s === "rows" || s.includes("row")) n += 2;
  return n;
}

function normalizeMappingLike(m: any): ColumnMappingLike {
  const base = (m && typeof m === "object") ? m : {};

  const normalizeYArr = (arr: any): Array<{ col: string; agg?: string; fieldType?: "dimension" | "measure" | "time" }> => {
    if (!Array.isArray(arr)) return [];
    const res: Array<{ col: string; agg?: string; fieldType?: "dimension" | "measure" | "time" }> = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const col = String(item ?? "").trim();
        if (col) res.push({ col, agg: "SUM" });
        continue;
      }
      if (item && typeof item === "object") {
        const col = String((item as any)?.col ?? (item as any)?.column ?? "").trim();
        if (!col) continue;
        const agg = String((item as any)?.agg ?? (item as any)?.aggregate ?? "").trim();
        const fieldTypeRaw = String((item as any)?.fieldType ?? "").trim();
        const fieldType = (fieldTypeRaw === "dimension" || fieldTypeRaw === "measure" || fieldTypeRaw === "time")
          ? (fieldTypeRaw as "dimension" | "measure" | "time")
          : undefined;
        const normalizedAgg = uiAggToAggFn(agg);
        res.push(normalizedAgg
          ? { col, agg: normalizedAgg === "countDistinct" ? "COUNTD" : normalizedAgg.toUpperCase(), ...(fieldType ? { fieldType } : {}) }
          : { col, ...(fieldType ? { fieldType } : {}) });
      }
    }
    return res;
  };

  const yColumns = normalizeYArr((base as any).yColumns);
  const y2Columns = normalizeYArr((base as any).y2Columns);
  return {
    ...(base as any),
    xColumn: String((base as any)?.xColumn ?? "") || undefined,
    groupBy: String((base as any)?.groupBy ?? "") || undefined,
    yColumns,
    y2Columns,
    colorByMeasure: Boolean((base as any)?.colorByMeasure),
    tooltipColumns: uniqStrings((base as any)?.tooltipColumns),
    detailsColumns: uniqStrings((base as any)?.detailsColumns),
    drilldownColumns: uniqStrings((base as any)?.drilldownColumns),
    details2Columns: uniqStrings((base as any)?.details2Columns),
  };
}

function remapMapping(prevViz: VizType, nextViz: VizType, current: ColumnMappingLike | null): ColumnMappingLike {
  const m = normalizeMappingLike(current);
  if (prevViz === nextViz) return m;

  if ((prevViz === "line" || prevViz === "bar") && (nextViz === "line" || nextViz === "bar")) {
    return m;
  }

  if (nextViz === "table") {
    const x = String(m?.xColumn ?? "").trim();
    const g = String(m?.groupBy ?? "").trim();
    const y = (Array.isArray(m?.yColumns) ? m!.yColumns! : []).map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
    const y2 = (Array.isArray(m?.y2Columns) ? m!.y2Columns! : []).map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
    const detailsColumns = uniqStrings([x, g, ...y, ...y2]);
    return {
      ...m,
      detailsColumns,
    };
  }

  if (prevViz === "table" && (nextViz === "line" || nextViz === "bar")) {
    const details = uniqStrings(m?.detailsColumns);
    const xColumn = String(m?.xColumn ?? "").trim() || String(details[0] ?? "").trim() || undefined;
    const bestMeasure = details
      .map((d) => ({ d, s: measureLikeScore(d) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0]?.d;
    const yColumns = (Array.isArray(m?.yColumns) && m.yColumns.length > 0)
      ? m.yColumns
      : (bestMeasure ? [{ col: bestMeasure, agg: "SUM", fieldType: "measure" }] : []);
    return {
      ...m,
      xColumn,
      yColumns,
    };
  }

  if (nextViz === "pie") {
    const y0 = String((Array.isArray(m?.yColumns) ? m!.yColumns! : [])?.[0]?.col ?? "").trim();
    const details = uniqStrings(m?.detailsColumns);
    const category = String(m?.groupBy ?? "").trim() || String(m?.xColumn ?? "").trim() || String(details[0] ?? "").trim();
    const bestMeasure = details
      .map((d) => ({ d, s: measureLikeScore(d) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0]?.d;
    const value = y0 || String(bestMeasure ?? "").trim();
    return {
      ...m,
      groupBy: category || undefined,
      yColumns: value ? [{ col: value, agg: "SUM" }] : [],
      y2Columns: [],
    };
  }

  if (prevViz === "pie" && (nextViz === "line" || nextViz === "bar")) {
    const xColumn = String(m?.xColumn ?? "").trim() || String(m?.groupBy ?? "").trim() || undefined;
    return {
      ...m,
      xColumn,
    };
  }

  if (nextViz === "donut") {
    return remapMapping(prevViz, "pie", current);
  }

  if (nextViz === "area") {
    return remapMapping(prevViz, "line", current);
  }

  if (nextViz === "kpi") {
    const y0 = String((Array.isArray(m?.yColumns) ? m.yColumns : [])?.[0]?.col ?? "").trim();
    const details = uniqStrings(m?.detailsColumns);
    const bestMeasure = details
      .map((d) => ({ d, s: measureLikeScore(d) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0]?.d;
    const value = y0 || String(bestMeasure ?? "").trim();
    return {
      ...m,
      yColumns: value ? [{ col: value, agg: "SUM" }] : [],
      xColumn: undefined,
      groupBy: undefined,
      y2Columns: [],
    };
  }

  return m;
}

type SlotKey =
  | "axis"
  | "values"
  | "legend"
  | "rows"
  | "columns"
  | "category"
  | "tooltips";

type SlotSchema = {
  key: SlotKey;
  label: string;
  min: number;
  max: number;
  accepts: Array<"dimension" | "measure" | "time">;
};

const VIZ_SLOTS: Record<VizType, SlotSchema[]> = {
  line: [
    { key: "axis", label: "Axis (X)", min: 0, max: 1, accepts: ["dimension", "time"] },
    { key: "values", label: "Axis (Y)", min: 0, max: 99, accepts: ["dimension", "measure"] },
    { key: "legend", label: "Legend (group by)", min: 0, max: 1, accepts: ["dimension"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  area: [
    { key: "axis", label: "Axis (X)", min: 0, max: 1, accepts: ["dimension", "time"] },
    { key: "values", label: "Axis (Y)", min: 0, max: 99, accepts: ["dimension", "measure"] },
    { key: "legend", label: "Legend (group by)", min: 0, max: 1, accepts: ["dimension"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  bar: [
    { key: "axis", label: "Axis (X)", min: 0, max: 1, accepts: ["dimension", "time"] },
    { key: "values", label: "Axis (Y)", min: 0, max: 99, accepts: ["dimension", "measure"] },
    { key: "legend", label: "Legend (group by)", min: 0, max: 1, accepts: ["dimension"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  scatter: [
    { key: "axis", label: "X", min: 0, max: 1, accepts: ["dimension", "measure"] },
    { key: "values", label: "Y", min: 0, max: 99, accepts: ["dimension", "measure"] },
    { key: "legend", label: "Legend (group by)", min: 0, max: 1, accepts: ["dimension"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  histogram: [
    { key: "axis", label: "Values", min: 0, max: 1, accepts: ["dimension", "measure"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  table: [
    { key: "columns", label: "Columns", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  pivot: [
    { key: "rows", label: "Rows", min: 1, max: 1, accepts: ["dimension", "time"] },
    { key: "columns", label: "Columns", min: 1, max: 1, accepts: ["dimension", "time"] },
    { key: "values", label: "Values", min: 0, max: 1, accepts: ["measure", "dimension"] },
  ],
  pie: [
    { key: "category", label: "Category", min: 0, max: 1, accepts: ["dimension"] },
    { key: "values", label: "Values", min: 0, max: 1, accepts: ["dimension", "measure"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  donut: [
    { key: "category", label: "Category", min: 0, max: 1, accepts: ["dimension"] },
    { key: "values", label: "Values", min: 0, max: 1, accepts: ["dimension", "measure"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  kpi: [
    { key: "values", label: "Value", min: 1, max: 1, accepts: ["dimension", "measure"] },
    { key: "tooltips", label: "Tooltip", min: 0, max: 99, accepts: ["dimension", "measure", "time"] },
  ],
  slicer: [
    { key: "axis", label: "Field", min: 1, max: 1, accepts: ["dimension", "time"] },
  ],
};

function normalizeFieldType(f: DragFieldInfo): "dimension" | "measure" | "time" {
  if (f.fieldType === "measure") return "measure";
  if (f.fieldType === "time") return "time";
  return "dimension";
}

function isAllowedInSlot(slot: SlotSchema, f: DragFieldInfo): boolean {
  const ft = normalizeFieldType(f);
  return slot.accepts.includes(ft);
}

function BuildMultiDropZone({
  label,
  values,
  onDrop,
  onRemove,
  onClear,
}: {
  label: string;
  values: string[];
  onDrop: (field: DragFieldInfo) => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const parsed = parseDropEvent(e);
      if (!parsed) return;
      if (parsed.kind === "field") {
        onDrop(parsed.field);
        return;
      }
      // Calendar drops are represented as a special token; parent handles semantic patch.
      onDrop({ ref: "__time__", fieldType: "time" });
    } catch {
      // ignore
    }
  };

  const hasValues = Array.isArray(values) && values.length > 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border p-3 transition ${
        isDragOver
          ? "border-emerald-400/30 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        {hasValues && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            title="Clear"
          >
            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
          </button>
        )}
      </div>

      <div className="mt-2">
        {hasValues ? (
          <div className="flex flex-wrap gap-2">
            {values.map((v, idx) => (
              <div
                key={`${label}_${idx}_${v}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[11px] font-semibold text-white"
                title={v}
              >
                <span className="max-w-[180px] truncate">{v}</span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="p-0.5 rounded-lg hover:bg-white/10 transition"
                  title="Remove"
                >
                  <Plus className="w-3.5 h-3.5" style={{ transform: "rotate(45deg)" }} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500 text-xs py-2">{isDragOver ? "Drop here" : "Drag fields here"}</div>
        )}
      </div>
    </div>
  );
}

function BuildDropZone({
  label,
  value,
  onDrop,
  onClear,
  compact,
}: {
  label: string;
  value: string;
  onDrop: (field: DragFieldInfo) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const parsed = parseDropEvent(e);
      if (!parsed) return;
      if (parsed.kind === "field") {
        onDrop(parsed.field);
        return;
      }
      onDrop({ ref: "__time__", fieldType: "time" });
    } catch {
      // ignore
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border p-3 transition ${
        isDragOver
          ? "border-emerald-400/30 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        {!!value && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Clear this field shelf?")) return;
              onClear();
            }}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            title="Clear"
          >
            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
          </button>
        )}
      </div>

      <div className={compact ? "mt-1" : "mt-2"}>
        {value ? (
          <div className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-white truncate">
            {value}
          </div>
        ) : (
          <div className={`text-slate-500 ${compact ? "text-[11px] py-1" : "text-xs py-2"}`}>
            {isDragOver ? "Drop here" : "Drag field here"}
          </div>
        )}
      </div>
    </div>
  );
}

export function VisualizationsSlideInPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const { semanticModelV1 } = useSemanticModel();
  const { setDateRange } = useGlobalFilters();

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const raw = String(window.localStorage.getItem("dashboard:visualizationsPanelWidth") ?? "").trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 300 && n <= 720) return n;
    } catch {}
    return 380;
  });
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(380);

  useEffect(() => {
    try {
      window.localStorage.setItem("dashboard:visualizationsPanelWidth", String(panelWidth));
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:panel-width-changed", {
          detail: { panel: "visualizations", width: panelWidth },
        })
      );
    } catch {}
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = (e.clientX ?? 0) - (startXRef.current ?? 0);
      // This is a RIGHT-side panel; dragging its LEFT edge to the left increases width.
      const next = Math.max(300, Math.min(720, (startWRef.current ?? 380) - dx));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      try {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rejectHintTimerRef.current) {
        window.clearTimeout(rejectHintTimerRef.current);
      }
    };
  }, []);

  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [activeChartData, setActiveChartData] = useState<any>(null);

  const activeSourceModel = String((activeChartData as any)?.logicalQuery?.sourceModel ?? "").trim();
  const semanticFieldLists = useMemo(() => {
    const model = semanticModelV1 && typeof semanticModelV1 === "object" ? semanticModelV1 : null;
    const src = activeSourceModel;
    const modelsObj = model?.models && typeof model.models === "object" ? model.models : {};
    const m = src ? (modelsObj as any)[src] : null;
    const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
    const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];

    const toItem = (field: string, kind: "dimension" | "measure") => {
      const ref = src ? `${src}.${field}` : field;
      const label = field;
      return { ref, label, kind };
    };
    return {
      dims: dims.map((d) => toItem(d, "dimension")),
      meas: meas.map((y) => toItem(y, "measure")),
    };
  }, [semanticModelV1, activeSourceModel]);

  const activeChartIdRef = useRef<string | null>(null);
  activeChartIdRef.current = activeChartId;

  useEffect(() => {
    const onActiveChartId = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.chartId ? String(detail.chartId) : null;
      setActiveChartId(cid);
      const nextChartData = (detail?.chartData && typeof detail.chartData === "object") ? detail.chartData : null;
      setActiveChartData(nextChartData);
    };

    const onChartDataPatched = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.chartId ? String(detail.chartId) : null;
      if (!cid) return;

      const currentActiveId = activeChartIdRef.current;
      if (!currentActiveId || cid !== currentActiveId) return;

      const patch = detail?.patch;
      if (!patch || typeof patch !== "object") return;

      setActiveChartData((prev: any) => {
        const base = (prev && typeof prev === "object") ? prev : {};
        return { ...base, ...patch };
      });
    };

    window.addEventListener("dashboard:active-chart-id", onActiveChartId as EventListener);
    window.addEventListener("dashboard:update-chart-data", onChartDataPatched as EventListener);
    return () => {
      window.removeEventListener("dashboard:active-chart-id", onActiveChartId as EventListener);
      window.removeEventListener("dashboard:update-chart-data", onChartDataPatched as EventListener);
    };
  }, []);

  const canEdit = Boolean(activeChartId);
  const [activeTab, setActiveTab] = useState<"build" | "format" | "filters">("build");
  const [dropRejectHint, setDropRejectHint] = useState("");
  const rejectHintTimerRef = useRef<number | null>(null);
  const isDbTableDirectSqlChart = String((activeChartData as any)?.kind ?? "").trim() === "db-table";
  const directSql = String((activeChartData as any)?.customSql ?? "");

  const patchDirectSql = (nextSql: string) => {
    if (!activeChartId) return;
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: activeChartId,
          patch: {
            customSql: String(nextSql ?? ""),
          },
        },
      })
    );
  };

  const forceRunDirectSql = () => {
    if (!activeChartId) return;
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: activeChartId,
          patch: {
            __sqlRunNonce: Date.now(),
          },
        },
      })
    );
  };

  const insertDirectSqlToken = (token: string) => {
    const base = String((activeChartData as any)?.customSql ?? "");
    const t = String(token ?? "").trim();
    if (!t) return;
    patchDirectSql(`${base}${base && !base.endsWith("\n") ? "\n" : ""}${t}`);
  };

  const mapping = useMemo(() => {
    const data = (activeChartData && typeof activeChartData === "object") ? activeChartData : null;
    const m = data?.columnMapping;
    return (m && typeof m === "object") ? (m as ColumnMappingLike) : null;
  }, [activeChartData]);


  const applyCalendarDrop = (e: React.DragEvent) => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) return false;
    const parsed = parseDropEvent(e);
    if (!parsed || parsed.kind !== "calendar") return false;

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: cid,
          patch: {
            logicalQuery: {
              time: { dimension: parsed.baseTimeRef, granularity: parsed.granularity },
            },
          },
        },
      })
    );
    return true;
  };

  const vizType = useMemo(() => {
    const cfgViz = String(activeChartData?.chartConfig?.general?.vizType ?? "").trim().toLowerCase();
    const legacy = String(activeChartData?.__forceVizType ?? "").trim().toLowerCase();
    const v = cfgViz || legacy;
    return (
      v === "line"
      || v === "bar"
      || v === "table"
      || v === "pivot"
      || v === "pie"
      || v === "donut"
      || v === "area"
      || v === "kpi"
      || v === "scatter"
      || v === "histogram"
      || v === "slicer"
    )
      ? (v as VizType)
      : "line";
  }, [activeChartData]);

  const patchMapping = (patch: Partial<ColumnMappingLike>) => {
    if (!activeChartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev, ...patch };
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId: activeChartId, patch: { columnMapping: next } },
      })
    );
  };

  const patchLogicalQueryForTableColumns = (nextDetailsColumns: string[], force = false) => {
    if (!activeChartId) return;
    if (!force && vizType !== "table") return;
    const src = String((activeChartData as any)?.logicalQuery?.sourceModel ?? "").trim();
    const modelObj = (semanticModelV1 && typeof semanticModelV1 === "object")
      ? (semanticModelV1 as any)?.models?.[src]
      : null;
    if (!src || !modelObj || typeof modelObj !== "object") return;

    const dimsObj = modelObj?.dimensions && typeof modelObj.dimensions === "object" ? modelObj.dimensions : {};
    const measObj = modelObj?.measures && typeof modelObj.measures === "object" ? modelObj.measures : {};
    const dimNames = Object.keys(dimsObj);
    const measNames = Object.keys(measObj);

    const toRef = (raw: string): string => {
      const s = String(raw ?? "").trim();
      if (!s) return "";
      if (s.includes(".")) return s;
      const dimHit = dimNames.find((k) => k.toLowerCase() === s.toLowerCase());
      if (dimHit) return `${src}.${dimHit}`;
      const measHit = measNames.find((k) => k.toLowerCase() === s.toLowerCase());
      if (measHit) return `${src}.${measHit}`;
      return "";
    };

    const refs = nextDetailsColumns.map(toRef).filter(Boolean);
    const dims: string[] = [];
    const meas: string[] = [];
    for (const r of refs) {
      const ref = String(r ?? "").trim();
      if (!ref.includes(".")) continue;
      const field = ref.split(".").slice(1).join(".");
      if (Object.prototype.hasOwnProperty.call(measObj, field)) {
        meas.push(ref);
      } else if (Object.prototype.hasOwnProperty.call(dimsObj, field)) {
        dims.push(ref);
      }
    }

    const nextDims = Array.from(new Set(dims));
    const nextMeas = Array.from(new Set(meas));
    const yLike = [
      ...(Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : []),
      ...(Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : []),
    ];
    const measureAggOverrides = (() => {
      const out: Record<string, "sum" | "avg" | "count" | "countDistinct" | "min" | "max"> = {};
      for (const y of yLike) {
        const col = String((y as any)?.col ?? "").trim();
        if (!col) continue;
        const ref = toRef(col);
        if (!ref) continue;
        const agg = uiAggToAggFn((y as any)?.agg);
        if (!agg) continue;
        out[ref] = agg;
      }
      return out;
    })();
    const measuresV2 = nextMeas.map((ref) => {
      const field = String(ref ?? "").split(".").slice(1).join(".");
      const aggFn = measureAggOverrides[ref] ?? (field ? measureAggOverrides[field] : undefined);
      return aggFn ? { ref, aggFn } : { ref };
    });
    const prevLq = ((activeChartData as any)?.logicalQuery && typeof (activeChartData as any).logicalQuery === "object")
      ? (activeChartData as any).logicalQuery
      : {};

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: activeChartId,
          patch: {
            logicalQuery: {
              ...prevLq,
              sourceModel: src,
              dimensions: nextDims,
              measures: nextMeas,
              ...(measuresV2.length > 0 ? { measuresV2 } : {}),
              ...(Object.keys(measureAggOverrides).length > 0 ? { measureAggOverrides } : {}),
              noFallbackMeasure: true,
              filterNullDimensions: true,
              limit: Number.isFinite(Number((prevLq as any)?.limit)) ? Number((prevLq as any).limit) : 500,
            },
          },
        },
      })
    );
  };

  const patchLogicalQueryForTableColumnsAs = (nextVizType: VizType, nextDetailsColumns: string[]) => {
    if (!activeChartId) return;
    if (nextVizType !== "table") return;
    patchLogicalQueryForTableColumns(nextDetailsColumns, true);
  };

  const setVizType = (v: VizType) => {
    if (!activeChartId) return;
    const prevCfg = (activeChartData?.chartConfig && typeof activeChartData.chartConfig === "object") ? activeChartData.chartConfig : {};
    const prevGeneral = (prevCfg?.general && typeof prevCfg.general === "object") ? prevCfg.general : {};
    const nextCfg = {
      ...prevCfg,
      general: {
        ...prevGeneral,
        vizType: v,
      },
    };

    const prevVizType = vizType;
    const currentMapping = normalizeMappingLike(mapping);
    const prevStoreRaw = (activeChartData && typeof activeChartData === "object") ? (activeChartData as any).__vizMappings : null;
    const prevStore = (prevStoreRaw && typeof prevStoreRaw === "object") ? prevStoreRaw : {};

    const nextStore = {
      ...prevStore,
      [prevVizType]: currentMapping,
    };

    const storedNext = (prevStore && typeof prevStore === "object") ? (prevStore as any)[v] : null;
    const nextMappingRaw = (storedNext && typeof storedNext === "object")
      ? normalizeMappingLike(storedNext)
      : remapMapping(prevVizType, v, currentMapping);

    const nextMapping = normalizeMappingLike(nextMappingRaw);

    if (v === "slicer") {
      // Slicer uses chartData.kind = 'slicer' and chartData.slicer.fieldRef; mapping is irrelevant.
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: activeChartId,
            patch: {
              kind: "slicer",
              slicer: {
                fieldRef: String((activeChartData as any)?.slicer?.fieldRef ?? "").trim(),
                mode: String((activeChartData as any)?.slicer?.mode ?? "list").trim() || "list",
                multiSelect: true,
                selectedValues: Array.isArray((activeChartData as any)?.slicer?.selectedValues)
                  ? (activeChartData as any).slicer.selectedValues
                  : [],
                dateOp: ((activeChartData as any)?.slicer?.dateOp === "between" || (activeChartData as any)?.slicer?.dateOp === "gte" || (activeChartData as any)?.slicer?.dateOp === "lte")
                  ? (activeChartData as any).slicer.dateOp
                  : "between",
                dateFrom: String((activeChartData as any)?.slicer?.dateFrom ?? ""),
                dateTo: String((activeChartData as any)?.slicer?.dateTo ?? ""),
              },
              chartConfig: nextCfg,
            },
          },
        })
      );
      return;
    }

    if (v === "table") {
      const filled = uniqStrings(nextMapping.detailsColumns);
      if (filled.length === 0) {
        const remapped = remapMapping(prevVizType, "table", currentMapping);
        nextMapping.detailsColumns = uniqStrings((remapped as any)?.detailsColumns);
      }
      {
        const src = String((activeChartData as any)?.logicalQuery?.sourceModel ?? "").trim();
        const modelsObj = (semanticModelV1 && typeof semanticModelV1 === "object")
          ? ((semanticModelV1 as any)?.models && typeof (semanticModelV1 as any).models === "object" ? (semanticModelV1 as any).models : {})
          : {};
        const modelObj = src && Object.prototype.hasOwnProperty.call(modelsObj, src)
          ? (modelsObj as any)[src]
          : null;

        if (modelObj && typeof modelObj === "object") {
          const yLike = new Set([
            ...(Array.isArray((nextMapping as any)?.yColumns) ? (nextMapping as any).yColumns.map((yy: any) => String(yy?.col ?? "").trim()) : []),
            ...(Array.isArray((nextMapping as any)?.y2Columns) ? (nextMapping as any).y2Columns.map((yy: any) => String(yy?.col ?? "").trim()) : []),
          ].filter(Boolean).map((s: string) => s.toLowerCase()));

          const xLike = new Set([
            String((nextMapping as any)?.xColumn ?? "").trim().toLowerCase(),
            String((nextMapping as any)?.groupBy ?? "").trim().toLowerCase(),
          ].filter(Boolean));

          const kindOf = (raw: string): "dimension" | "measure" | "unknown" => {
            const s = String(raw ?? "").trim();
            if (!s) return "unknown";
            const qualified = s.includes(".") ? s : `${src}.${s}`;
            const kind = classifyFieldRef(qualified, semanticModelV1 as any);
            if (kind === "measure") return "measure";
            if (kind === "dimension" || kind === "time") return "dimension";
            return "unknown";
          };

          nextMapping.detailsColumns = uniqStrings((Array.isArray(nextMapping.detailsColumns) ? nextMapping.detailsColumns : []).filter((col: any) => {
            const c = String(col ?? "").trim();
            if (!c) return false;
            const lc = c.toLowerCase();
            if (xLike.has(lc)) return true;
            if (yLike.has(lc)) return kindOf(c) === "measure";
            return true;
          }));
        }
      }
      patchLogicalQueryForTableColumnsAs("table", uniqStrings(nextMapping.detailsColumns));
    }

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: activeChartId,
          patch: {
            chartConfig: nextCfg,
            columnMapping: nextMapping,
            __vizMappings: nextStore,
          },
        },
      })
    );
  };

  const clearMappingKey = (key: "xColumn" | "groupBy") => {
    if (!activeChartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev } as any;
    delete next[key];
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId: activeChartId, patch: { columnMapping: next } },
      })
    );
  };

  const clearMappingArrayKey = (
    key: "tooltipColumns" | "detailsColumns" | "drilldownColumns" | "details2Columns"
  ) => {
    if (!activeChartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev } as any;
    delete next[key];
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId: activeChartId, patch: { columnMapping: next } },
      })
    );
    if (key === "detailsColumns") {
      patchLogicalQueryForTableColumns([]);
    }
  };

  const addToMappingArray = (
    key: "tooltipColumns" | "detailsColumns" | "drilldownColumns" | "details2Columns",
    col: string
  ) => {
    if (!activeChartId) return;
    const prevArr = Array.isArray((mapping as any)?.[key]) ? (mapping as any)[key] : [];
    const nextArr = Array.from(new Set([...prevArr, col].filter((x) => String(x).trim().length > 0)));
    patchMapping({ [key]: nextArr });
    if (key === "detailsColumns") {
      patchLogicalQueryForTableColumns(nextArr);
    }
  };

  const removeY = (idx: number) => {
    if (!activeChartId) return;
    const prevY = Array.isArray(mapping?.yColumns) ? (mapping as any).yColumns : [];
    const nextY = prevY.filter((_: any, i: number) => i !== idx);
    patchMapping({ yColumns: nextY });
  };

  const removeY2 = (idx: number) => {
    if (!activeChartId) return;
    const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
    const nextY2 = prevY2.filter((_: any, i: number) => i !== idx);
    patchMapping({ y2Columns: nextY2 });
  };

  const rejectDrop = () => {
    setDropRejectHint("This field type can't be used here");
    if (rejectHintTimerRef.current) window.clearTimeout(rejectHintTimerRef.current);
    rejectHintTimerRef.current = window.setTimeout(() => setDropRejectHint(""), 2000);
  };

  const [pipeline, setPipeline] = useState<ChartPipelineV1>(() => readPipelineFromChartData(activeChartData));
  const [pipelineSelectedStepId, setPipelineSelectedStepId] = useState<string>("");

  useEffect(() => {
    setPipeline(readPipelineFromChartData(activeChartData));
  }, [activeChartData]);

  useEffect(() => {
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    if (!steps.length) {
      setPipelineSelectedStepId("");
      return;
    }
    const stillExists = pipelineSelectedStepId && steps.some((s) => String((s as any)?.id ?? "") === pipelineSelectedStepId);
    if (!stillExists) {
      setPipelineSelectedStepId(String((steps[0] as any)?.id ?? ""));
    }
  }, [pipeline, pipelineSelectedStepId]);

  const selectedPipelineStep = useMemo(() => {
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    return steps.find((s) => String((s as any)?.id ?? "") === pipelineSelectedStepId) as (ComputeStepV1 | TransformStepV1 | undefined);
  }, [pipeline, pipelineSelectedStepId]);

  const pipelineComputeOutputIds = useMemo(() => {
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    const out = new Map<string, number>();
    for (const s of steps) {
      if (s && typeof s === "object" && (s as any).kind === "compute") {
        const id = String((s as any).outputId ?? "").trim();
        if (!id) continue;
        out.set(id, (out.get(id) ?? 0) + 1);
      }
    }
    return out;
  }, [pipeline]);

  const pipelineErrors = useMemo(() => {
    const errs: string[] = [];
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    for (const [id, cnt] of pipelineComputeOutputIds.entries()) {
      if (cnt > 1) errs.push(`Duplicate outputId: ${id}`);
    }
    for (const s of steps) {
      if (s && typeof s === "object" && (s as any).kind === "compute") {
        const outputId = String((s as any).outputId ?? "").trim();
        const formula = String((s as any).formula ?? "").trim();
        if (!outputId) errs.push("Compute step has empty outputId");
        if (!formula) errs.push(`Compute ${outputId || "(no outputId)"} has empty SQL formula`);
      }
      if (
        s &&
        typeof s === "object" &&
        (s as any).kind === "transform" &&
        ((s as any).type === "cohort_pivot")
      ) {
        const cfg = (s as any).config ?? {};
        if (Boolean(cfg.enabled)) {
          if (!String(cfg.cohortField ?? "").trim()) errs.push("Cohort Analysis enabled but cohortField is empty");
          if (!String(cfg.activityField ?? "").trim()) errs.push("Cohort Analysis enabled but activityField is empty");
          if (!String(cfg.userField ?? "").trim() && !String(cfg.usersField ?? "").trim()) errs.push("Cohort Analysis enabled but user/users field is empty");
          if (!normalizePeriods(cfg.periods).length) errs.push("Cohort Analysis enabled but periods list is empty");
        }
      }
    }
    return Array.from(new Set(errs));
  }, [pipeline, pipelineComputeOutputIds]);

  const applyPipeline = () => {
    if (!activeChartId) return;
    const patch = writePipelineToChartPatch(pipeline);
    window.dispatchEvent(new CustomEvent("dashboard:update-chart-data", {
      detail: { chartId: activeChartId, patch },
    }));
  };

  const updatePipelineStep = (id: string, updater: (prev: ComputeStepV1 | TransformStepV1) => ComputeStepV1 | TransformStepV1) => {
    setPipeline((prev) => {
      const steps = Array.isArray(prev?.steps) ? prev.steps : [];
      return {
        version: 1,
        steps: steps.map((s) => {
          if (String((s as any)?.id ?? "") !== id) return s;
          return updater(s as any);
        }),
      };
    });
  };

  const addComputeStep = () => {
    const id = makeStepId("compute");
    const existing = new Set(Array.from(pipelineComputeOutputIds.keys()));
    let outputId = "metric";
    if (existing.has(outputId)) {
      let i = 2;
      while (existing.has(`metric_${i}`)) i += 1;
      outputId = `metric_${i}`;
    }
    const step: ComputeStepV1 = {
      id,
      kind: "compute",
      name: outputId,
      outputId,
      uiFormula: "",
      formula: "",
      calcMode: "formula",
      aggregation: "none",
      hidden: false,
    };
    setPipeline((prev) => ({ version: 1, steps: [...(Array.isArray(prev?.steps) ? prev.steps : []), step] }));
    setPipelineSelectedStepId(id);
  };

  const addCohortPivotStep = () => {
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    const already = steps.some(
      (s) =>
        s &&
        typeof s === "object" &&
        (s as any).kind === "transform" &&
        ((s as any).type === "cohort_pivot")
    );
    if (already) {
      const existing = steps.find(
        (s) =>
          s &&
          typeof s === "object" &&
          (s as any).kind === "transform" &&
          ((s as any).type === "cohort_pivot")
      );
      if (existing) setPipelineSelectedStepId(String((existing as any).id ?? ""));
      return;
    }
    const id = makeStepId("transform");
    const step: TransformStepV1 = {
      id,
      kind: "transform",
      type: "cohort_pivot",
      name: "Cohort Analysis",
      config: {
        enabled: false,
        cohortField: "",
        activityField: "",
        userField: "",
        usersField: "",
        period: "day",
        unit: "day",
        periods: [0, 1, 7, 14, 30],
        pivotMode: "auto",
        maxRows: 50000,
        rawMode: false,
        rawConnectionId: "",
        rawTableKey: "",
      },
      meta: { execution: "client" },
    };
    setPipeline((prev) => ({ version: 1, steps: [...(Array.isArray(prev?.steps) ? prev.steps : []), step] }));
    setPipelineSelectedStepId(id);
  };

  const removePipelineStep = (id: string) => {
    setPipeline((prev) => ({
      version: 1,
      steps: (Array.isArray(prev?.steps) ? prev.steps : []).filter((s) => String((s as any)?.id ?? "") !== id),
    }));
    setPipelineSelectedStepId((prevId) => (prevId === id ? "" : prevId));
  };

  const selectedComputeSession = useMemo(() => {
    if (!selectedPipelineStep || selectedPipelineStep.kind !== "compute") return null;
    const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
    return createPipelineExprSessionForStep({
      semanticModelV1,
      sourceModel: activeSourceModel,
      dialect: "postgres",
      mode: "legacy-calc-expr",
      steps: steps.map((s: any) => ({ id: String(s?.id ?? ""), kind: String(s?.kind ?? ""), outputId: String(s?.outputId ?? "") })),
      stepId: String(selectedPipelineStep.id ?? ""),
      maxCacheEntries: 200,
    });
  }, [pipeline, selectedPipelineStep, semanticModelV1, activeSourceModel]);

  const selectedComputeAnalysis = useMemo(() => {
    try {
      if (!selectedPipelineStep || selectedPipelineStep.kind !== "compute") {
        return { ok: true as const, error: "", execution: "sql" as const, depsText: "", warning: "" };
      }
      const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
      const ui = String(selectedPipelineStep.uiFormula ?? "").trim();
      const sql = String(selectedPipelineStep.formula ?? "").trim();
      const input = ui || sql;
      if (!input) {
        return { ok: false as const, error: "Formula is empty", execution: "client" as const, depsText: "", warning: "" };
      }

      const ctx = buildExprContextForPipelineStep({
        semanticModelV1,
        sourceModel: activeSourceModel,
        dialect: "postgres",
        mode: "legacy-calc-expr",
        steps: steps.map((s: any) => ({ id: String(s?.id ?? ""), kind: String(s?.kind ?? ""), outputId: String(s?.outputId ?? "") })),
        stepId: String(selectedPipelineStep.id ?? ""),
      });

      const errors = getEditorDiagnostics({ formula: input, ctx, cache: selectedComputeSession?.cache });
      const depsText = "";
      const firstError = errors[0];
      if (firstError) {
        return { ok: false as const, error: firstError.message, execution: "client" as const, depsText, warning: "" };
      }

      return { ok: true as const, error: "", execution: "sql" as const, depsText, warning: "" };
    } catch (e: any) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Formula analysis error", execution: "client" as const, depsText: "", warning: "" };
    }
  }, [pipeline, selectedPipelineStep, semanticModelV1, activeSourceModel, selectedComputeSession]);

  const monacoFormulaLanguageId = "paFormula";

  const computeEditorFieldRefs = useMemo(() => {
    const semRefs = [
      ...(Array.isArray(semanticFieldLists?.dims) ? semanticFieldLists.dims.map((x: any) => String(x?.ref ?? "").trim()) : []),
      ...(Array.isArray(semanticFieldLists?.meas) ? semanticFieldLists.meas.map((x: any) => String(x?.ref ?? "").trim()) : []),
    ].filter(Boolean);

    const pipelineRefs = (Array.isArray(pipeline?.steps) ? pipeline.steps : [])
      .filter((s: any) => s && typeof s === "object" && String(s.kind) === "compute")
      .map((s: any) => {
        const out = String(s.outputId ?? "").trim();
        if (!out) return "";
        return activeSourceModel ? `${activeSourceModel}.${out}` : out;
      })
      .filter(Boolean);

    return Array.from(new Set([...semRefs, ...pipelineRefs]));
  }, [semanticFieldLists, pipeline, activeSourceModel]);

  const canApplyPipeline = useMemo(() => pipelineErrors.length === 0 && selectedComputeAnalysis.ok, [pipelineErrors, selectedComputeAnalysis.ok]);

  return (
    <div className="h-full p-4" style={{ width: panelWidth }}>
      <div className="relative h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-3xl overflow-hidden flex flex-col">
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            resizingRef.current = true;
            startXRef.current = e.clientX ?? 0;
            startWRef.current = panelWidth;
            try {
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            } catch {}
          }}
          className="absolute top-0 left-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-white/10"
          title="Resize"
        />
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Visualizations</div>
                <div className="text-xs text-slate-400 truncate">{activeTab === "build" ? "Build" : activeTab === "format" ? "Format" : "Filters"}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <Plus className="w-5 h-5" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              { id: "build", label: "Build" },
              { id: "format", label: "Format" },
              { id: "filters", label: "Filters" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`viz-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 rounded-lg border text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {!!dropRejectHint && (
            <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100">
              {dropRejectHint}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-4">
            {!activeChartId && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
                <div className="text-sm font-semibold text-emerald-100">No chart selected</div>
                <div className="text-xs text-emerald-200/80 mt-1">Click a chart on the canvas to configure it.</div>
              </div>
            )}
            {activeChartId && activeTab === "build" && (
            <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                Date Presets
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "last7" as const, label: "Last 7 days" },
                  { key: "last30" as const, label: "Last 30 days" },
                  { key: "last90" as const, label: "Last 90 days" },
                  { key: "thisMonth" as const, label: "This month" },
                  { key: "thisQuarter" as const, label: "This quarter" },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                    onClick={() => {
                      const next = calcPresetRange(p.key);
                      setDateRange({ start: next.start, end: next.end });
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {isDbTableDirectSqlChart && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Direct SQL Query</div>
                    <div className="text-[11px] text-slate-400">
                      Supports <code>{`{{interval_from}}`}</code> and <code>{`{{interval_to}}`}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!!String(directSql ?? "").trim() && (
                      <span className="px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-200">
                        Custom SQL
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={forceRunDirectSql}
                      className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Run
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(["{{interval_from}}", "{{interval_to}}"] as const).map((token) => (
                    <button
                      key={token}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => insertDirectSqlToken(token)}
                      className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {token}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
                  <Editor
                    height="200px"
                    language="sql"
                    value={directSql}
                    onChange={(v: string | undefined) => patchDirectSql(String(v ?? ""))}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                      lineNumbers: "on",
                      folding: true,
                      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                      padding: { top: 8, bottom: 8 },
                    }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Computed Layer</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={addComputeStep}
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Compute
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={addCohortPivotStep}
                    className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Cohort Analysis
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Steps</div>
                  <div className="mt-2 space-y-2">
                    {(Array.isArray(pipeline?.steps) ? pipeline.steps : []).length === 0 ? (
                      <div className="text-xs text-slate-400">No steps yet</div>
                    ) : (
                      (Array.isArray(pipeline?.steps) ? pipeline.steps : []).map((s) => {
                        const isActive = String((s as any)?.id ?? "") === pipelineSelectedStepId;
                        const kind = String((s as any)?.kind ?? "");
                        const label = kind === "compute"
                          ? `compute: ${String((s as any)?.outputId ?? "").trim() || "(no outputId)"}`
                          : `transform: ${String((s as any)?.type ?? "")}`;
                        return (
                          <div key={String((s as any)?.id ?? "") } className={`flex items-center justify-between gap-2 px-2 py-2 rounded-xl border ${isActive ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                            <button
                              type="button"
                              onClick={() => setPipelineSelectedStepId(String((s as any)?.id ?? ""))}
                              className={`min-w-0 flex-1 text-left text-xs font-semibold ${isActive ? "text-emerald-200" : "text-slate-200"}`}
                              title={String((s as any)?.name ?? "")}
                            >
                              <div className="truncate">{label}</div>
                              <div className="text-[11px] font-normal text-slate-400 truncate">{String((s as any)?.name ?? "")}</div>
                            </button>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => removePipelineStep(String((s as any)?.id ?? ""))}
                              className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"
                              title="Remove"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Editor</div>

                  {!selectedPipelineStep ? (
                    <div className="text-xs text-slate-400">Select a step</div>
                  ) : selectedPipelineStep.kind === "compute" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${String(selectedPipelineStep.calcMode ?? "formula") === "formula" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}
                            onClick={() => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, calcMode: "formula" } as any))}
                          >
                            Formula
                          </button>
                          <button
                            type="button"
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${String(selectedPipelineStep.calcMode ?? "formula") === "direct" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-300"}`}
                            onClick={() => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, calcMode: "direct" } as any))}
                          >
                            Direct
                          </button>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-[11px] text-slate-300 hover:bg-white/10"
                          onClick={() => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, hidden: !Boolean((prev as any).hidden) } as any))}
                        >
                          {Boolean((selectedPipelineStep as any).hidden) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {Boolean((selectedPipelineStep as any).hidden) ? "Hidden" : "Visible"}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-slate-300 mb-1">Name</div>
                          <input
                            value={String(selectedPipelineStep.name ?? "")}
                            onChange={(e) => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, name: String(e.target.value ?? "") } as any))}
                            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-300 mb-1">outputId</div>
                          <input
                            value={String(selectedPipelineStep.outputId ?? "")}
                            onChange={(e) => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, outputId: String(e.target.value ?? "") } as any))}
                            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-slate-300 mb-1">Result type</div>
                          <select
                            value={String((selectedPipelineStep as any).resultType ?? "")}
                            onChange={(e) => {
                              const raw = String(e.target.value ?? "");
                              updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                ...prev,
                                ...(raw ? { resultType: raw } : { resultType: undefined }),
                              } as any));
                            }}
                            className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                          >
                            <option value="">auto</option>
                            <option value="number">number</option>
                            <option value="string">string</option>
                            <option value="date">date</option>
                            <option value="boolean">boolean</option>
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-slate-300 mb-1">Aggregation</div>
                          <select
                            value={String((selectedPipelineStep as any).aggregation ?? "none")}
                            onChange={(e) => {
                              const raw = String(e.target.value ?? "none");
                              updatePipelineStep(selectedPipelineStep.id, (prev) => {
                                const next: any = { ...prev, aggregation: raw };
                                if (String((prev as any).calcMode ?? "formula") === "direct") {
                                  const ref = String((prev as any).uiFormula ?? "").trim();
                                  const agg = String(raw);
                                  next.formula = agg === "none"
                                    ? ref
                                    : agg === "countd"
                                      ? `COUNTD(${ref})`
                                      : `${agg.toUpperCase()}(${ref})`;
                                }
                                return next as any;
                              });
                            }}
                            className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                          >
                            <option value="none">none</option>
                            <option value="sum">sum</option>
                            <option value="avg">avg</option>
                            <option value="min">min</option>
                            <option value="max">max</option>
                            <option value="count">count</option>
                            <option value="countd">countd</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${selectedComputeAnalysis.execution === "sql" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"}`}>
                          {selectedComputeAnalysis.execution.toUpperCase()}
                        </span>
                        {selectedComputeAnalysis.depsText ? (
                          <span className="text-[11px] text-slate-400 truncate" title={selectedComputeAnalysis.depsText}>
                            Depends on: {selectedComputeAnalysis.depsText}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Depends on: —</span>
                        )}
                      </div>

                      {String((selectedPipelineStep as any).calcMode ?? "formula") === "direct" ? (
                        <div className="space-y-2">
                          <div className="text-xs text-slate-300">Source field</div>
                          <select
                            value={String((selectedPipelineStep as any).uiFormula ?? "")}
                            onChange={(e) => {
                              const ref = String(e.target.value ?? "").trim();
                              updatePipelineStep(selectedPipelineStep.id, (prev) => {
                                const agg = String((prev as any).aggregation ?? "none");
                                const formula = agg === "none"
                                  ? ref
                                  : agg === "countd"
                                    ? `COUNTD(${ref})`
                                    : `${agg.toUpperCase()}(${ref})`;
                                return { ...prev, uiFormula: ref, formula } as any;
                              });
                            }}
                            className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                          >
                            <option value="">Select field...</option>
                            {computeEditorFieldRefs.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <div className="text-[11px] text-slate-400">Generated SQL: {String(selectedPipelineStep.formula ?? "") || "—"}</div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1 rounded-xl border border-white/10 bg-white/5 p-2 max-h-[180px] overflow-auto custom-scrollbar">
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Fields</div>
                            <div className="space-y-1">
                              {computeEditorFieldRefs.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  className="w-full text-left px-2 py-1 rounded-md text-[11px] text-slate-200 hover:bg-white/10"
                                  onClick={() => {
                                    const token = String(r ?? "").trim();
                                    if (!token) return;
                                    updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                      ...prev,
                                      formula: `${String((prev as any).formula ?? "").trim()}${String((prev as any).formula ?? "").trim() ? " " : ""}${token}`,
                                    } as any));
                                  }}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-xs text-slate-300 mb-1">SQL formula</div>
                            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
                              <Editor
                                height="160px"
                                language={monacoFormulaLanguageId}
                                value={String(selectedPipelineStep.formula ?? "")}
                                onChange={(v: string | undefined) =>
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, formula: String(v ?? "") } as any))
                                }
                                theme="vs-dark"
                                options={{
                                  minimap: { enabled: false },
                                  fontSize: 12,
                                  wordWrap: "on",
                                  scrollBeyondLastLine: false,
                                  lineNumbers: "off",
                                  folding: false,
                                  overviewRulerLanes: 0,
                                  glyphMargin: false,
                                  renderLineHighlight: "none",
                                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                                  padding: { top: 10, bottom: 10 },
                                }}
                                beforeMount={(monaco) => {
                                  try {
                                    if (!monaco.languages.getLanguages().some((l: any) => l.id === monacoFormulaLanguageId)) {
                                      monaco.languages.register({ id: monacoFormulaLanguageId });
                                    }
                                  } catch {}
                                }}
                                onMount={(editor, monaco) => {
                                  const model = editor.getModel();
                                  if (!model) return;
                                  const updateMarkers = () => {
                                    try {
                                      if (!selectedComputeSession) {
                                        monaco.editor.setModelMarkers(model, monacoFormulaLanguageId, []);
                                        return;
                                      }
                                      const value = model.getValue();
                                      const ctx = selectedComputeSession.ctx;
                                      const errors = getEditorDiagnostics({ formula: value, ctx, cache: selectedComputeSession.cache });
                                      const markers = (errors ?? []).map((e: any) => ({
                                        severity: monaco.MarkerSeverity.Error,
                                        message: String(e.message ?? "Error"),
                                        startLineNumber: Number(e.line ?? 1),
                                        startColumn: Number(e.column ?? 1),
                                        endLineNumber: Number(e.line ?? 1),
                                        endColumn: Number(e.endColumn ?? (Number(e.column ?? 1) + 1)),
                                      }));
                                      monaco.editor.setModelMarkers(model, monacoFormulaLanguageId, markers);
                                    } catch {
                                      try { monaco.editor.setModelMarkers(model, monacoFormulaLanguageId, []); } catch {}
                                    }
                                  };
                                  updateMarkers();
                                  const d = editor.onDidChangeModelContent(() => updateMarkers());
                                  const completion = monaco.languages.registerCompletionItemProvider(monacoFormulaLanguageId, {
                                    triggerCharacters: [".", "_"],
                                    provideCompletionItems: (m, pos) => {
                                      if (!selectedComputeSession) return { suggestions: [] } as any;
                                      const value = m.getValue();
                                      const offset = m.getOffsetAt(pos);
                                      const items = getExpressionCompletionsAt({ uiFormula: value, ctx: selectedComputeSession.ctx, offset, cache: selectedComputeSession.cache });
                                      const suggestions = items.map((it: any) => ({
                                        label: it.label,
                                        kind: it.kind === "function"
                                          ? monaco.languages.CompletionItemKind.Function
                                          : it.kind === "compute"
                                            ? monaco.languages.CompletionItemKind.Variable
                                            : monaco.languages.CompletionItemKind.Field,
                                        insertText: it.insertText,
                                      }));
                                      return { suggestions } as any;
                                    },
                                  });
                                  const hover = monaco.languages.registerHoverProvider(monacoFormulaLanguageId, {
                                    provideHover: (m, pos) => {
                                      if (!selectedComputeSession) return null;
                                      const value = m.getValue();
                                      const offset = m.getOffsetAt(pos);
                                      const info = getExpressionHover({ uiFormula: value, ctx: selectedComputeSession.ctx, offset, cache: selectedComputeSession.cache });
                                      if (!info) return null;
                                      return { contents: [{ value: String(info.label ?? "") }] } as any;
                                    },
                                  });
                                  editor.onDidDispose(() => {
                                    try { d.dispose(); } catch {}
                                    try { completion.dispose(); } catch {}
                                    try { hover.dispose(); } catch {}
                                  });
                                }}
                              />
                            </div>
                            {!selectedComputeAnalysis.ok && (
                              <div className="mt-2 text-xs text-rose-300">{selectedComputeAnalysis.error}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-slate-300">Cohort Analysis</div>
                        <label className="flex items-center gap-2 text-xs text-slate-300 select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedPipelineStep.config.enabled)}
                            onChange={(e) => updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, enabled: Boolean(e.target.checked) } } as any))}
                            className="accent-emerald-500"
                          />
                          Enabled
                        </label>
                      </div>

                      {Boolean(selectedPipelineStep.config.enabled) && (
                        <div className="space-y-3">
                          {(() => {
                            const src = String((activeChartData as any)?.logicalQuery?.sourceModel ?? "").trim();
                            const semFields = listAllSemanticFieldRefs(semanticModelV1, src);
                            const colsMeta = Array.isArray((activeChartData as any)?.columnsMeta) ? (activeChartData as any).columnsMeta : [];
                            const rawFields = colsMeta
                              .map((c: any) => String(c?.name ?? "").trim())
                              .filter(Boolean);
                            const fields = semFields.length > 0 ? semFields : rawFields;
                            const renderFieldSelect = (label: string, value: string, onChange: (v: string) => void) => (
                              <div>
                                <div className="text-xs text-slate-300 mb-1">{label}</div>
                                <select
                                  value={value}
                                  onChange={(e) => onChange(String(e.target.value ?? ""))}
                                  className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                                >
                                  <option value="">Select…</option>
                                  {fields.map((r: string) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            );

                            return (
                              <>
                                {renderFieldSelect("Cohort period", String(selectedPipelineStep.config.cohortField ?? ""), (v) => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, cohortField: v } } as any));
                                })}
                                {renderFieldSelect("Event time", String(selectedPipelineStep.config.activityField ?? ""), (v) => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, activityField: v } } as any));
                                })}
                                {renderFieldSelect("Entity id", String(selectedPipelineStep.config.userField ?? ""), (v) => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, userField: v } } as any));
                                })}
                                {renderFieldSelect("Users count (optional)", String((selectedPipelineStep.config as any).usersField ?? ""), (v) => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, usersField: v } } as any));
                                })}
                              </>
                            );
                          })()}

                          <div>
                            <div className="text-xs text-slate-300 mb-1">Period unit</div>
                            <select
                              value={String((selectedPipelineStep.config as any).unit ?? selectedPipelineStep.config.period ?? "day")}
                              onChange={(e) => {
                                const raw = String(e.target.value ?? "day");
                                const unit: "day" | "week" | "month" | "quarter" | "year" =
                                  (raw === "week" || raw === "month" || raw === "quarter" || raw === "year") ? raw : "day";
                                updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                  ...prev,
                                  config: {
                                    ...(prev as any).config,
                                    unit,
                                    period: unit === "quarter" || unit === "year" ? "day" : unit,
                                  },
                                } as any));
                              }}
                              className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                            >
                              <option value="day">day</option>
                              <option value="week">week</option>
                              <option value="month">month</option>
                              <option value="quarter">quarter</option>
                              <option value="year">year</option>
                            </select>
                          </div>

                          <div>
                            <div className="text-xs text-slate-300 mb-1">Periods</div>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {normalizePeriods((selectedPipelineStep.config as any).periods).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  className="px-2 py-1 rounded-lg border border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                                  onClick={() => {
                                    updatePipelineStep(selectedPipelineStep.id, (prev) => {
                                      const cur = normalizePeriods((prev as any)?.config?.periods);
                                      return {
                                        ...prev,
                                        config: {
                                          ...(prev as any).config,
                                          periods: cur.filter((x) => x !== p),
                                        },
                                      } as any;
                                    });
                                  }}
                                >
                                  {p} ×
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="px-2 py-1 rounded-lg border border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                                onClick={() => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => {
                                    const cur = normalizePeriods((prev as any)?.config?.periods);
                                    const last = cur.length ? cur[cur.length - 1] : 0;
                                    return {
                                      ...prev,
                                      config: {
                                        ...(prev as any).config,
                                        periods: normalizePeriods([...cur, last + (last < 7 ? 1 : 7)]),
                                      },
                                    } as any;
                                  });
                                }}
                              >
                                + Add
                              </button>
                              <input
                                type="text"
                                value={normalizePeriods((selectedPipelineStep.config as any).periods).join(",")}
                                onChange={(e) => {
                                  const raw = String(e.target.value ?? "");
                                  const next = normalizePeriods(raw.split(/[\s,;]+/).filter(Boolean));
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, periods: next } } as any));
                                }}
                                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                                placeholder="0,1,7,14,30"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs text-slate-300 mb-1">Pivot mode</div>
                              <select
                                value={String((selectedPipelineStep.config as any).pivotMode ?? "auto")}
                                onChange={(e) => {
                                  const raw = String(e.target.value ?? "auto");
                                  const pivotMode: "auto" | "client" | "sql" = raw === "client" || raw === "sql" ? raw : "auto";
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, pivotMode } } as any));
                                }}
                                className="dl-native-select-dark w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                              >
                                <option value="auto">auto</option>
                                <option value="client">client</option>
                                <option value="sql">sql</option>
                              </select>
                            </div>
                            <div>
                              <div className="text-xs text-slate-300 mb-1">Max rows</div>
                              <input
                                type="number"
                                min={100}
                                step={100}
                                value={Number((selectedPipelineStep.config as any).maxRows ?? 50000)}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  const maxRows = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 50000;
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({ ...prev, config: { ...(prev as any).config, maxRows } } as any));
                                }}
                                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                              />
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                            <label className="flex items-center gap-2 text-xs text-slate-300 select-none">
                              <input
                                type="checkbox"
                                checked={Boolean((selectedPipelineStep.config as any).rawMode)}
                                onChange={(e) => {
                                  updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                    ...prev,
                                    config: {
                                      ...(prev as any).config,
                                      rawMode: Boolean(e.target.checked),
                                    },
                                  } as any));
                                }}
                                className="accent-emerald-500"
                              />
                              Raw cohort mode (no semantic model)
                            </label>
                            {Boolean((selectedPipelineStep.config as any).rawMode) && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <div className="text-xs text-slate-300 mb-1">Raw connectionId</div>
                                  <input
                                    type="text"
                                    value={String((selectedPipelineStep.config as any).rawConnectionId ?? "")}
                                    onChange={(e) => {
                                      const rawConnectionId = String(e.target.value ?? "").trim();
                                      updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                        ...prev,
                                        config: {
                                          ...(prev as any).config,
                                          rawConnectionId,
                                        },
                                      } as any));
                                    }}
                                    placeholder="conn_xxx"
                                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                                  />
                                </div>
                                <div>
                                  <div className="text-xs text-slate-300 mb-1">Raw tableKey</div>
                                  <input
                                    type="text"
                                    value={String((selectedPipelineStep.config as any).rawTableKey ?? "")}
                                    onChange={(e) => {
                                      const rawTableKey = String(e.target.value ?? "").trim();
                                      updatePipelineStep(selectedPipelineStep.id, (prev) => ({
                                        ...prev,
                                        config: {
                                          ...(prev as any).config,
                                          rawTableKey,
                                        },
                                      } as any));
                                    }}
                                    placeholder="schema.table"
                                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-100 text-xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {pipelineErrors.length > 0 && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2">
                      <div className="text-xs font-semibold text-rose-200">Cannot apply</div>
                      <div className="mt-1 text-[11px] text-rose-200 space-y-1">
                        {pipelineErrors.map((e) => (
                          <div key={e}>{e}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={!canEdit || !canApplyPipeline}
                      onClick={applyPipeline}
                      className="px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Visualizations</div>
                <div className="text-[11px] text-slate-400 truncate">{activeChartId ? `Chart ${activeChartId}` : "No chart selected"}</div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {([
                  ["line", "Line", "📈"],
                  ["area", "Area", "🟩"],
                  ["bar", "Bar", "📊"],
                  ["column", "Column", "📶"],
                  ["pie", "Pie", "🥧"],
                  ["donut", "Donut", "🍩"],
                  ["scatter", "Scatter", "🔵"],
                  ["table", "Table", "📋"],
                  ["pivot", "Pivot", "🧩"],
                  ["kpi", "KPI", "🏷️"],
                  ["funnel", "Funnel", "🔻"],
                  ["waterfall", "Waterfall", "🪜"],
                  ["treemap", "Treemap", "🟫"],
                  ["histogram", "Histogram", "📉"],
                  ["cohort", "Cohort", "🧠"],
                  ["slicer", "Slicer", "🎚️"],
                ] as Array<[string, string, string]>).map(([id, label, icon]) => {
                  const supported = id === "line" || id === "area" || id === "bar" || id === "pie" || id === "donut" || id === "scatter" || id === "table" || id === "pivot" || id === "kpi" || id === "histogram" || id === "slicer";
                  const selected = vizType === (id as any);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canEdit || !supported}
                      onClick={() => supported && setVizType(id as VizType)}
                      className={`px-2 py-2 rounded-xl border text-[11px] font-semibold transition ${
                        selected
                          ? "bg-white/15 border-white/25 text-emerald-300"
                          : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                      } ${!supported ? "opacity-45 cursor-not-allowed" : ""}`}
                      title={supported ? label : `${label} (coming soon)`}
                    >
                      <div className="text-base leading-none">{icon}</div>
                      <div className="mt-1">{label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Fields</div>
                <div className="text-[11px] text-slate-400 truncate">Drag from Fields panel</div>
              </div>

              {vizType === "table" && (
                <div className="space-y-3">
                  <BuildMultiDropZone
                    label="Columns"
                    values={Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : []}
                    onDrop={(f) => {
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      addToMappingArray("detailsColumns", col);
                    }}
                    onRemove={(idx) => {
                      const prevArr = Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : [];
                      const nextArr = prevArr.filter((_: any, i: number) => i !== idx);
                      patchMapping({ detailsColumns: nextArr });
                      patchLogicalQueryForTableColumns(nextArr);
                    }}
                    onClear={() => clearMappingArrayKey("detailsColumns")}
                  />
                </div>
              )}

              {vizType === "pivot" && (
                <div className="space-y-3">
                  <BuildDropZone
                    label="Rows"
                    value={String((Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : [])[0] ?? "")}
                    onDrop={(f) => {
                      const slot = VIZ_SLOTS.pivot.find((s) => s.key === "rows");
                      if (!slot || !isAllowedInSlot(slot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      patchMapping({ detailsColumns: [col], xColumn: col });
                    }}
                    onClear={() => patchMapping({ detailsColumns: [] } as any)}
                  />

                  <BuildDropZone
                    label="Columns"
                    value={String((Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : [])[0] ?? "")}
                    onDrop={(f) => {
                      const slot = VIZ_SLOTS.pivot.find((s) => s.key === "columns");
                      if (!slot || !isAllowedInSlot(slot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      patchMapping({ details2Columns: [col], groupBy: col });
                    }}
                    onClear={() => patchMapping({ details2Columns: [] } as any)}
                  />

                  <BuildDropZone
                    label="Values"
                    value={String((Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [])[0]?.col ?? "")}
                    onDrop={(f) => {
                      const slot = VIZ_SLOTS.pivot.find((s) => s.key === "values");
                      if (!slot || !isAllowedInSlot(slot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      patchMapping({ yColumns: [{ col, agg: (f?.fieldType === "measure" ? "SUM" : "COUNT") as any }] });
                    }}
                    onClear={() => patchMapping({ yColumns: [] } as any)}
                  />
                </div>
              )}

              {vizType === "slicer" && (
                <BuildDropZone
                  label="Field"
                  value={String((activeChartData as any)?.slicer?.fieldRef ?? "")}
                  onDrop={(f) => {
                    const slot = VIZ_SLOTS.slicer.find((s) => s.key === "axis");
                    if (!slot || !isAllowedInSlot(slot, f)) {
                      rejectDrop();
                      return;
                    }
                    const ref = String(f?.ref ?? "").trim();
                    if (!ref || ref === "__time__") return;
                    window.dispatchEvent(
                      new CustomEvent("dashboard:update-chart-data", {
                        detail: {
                          chartId: activeChartId,
                          patch: {
                            kind: "slicer",
                            slicer: {
                              fieldRef: ref,
                              mode: String((activeChartData as any)?.slicer?.mode ?? "list").trim() || "list",
                              multiSelect: true,
                              selectedValues: Array.isArray((activeChartData as any)?.slicer?.selectedValues)
                                ? (activeChartData as any).slicer.selectedValues
                                : [],
                              dateOp: ((activeChartData as any)?.slicer?.dateOp === "between" || (activeChartData as any)?.slicer?.dateOp === "gte" || (activeChartData as any)?.slicer?.dateOp === "lte")
                                ? (activeChartData as any).slicer.dateOp
                                : "between",
                              dateFrom: String((activeChartData as any)?.slicer?.dateFrom ?? ""),
                              dateTo: String((activeChartData as any)?.slicer?.dateTo ?? ""),
                            },
                          },
                        },
                      })
                    );
                  }}
                  onClear={() => {
                    if (!activeChartId) return;
                    window.dispatchEvent(
                      new CustomEvent("dashboard:update-chart-data", {
                        detail: {
                          chartId: activeChartId,
                          patch: {
                            kind: "slicer",
                            slicer: {
                              fieldRef: "",
                              mode: String((activeChartData as any)?.slicer?.mode ?? "list").trim() || "list",
                              multiSelect: true,
                              selectedValues: [],
                              dateOp: ((activeChartData as any)?.slicer?.dateOp === "between" || (activeChartData as any)?.slicer?.dateOp === "gte" || (activeChartData as any)?.slicer?.dateOp === "lte")
                                ? (activeChartData as any).slicer.dateOp
                                : "between",
                              dateFrom: String((activeChartData as any)?.slicer?.dateFrom ?? ""),
                              dateTo: String((activeChartData as any)?.slicer?.dateTo ?? ""),
                            },
                          },
                        },
                      })
                    );
                  }}
                />
              )}

              {vizType === "pie" && (
                <div className="space-y-3">
                  <BuildDropZone
                    label="Category"
                    value={String(mapping?.groupBy ?? "")}
                    onDrop={(f) => {
                      const categorySlot = VIZ_SLOTS.pie.find((s) => s.key === "category");
                      if (!categorySlot || !isAllowedInSlot(categorySlot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      patchMapping({ groupBy: col });
                    }}
                    onClear={() => clearMappingKey("groupBy")}
                  />

                  <BuildDropZone
                    label="Values"
                    value=""
                    onDrop={(f) => {
                      const valuesSlot = VIZ_SLOTS.pie.find((s) => s.key === "values");
                      if (!valuesSlot || !isAllowedInSlot(valuesSlot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      patchMapping({ yColumns: [{ col, agg: (f?.fieldType === "measure" ? "SUM" : "COUNTD"), ...(f?.fieldType ? { fieldType: f.fieldType } : {}) }], y2Columns: [] });
                    }}
                    onClear={() => patchMapping({ yColumns: [] })}
                  />

                  {(Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : []).length > 0 && (
                    <div className="space-y-2">
                      {(Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : []).map((m: any, idx: number) => (
                        <div key={`pie_${idx}_${String(m?.col ?? "")}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-white truncate">{String(m?.col || "(empty)")}</div>
                            <select
                              value={String(m?.agg ?? "SUM")}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                                const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, agg: String(e.target.value) } : yy);
                                patchMapping({ yColumns: nextY });
                              }}
                              className="h-7 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 disabled:opacity-40"
                              title="Aggregation"
                            >
                              {(["SUM", "COUNT", "COUNTD", "AVG", "MIN", "MAX"] as const).map((a) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <BuildMultiDropZone
                    label="Tooltip"
                    values={Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : []}
                    onDrop={(f) => {
                      const ttSlot = VIZ_SLOTS.pie.find((s) => s.key === "tooltips");
                      if (!ttSlot || !isAllowedInSlot(ttSlot, f)) {
                        rejectDrop();
                        return;
                      }
                      const col = String(f?.ref ?? "").trim();
                      if (!col || col === "__time__") return;
                      addToMappingArray("tooltipColumns", col);
                    }}
                    onRemove={(idx) => {
                      const prevArr = Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : [];
                      patchMapping({ tooltipColumns: prevArr.filter((_: any, i: number) => i !== idx) });
                    }}
                    onClear={() => clearMappingArrayKey("tooltipColumns")}
                  />
                </div>
              )}

              {(vizType === "line" || vizType === "bar") && (
              <BuildDropZone
                label="Axis (X)"
                value={String(mapping?.xColumn ?? "")}
                onDrop={(f) => {
                  if (f.ref === "__time__") {
                    if (lastCalendarDrop && activeChartId) {
                      window.dispatchEvent(
                        new CustomEvent("dashboard:update-chart-data", {
                          detail: {
                            chartId: activeChartId,
                            patch: {
                              logicalQuery: {
                                time: {
                                  dimension: lastCalendarDrop.baseTimeRef,
                                  granularity: lastCalendarDrop.granularity,
                                },
                              },
                            },
                          },
                        })
                      );
                    }
                    return;
                  }
                  const axisSlot = VIZ_SLOTS[vizType].find((s) => s.key === "axis");
                  if (!axisSlot || !isAllowedInSlot(axisSlot, f)) {
                    rejectDrop();
                    return;
                  }
                  patchMapping({ xColumn: f.ref });
                }}
                onClear={() => clearMappingKey("xColumn")}
              />

              )}

              {(vizType === "line" || vizType === "bar") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                {(Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : []).length === 0 && (
                  <div className="text-xs text-slate-500">Drop measures here (multi-metric supported).</div>
                )}

                <BuildDropZone
                  label="Axis (Y)"
                  value=""
                  onDrop={(f) => {
                    const valuesSlot = VIZ_SLOTS[vizType].find((s) => s.key === "values");
                    if (!valuesSlot || !isAllowedInSlot(valuesSlot, f)) {
                      rejectDrop();
                      return;
                    }
                    const col = f.ref;
                    const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                    const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
                    const nextY2 = prevY2.filter((yy: any) => String(yy?.col ?? "") !== col);
                    const nextY = [...prevY.filter((yy: any) => String(yy?.col ?? "") !== col), { col, agg: (f?.fieldType === "measure" ? "SUM" : "COUNTD"), ...(f?.fieldType ? { fieldType: f.fieldType } : {}) }];
                    patchMapping({ yColumns: nextY, y2Columns: nextY2 });
                  }}
                  onClear={() => {
                    // no-op
                  }}
                />

                <div className="space-y-2">
                  {(Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : []).map((m: any, idx: number) => (
                    <div key={`${idx}_${String(m?.col ?? "")}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-white truncate">{String(m?.col || "(drop measure)")}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={String(m?.agg ?? "SUM")}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                              const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, agg: String(e.target.value) } : yy);
                              patchMapping({ yColumns: nextY });
                            }}
                            className="h-7 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 disabled:opacity-40"
                            title="Aggregation"
                          >
                            {(["SUM", "COUNT", "COUNTD", "AVG", "MIN", "MAX"] as const).map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => removeY(idx)}
                            className="p-1 rounded-lg hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Remove"
                          >
                            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <BuildDropZone
                          label="Measure"
                          compact
                          value={String(m?.col ?? "")}
                          onDrop={(f) => {
                            const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                            const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
                            const col = f.ref;
                            const nextY2 = prevY2.filter((yy: any) => String(yy?.col ?? "") !== col);
                            const nextY = prevY.map((yy: any, i: number) => i === idx
                              ? {
                                  ...yy,
                                  col,
                                  agg: (f?.fieldType === "measure" ? String((yy as any)?.agg ?? "SUM") : "COUNTD"),
                                  ...(f?.fieldType ? { fieldType: f.fieldType } : {}),
                                }
                              : yy);
                            patchMapping({ yColumns: nextY, y2Columns: nextY2 });
                          }}
                          onClear={() => {
                            const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                            const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, col: "" } : yy);
                            patchMapping({ yColumns: nextY });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              )}

              {(vizType === "line" || vizType === "bar") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                {(Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : []).length === 0 && (
                  <div className="text-xs text-slate-500">Drop measures here to enable secondary Y axis.</div>
                )}

                <BuildDropZone
                  label="Aux Axis (Y2)"
                  value=""
                  onDrop={(f) => {
                    const valuesSlot = VIZ_SLOTS[vizType].find((s) => s.key === "values");
                    if (!valuesSlot || !isAllowedInSlot(valuesSlot, f)) {
                      rejectDrop();
                      return;
                    }
                    const col = f.ref;
                    const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                    const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];

                    // mutually exclusive: remove from primary Y
                    const nextY = prevY.filter((yy: any) => String(yy?.col ?? "") !== col);
                    const nextY2 = [...prevY2.filter((yy: any) => String(yy?.col ?? "") !== col), { col, agg: (f?.fieldType === "measure" ? "SUM" : "COUNTD"), ...(f?.fieldType ? { fieldType: f.fieldType } : {}) }];
                    patchMapping({ yColumns: nextY, y2Columns: nextY2 });
                  }}
                  onClear={() => {
                    // no-op
                  }}
                />

                <div className="space-y-2">
                  {(Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : []).map((m: any, idx: number) => (
                    <div key={`y2_${idx}_${String(m?.col ?? "")}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-white truncate">{String(m?.col || "(drop measure)")}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={String(m?.agg ?? "SUM")}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
                              const nextY2 = prevY2.map((yy: any, i: number) => i === idx ? { ...yy, agg: String(e.target.value) } : yy);
                              patchMapping({ y2Columns: nextY2 });
                            }}
                            className="h-7 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 disabled:opacity-40"
                            title="Aggregation"
                          >
                            {(["SUM", "COUNT", "COUNTD", "AVG", "MIN", "MAX"] as const).map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => removeY2(idx)}
                            className="p-1 rounded-lg hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Remove"
                          >
                            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <BuildDropZone
                          label="Measure"
                          compact
                          value={String(m?.col ?? "")}
                          onDrop={(f) => {
                            const prevY = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
                            const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];

                            // mutually exclusive: remove from primary Y
                            const col = f.ref;
                            const nextY = prevY.filter((yy: any) => String(yy?.col ?? "") !== col);
                            const nextY2 = prevY2.map((yy: any, i: number) => i === idx
                              ? {
                                  ...yy,
                                  col,
                                  agg: (f?.fieldType === "measure" ? String((yy as any)?.agg ?? "SUM") : "COUNTD"),
                                  ...(f?.fieldType ? { fieldType: f.fieldType } : {}),
                                }
                              : yy);
                            patchMapping({ yColumns: nextY, y2Columns: nextY2 });
                          }}
                          onClear={() => {
                            const prevY2 = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
                            const nextY2 = prevY2.map((yy: any, i: number) => i === idx ? { ...yy, col: "" } : yy);
                            patchMapping({ y2Columns: nextY2 });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-slate-400">
                  Drop a measure into the well above to add it to Y2.
                </div>
              </div>

              )}

              {(vizType === "line" || vizType === "bar") && (
              <BuildDropZone
                label="Legend (group by)"
                value={String(mapping?.groupBy ?? "")}
                onDrop={(f) => {
                  if (f.ref === "__time__") return;
                  if (f.ref === "__measureNames__" || f.ref === "__measureValues__") {
                    patchMapping({ colorByMeasure: true, groupBy: "" });
                    return;
                  }
                  const legendSlot = VIZ_SLOTS[vizType].find((s) => s.key === "legend");
                  if (!legendSlot || !isAllowedInSlot(legendSlot, f)) {
                    rejectDrop();
                    return;
                  }
                  patchMapping({ groupBy: f.ref, colorByMeasure: false });
                }}
                onClear={() => patchMapping({ groupBy: "", colorByMeasure: false })}
              />

              )}

              {(vizType === "line" || vizType === "bar") &&
                (((Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns.length : 0)
                  + (Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns.length : 0)) > 1) && (
                <div className="text-[11px] text-slate-400 px-1">
                  Colors: <span className="text-slate-200 font-semibold">Measure Names (auto)</span>
                </div>
              )}

              {(vizType === "line" || vizType === "bar" || vizType === "area" || vizType === "pie" || vizType === "donut" || vizType === "table") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <BuildDropZone
                  label="Sort by"
                  value={String((Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [])[0]?.field ?? "")}
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    patchMapping({
                      orderBy: [{
                        field: f.ref,
                        dir: String((Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [])[0]?.dir ?? "asc").toLowerCase() === "desc" ? "desc" : "asc",
                      }],
                    } as any);
                  }}
                  onClear={() => patchMapping({ orderBy: [] } as any)}
                />

                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">Direction</div>
                  <button
                    type="button"
                    disabled={!canEdit || !String((Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [])[0]?.field ?? "").trim()}
                    onClick={() => {
                      const cur = (Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [])[0] ?? {};
                      const dir = String(cur?.dir ?? "asc").toLowerCase() === "desc" ? "asc" : "desc";
                      const field = String(cur?.field ?? "").trim();
                      if (!field) return;
                      patchMapping({ orderBy: [{ field, dir }] } as any);
                    }}
                    className="h-7 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Toggle sort direction"
                  >
                    {String((Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [])[0]?.dir ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC"}
                  </button>
                </div>
              </div>

              )}

              {(vizType === "line" || vizType === "bar" || vizType === "area") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Labels</div>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean((mapping as any)?.showLabels)}
                    disabled={!canEdit}
                    onChange={(e) => patchMapping({ showLabels: Boolean(e.target.checked) } as any)}
                    className="accent-emerald-400"
                  />
                  Show data labels
                </label>
              </div>

              )}

              {(vizType === "bar" || vizType === "area") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Stack Mode</div>
                <select
                  value={String((mapping as any)?.stackMode ?? "none")}
                  disabled={!canEdit}
                  onChange={(e) => patchMapping({ stackMode: String(e.target.value) } as any)}
                  className="h-8 w-full px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-40"
                >
                  <option value="none">None</option>
                  <option value="stacked">Stacked</option>
                  <option value="normalized">100% stacked</option>
                </select>
              </div>

              )}

              {(vizType === "line" || vizType === "bar" || vizType === "area") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">NULL values</div>
                <select
                  value={String((mapping as any)?.nullDisplay ?? "as_zero")}
                  disabled={!canEdit}
                  onChange={(e) => patchMapping({ nullDisplay: String(e.target.value) } as any)}
                  className="h-8 w-full px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-40"
                >
                  <option value="as_zero">As zero</option>
                  <option value="skip">Skip (gaps)</option>
                  <option value="interpolate">Interpolate</option>
                </select>
              </div>

              )}

              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Filters</div>
                <BuildDropZone
                  label="Add filter field"
                  value=""
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                    const next = [
                      ...prev,
                      {
                        field: f.ref,
                        operator: "eq",
                        values: [""],
                      },
                    ];
                    patchMapping({ filters: next } as any);
                  }}
                  onClear={() => {}}
                />

                {(Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : []).map((flt: any, idx: number) => (
                  <div key={`filter_${idx}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white truncate">{String(flt?.field ?? "(field)")}</div>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                          patchMapping({ filters: prev.filter((_: any, i: number) => i !== idx) } as any);
                        }}
                        className="p-1 rounded-lg hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Remove filter"
                      >
                        <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={String(flt?.operator ?? "eq")}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                          const next = prev.map((x: any, i: number) => i === idx ? { ...x, operator: String(e.target.value) } : x);
                          patchMapping({ filters: next } as any);
                        }}
                        className="h-8 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-40"
                      >
                        {[
                          "eq",
                          "neq",
                          "in",
                          "not_in",
                          "between",
                          "not_between",
                          "gt",
                          "gte",
                          "lt",
                          "lte",
                          "contains",
                          "icontains",
                          "notcontains",
                          "noticontains",
                          "startswith",
                          "istartswith",
                          "endswith",
                          "iendswith",
                          "isnull",
                          "isnotnull",
                        ].map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>

                      <input
                        value={Array.isArray(flt?.values) ? String(flt.values[0] ?? "") : String(flt?.value ?? "")}
                        disabled={!canEdit || String(flt?.operator ?? "").toLowerCase() === "isnull" || String(flt?.operator ?? "").toLowerCase() === "isnotnull"}
                        onChange={(e) => {
                          const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                          const next = prev.map((x: any, i: number) => i === idx ? { ...x, values: [String(e.target.value)] } : x);
                          patchMapping({ filters: next } as any);
                        }}
                        placeholder="Value"
                        className="h-8 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-40"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {(vizType === "line" || vizType === "bar") && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500">Legend / Tooltip / Details</div>

                <BuildMultiDropZone
                  label="Tooltip"
                  values={Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : []}
                  onDrop={(f) => {
                    const ttSlot = VIZ_SLOTS[vizType].find((s) => s.key === "tooltips");
                    if (!ttSlot || !isAllowedInSlot(ttSlot, f)) {
                      rejectDrop();
                      return;
                    }
                    if (f.ref === "__time__") return;
                    addToMappingArray("tooltipColumns", f.ref);
                  }}
                  onRemove={(idx) => {
                    const prevArr = Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : [];
                    patchMapping({ tooltipColumns: prevArr.filter((_: any, i: number) => i !== idx) });
                  }}
                  onClear={() => clearMappingArrayKey("tooltipColumns")}
                />

                <BuildMultiDropZone
                  label="Details"
                  values={Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : []}
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    addToMappingArray("detailsColumns", f.ref);
                  }}
                  onRemove={(idx) => {
                    const prevArr = Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : [];
                    const nextArr = prevArr.filter((_: any, i: number) => i !== idx);
                    patchMapping({ detailsColumns: nextArr });
                    patchLogicalQueryForTableColumns(nextArr);
                  }}
                  onClear={() => clearMappingArrayKey("detailsColumns")}
                />

                <BuildMultiDropZone
                  label="Drilldown"
                  values={Array.isArray((mapping as any)?.drilldownColumns) ? (mapping as any).drilldownColumns : []}
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    addToMappingArray("drilldownColumns", f.ref);
                  }}
                  onRemove={(idx) => {
                    const prevArr = Array.isArray((mapping as any)?.drilldownColumns) ? (mapping as any).drilldownColumns : [];
                    patchMapping({ drilldownColumns: prevArr.filter((_: any, i: number) => i !== idx) });
                  }}
                  onClear={() => clearMappingArrayKey("drilldownColumns")}
                />

                <BuildMultiDropZone
                  label="Details (2)"
                  values={Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : []}
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    addToMappingArray("details2Columns", f.ref);
                  }}
                  onRemove={(idx) => {
                    const prevArr = Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : [];
                    patchMapping({ details2Columns: prevArr.filter((_: any, i: number) => i !== idx) });
                  }}
                  onClear={() => clearMappingArrayKey("details2Columns")}
                />
              </div>

              )}

              <div className="pt-2 border-t border-white/10">
                <div className="text-xs text-slate-400">
                  Drag fields from <span className="text-slate-200 font-semibold">Fields</span> panel into these wells.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-300" />
                <div className="text-xs text-slate-400">
                  Use the Fields panel to browse and drag columns.
                </div>
              </div>
            </div>
            </>
            )}

            {activeChartId && activeTab === "format" && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-500">Format</div>
                {(vizType === "line" || vizType === "bar" || vizType === "area") && (
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean((mapping as any)?.showLabels)}
                      disabled={!canEdit}
                      onChange={(e) => patchMapping({ showLabels: Boolean(e.target.checked) } as any)}
                      className="accent-emerald-400"
                    />
                    Show data labels
                  </label>
                )}
                {(vizType === "bar" || vizType === "area") && (
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Stack mode</div>
                    <select
                      value={String((mapping as any)?.stackMode ?? "none")}
                      onChange={(e) => patchMapping({ stackMode: String(e.target.value) } as any)}
                      className="h-8 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
                    >
                      <option value="none">None</option>
                      <option value="stacked">Stacked</option>
                      <option value="normalized">100% stacked</option>
                    </select>
                  </div>
                )}
                {(vizType === "line" || vizType === "bar" || vizType === "area") && (
                  <div>
                    <div className="text-xs text-slate-400 mb-1">NULL values</div>
                    <select
                      value={String((mapping as any)?.nullDisplay ?? "as_zero")}
                      onChange={(e) => patchMapping({ nullDisplay: String(e.target.value) } as any)}
                      className="h-8 w-full px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
                    >
                      <option value="as_zero">As zero</option>
                      <option value="skip">Skip (gaps)</option>
                      <option value="interpolate">Interpolate</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {activeChartId && activeTab === "filters" && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-slate-500">Visual filters</div>
                <BuildDropZone
                  label="Add filter field"
                  value=""
                  onDrop={(f) => {
                    if (f.ref === "__time__") return;
                    const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                    patchMapping({
                      filters: [...prev, { field: f.ref, operator: "eq", values: [""] }],
                    } as any);
                  }}
                  onClear={() => {}}
                />
                {Array.isArray((mapping as any)?.filters) && (mapping as any).filters.length > 0 ? (
                  (mapping as any).filters.map((flt: any, idx: number) => (
                    <div key={`flt_${idx}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-white truncate">{String(flt?.field ?? "(field)")}</div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm("Remove this filter?")) return;
                            const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                            patchMapping({ filters: prev.filter((_: any, i: number) => i !== idx) } as any);
                          }}
                          className="p-1 rounded-lg hover:bg-white/10"
                        >
                          <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
                        </button>
                      </div>
                      <input
                        value={Array.isArray(flt?.values) ? String(flt.values[0] ?? "") : ""}
                        onChange={(e) => {
                          const prev = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
                          const next = prev.map((x: any, i: number) => i === idx ? { ...x, values: [String(e.target.value)] } : x);
                          patchMapping({ filters: next } as any);
                        }}
                        placeholder="Value"
                        className="h-8 w-full px-2 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">No visual filters for this chart.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
