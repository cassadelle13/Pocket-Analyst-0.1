"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Card, Title, Metric, Text, TableRow, TableHeaderCell, TableCell } from "@tremor/react";
import EChartsBaseChart from "../charts/BaseChart";
import { VirtualizedTable } from "../ui/VirtualizedTable";
import { useGlobalFilters } from "../../store/globalFiltersContext";
import { useBiFilters } from "../../store/biFiltersContext";
import { useSearchParams } from "next/navigation";
import { RealTimeMetrics } from "../charts/RealTimeMetrics";
import { useTheme } from '@/context/ThemeContext';
import { useRole } from "../../providers";
import { toTimeSeries, toCategorical, toPieData, toEChartsXY, toKpiValue, toScatterPoints, toTreemapData, toHeatmapData, toHistogramBins, analyzeColumns } from "./dbDataAdapter";
import { ColumnMappingPanel, type ColumnMapping, type ColumnMeta } from "./ColumnMappingPanel";
import { buildDbChartOption, detectColType, injectTemplateVars, pickAxes, resolveVizType, type VizType as BuilderVizType } from "./dbChartBuilder";
import { applyChartConfigToEChartsOption, extractCreativeContainerStyles } from "../../lib/applyChartConfig";
import ChartGlowWrapper from "./ChartGlowWrapper";
import { buildSemanticGlobalContext, buildSemanticRequestContext } from "../../lib/semantic/requestContext";
import { buildAutoSemanticQueryPayload } from "../../lib/semantic/autoSemanticModel";
import { buildExprContextForPipelineStep, canCompileAstToSql, extractDepsFromAst, getEditorDiagnostics, parseUiFormulaToAst, resolveTypedDeps, resolveUsedComputeClosure } from "../../lib/semantic/expressionEngine";
import { getExprEngineRolloutMode } from "../../lib/semantic/exprRollout";
import { SlicerVisual } from "./SlicerVisual";
import { CohortAnalysisChart } from "./RetentionMatrix";
import { DrillBreadcrumbControls } from "./DrillBreadcrumbControls";
import { detectTableColumnType, formatCellValue } from "../../lib/formatters";
import type { PivotResult } from "../../lib/semantic/retentionResult";
import type { PivotWorkerResponse } from "../../workers/retention.worker";
import { computePivotResultSync } from "../../lib/semantic/pivotClientCompute";

// Динамические импорты оригинальных компонентов
const UPlotTrendModule = dynamic(() => import("../analytics/UPlotTrendModule"), { ssr: false });
const BarChartModule = dynamic(() => import("../analytics/BarChartModule"), { ssr: false });
const PulseGlobe = dynamic(() => import("../home/PulseGlobe"), { ssr: false });
const UserConstellation = dynamic(() => import("../users/UserConstellation"), { ssr: false });


interface ChartPreviewProps {
  chartName: string;
  chartType: string;
  width?: number;
  height?: number;
  chartId?: string;
  groupId?: string;
  chartData?: any;
  isEditMode?: boolean;
  onCellEdit?: (colIdx: number, rowIdx: number, value: string) => void;
}

function stableHash01(input: string): number {
  const s = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return (u % 10_000) / 10_000;
}

const mockBarListData = [
  { name: "page_view", value: 3420 },
  { name: "click", value: 2156 },
  { name: "form_submit", value: 892 },
  { name: "download", value: 445 },
];

function uniqStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const res: string[] = [];
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (!res.includes(s)) res.push(s);
  }
  return res;
}

export const ChartPreview = memo(function ChartPreview({ chartName, chartType, width = 560, height = 360, chartId, groupId, chartData, isEditMode, onCellEdit }: ChartPreviewProps) {
  const { propertyFilters, addPropertyFilter, removePropertyFilter, dateRange } = useGlobalFilters();
  const { filters: biFilters, version: biFilterVersion, pageScopeMode } = useBiFilters();
  const { theme } = useTheme();
  const { role } = useRole();
  const searchParams = useSearchParams();
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [semanticArtifacts, setSemanticArtifacts] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const next = detail?.semanticArtifacts;
      if (!next || typeof next !== "object") return;
      setSemanticArtifacts(next);
    };
    window.addEventListener("dashboard:semantic-artifacts", handler as EventListener);
    return () => window.removeEventListener("dashboard:semantic-artifacts", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const tid = detail?.activeTabId ? String(detail.activeTabId) : null;
      setActiveTabId(tid);
    };
    window.addEventListener("dashboard:active-chart-id", handler as EventListener);
    return () => window.removeEventListener("dashboard:active-chart-id", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const tid = detail?.activeTabId ? String(detail.activeTabId) : null;
      setActiveTabId(tid);
    };
    window.addEventListener("dashboard:active-tab-id", handler as EventListener);
    return () => window.removeEventListener("dashboard:active-tab-id", handler as EventListener);
  }, []);

  const effectivePageKey = useMemo(() => {
    return pageScopeMode === "tab" ? (activeTabId ? String(activeTabId) : "tab:unknown") : "dashboard";
  }, [pageScopeMode, activeTabId]);
  const drillCols = useMemo(() => {
    const mapping = (chartData as any)?.columnMapping;
    return Array.isArray(mapping?.drilldownColumns)
      ? mapping.drilldownColumns.map((c: any) => String(c ?? "").trim()).filter(Boolean)
      : [];
  }, [chartData]);
  const drillLevel = useMemo(() => {
    const raw = Number((chartData as any)?.__drillLevel ?? -1);
    return Number.isFinite(raw) ? raw : -1;
  }, [chartData]);
  const applyChartPatch = useCallback((patch: Record<string, unknown>) => {
    if (!chartId) return;
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: { chartId, patch },
        })
      );
    } catch {}
  }, [chartId]);
  const handleDrillDown = useCallback(() => {
    if (!chartData || typeof chartData !== "object") return;
    if (drillCols.length === 0) return;
    const next = drillLevel + 1;
    if (next >= drillCols.length) return;
    applyChartPatch({ __drillLevel: next });
  }, [applyChartPatch, chartData, drillCols.length, drillLevel]);
  const handleDrillUp = useCallback(() => {
    if (!chartData || typeof chartData !== "object") return;
    if (drillCols.length === 0) return;
    const prev = drillLevel - 1;
    applyChartPatch({ __drillLevel: prev });
  }, [applyChartPatch, chartData, drillCols.length, drillLevel]);
  const [apiLineData, setApiLineData] = useState<Array<{ ts: number; v: number }> | null>(null);
  const [apiBarCatData, setApiBarCatData] = useState<Array<{ category: string; value: number }> | null>(null);
  const [tableSort, setTableSort] = useState<{ key: 'name' | 'value' | 'trend'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
  const [dbTableData, setDbTableData] = useState<{ columns: string[]; rows: unknown[][]; rowCount?: number } | null>(null);
  const [dbTableLoading, setDbTableLoading] = useState(false);
  const [dbTableError, setDbTableError] = useState<string | null>(null);
  const [semanticTableSort, setSemanticTableSort] = useState<{ column: number; dir: "asc" | "desc" } | null>(null);

  const exprEngineRolloutMode = useMemo(() => getExprEngineRolloutMode(), []);

  const pivotConfig = useMemo(() => {
    const p = (chartData as any)?.pivot;
    if (!p || typeof p !== "object") return null;
    const cohort = (p as any).cohort;
    if (cohort && typeof cohort === "object" && (cohort as any).enabled === true) return cohort;
    return null;
  }, [chartData]);

  const [pivotResult, setPivotResult] = useState<PivotResult | null>(null);
  const [pivotError, setPivotError] = useState<string | null>(null);

  useEffect(() => {
    if (chartData?.kind !== "db-table") return;
    const connectionId = String(chartData?.connectionId ?? "");
    const tableKey = String(chartData?.tableKey ?? "");
    if (!connectionId || !tableKey) return;

    const explicitSemanticModelId = typeof (chartData as any)?.semanticModelId === "string" ? String((chartData as any).semanticModelId) : "";
    const semanticModelId = String(explicitSemanticModelId || "").trim();
    const logicalQuery = ((chartData as any)?.logicalQuery && typeof (chartData as any).logicalQuery === "object") ? (chartData as any).logicalQuery : null;

    if (exprEngineRolloutMode === "on") {
      try {
        const semanticModelV1 = (semanticArtifacts as any)?.semanticModelV1 ?? null;
        const sourceModel = String((logicalQuery as any)?.sourceModel ?? "").trim();
        const pipelineSteps = Array.isArray((logicalQuery as any)?.pipeline?.steps) ? (logicalQuery as any).pipeline.steps : [];
        const computeSteps = pipelineSteps.filter((s: any) => String(s?.kind ?? "") === "compute");

        for (const s of computeSteps) {
          const stepId = String(s?.id ?? "");
          if (!stepId) continue;
          const ui = String(s?.uiFormula ?? s?.formula ?? "");
          if (!ui.trim()) continue;

          const ctx = buildExprContextForPipelineStep({
            semanticModelV1,
            sourceModel,
            dialect: "postgres",
            mode: "legacy-calc-expr",
            steps: pipelineSteps.map((x: any) => ({ id: String(x?.id ?? ""), kind: String(x?.kind ?? ""), outputId: String(x?.outputId ?? "") })),
            stepId,
          });

          const errors = getEditorDiagnostics({ formula: ui, ctx });
          if ((errors?.length ?? 0) > 0) {
            // Stage A: diagnostics only (no behavior change)
            // eslint-disable-next-line no-console
            console.warn("[expr-engine] compute formula diagnostics", { stepId, errors });
          }
        }
      } catch {
        // Never break chart rendering due to diagnostics.
      }
    }

    const analyzeComputeDepsWithEngine = (params: { stepId: string; uiFormula: string; availableComputeIds: Set<string>; computeId?: string }) => {
      const semanticModelV1 = (semanticArtifacts as any)?.semanticModelV1 ?? null;
      const sourceModel = String((logicalQuery as any)?.sourceModel ?? "").trim();
      const pipelineSteps = Array.isArray((logicalQuery as any)?.pipeline?.steps) ? (logicalQuery as any).pipeline.steps : [];
      const ctx = buildExprContextForPipelineStep({
        semanticModelV1,
        sourceModel,
        dialect: "postgres",
        mode: "legacy-calc-expr",
        steps: pipelineSteps.map((x: any) => ({ id: String(x?.id ?? ""), kind: String(x?.kind ?? ""), outputId: String(x?.outputId ?? "") })),
        stepId: params.stepId || String(params.computeId ?? ""),
      });
      const analysisErrors = getEditorDiagnostics({ formula: params.uiFormula, ctx });
      const ast = parseUiFormulaToAst(params.uiFormula);
      const deps = resolveTypedDeps({ deps: extractDepsFromAst(ast as any), availableComputeIds: params.availableComputeIds });
      const isSql = canCompileAstToSql(ast as any, "postgres") && (analysisErrors?.length ?? 0) === 0;
      return { deps, isSql };
    };

     const mapping = (chartData?.columnMapping ?? null) as ColumnMapping | null;
     const drillLevelRaw = Number((chartData as any)?.__drillLevel ?? -1);
     const drillLevel = Number.isFinite(drillLevelRaw) ? drillLevelRaw : -1;
     const drillCols = Array.isArray((mapping as any)?.drilldownColumns) ? (mapping as any).drilldownColumns : [];
     const drillCol = (drillLevel >= 0 && drillLevel < drillCols.length) ? String(drillCols[drillLevel] ?? "").trim() : "";

     const effectiveMapping = (() => {
       if (!mapping || !drillCol) return mapping;
       const originalGroupBy = String((mapping as any)?.groupBy ?? "").trim();
       const details2Columns = Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : [];
       return {
         ...(mapping as any),
         groupBy: drillCol,
         details2Columns: [
           ...details2Columns,
           ...(originalGroupBy ? [originalGroupBy] : []),
         ],
       } as any;
     })();
     const cfgVizType = String((chartData as any)?.chartConfig?.general?.vizType ?? "").trim().toLowerCase();
    const legacyForcedViz = String((chartData as any)?.__forceVizType ?? "").trim().toLowerCase();
    const forcedViz = cfgVizType || legacyForcedViz;
    const customSql = String((chartData as any)?.customSql ?? "").trim();
    const vizType = (forcedViz === "line" || forcedViz === "bar" || forcedViz === "table" || forcedViz === "pivot" || forcedViz === "area" || forcedViz === "pie" || forcedViz === "donut" || forcedViz === "scatter" || forcedViz === "treemap" || forcedViz === "histogram" || forcedViz === "kpi")
     ? (forcedViz as any)
     : resolveVizType(chartName);
    const hasColumnsMeta = Array.isArray((chartData as any)?.columnsMeta) && ((chartData as any).columnsMeta.length ?? 0) > 0;
    const showMapping = (chartData as any)?.__showColumnMapping === true || (vizType !== "table" && !mapping);
    const getValidationError = (v: string, m: any): string | null => {
      const viz = String(v ?? "").trim().toLowerCase();
      if (customSql) return null;
      if (viz === "kpi") return null;

      const mm = (m && typeof m === "object") ? m : null;
      if (!mm) return "Configure chart fields in the Visualizations pane.";

      if (viz === "table") {
        const details = Array.isArray((mm as any)?.detailsColumns) ? (mm as any).detailsColumns : [];
        const ok = details.some((c: any) => !!String(c ?? "").trim());
        return ok ? null : "Table requires at least one column in Columns.";
      }

      if (viz === "pie") {
        const cat = String((mm as any)?.groupBy ?? "").trim();
        const y0 = String((Array.isArray((mm as any)?.yColumns) ? (mm as any).yColumns : [])?.[0]?.col ?? "").trim();
        if (!cat) return "Pie requires Category.";
        if (!y0) return "Pie requires a measure in Values.";
        return null;
      }

      if (viz === "pivot") {
        const row = String((mm as any)?.detailsColumns?.[0] ?? "").trim();
        const col = String((mm as any)?.details2Columns?.[0] ?? "").trim();
        const val = String((Array.isArray((mm as any)?.yColumns) ? (mm as any).yColumns : [])?.[0]?.col ?? "").trim();
        if (!row) return "Pivot requires Rows field.";
        if (!col) return "Pivot requires Columns field.";
        if (!val) return "Pivot requires a measure in Values.";
        return null;
      }

      const x = String((mm as any)?.xColumn ?? "").trim();
      const yArr = Array.isArray((mm as any)?.yColumns) ? (mm as any).yColumns : [];
      const y2Arr = Array.isArray((mm as any)?.y2Columns) ? (mm as any).y2Columns : [];
      const yOk = yArr.some((yy: any) => !!String(yy?.col ?? "").trim()) || y2Arr.some((yy: any) => !!String(yy?.col ?? "").trim());
      if (!x) return "Chart requires Axis (X).";
      if (!yOk) return "Chart requires at least one measure in Axis (Y).";
      return null;
    };

    const validationErr = getValidationError(String(vizType ?? ""), effectiveMapping);
    if (validationErr && (hasColumnsMeta || effectiveMapping)) {
      setDbTableData(null);
      setDbTableLoading(false);
      setDbTableError(validationErr);
      return;
    }

    let aborted = false;

    const scopedDirectBiFilters = (() => {
      const arr = Array.isArray(biFilters) ? biFilters : [];
      return arr.filter((f: any) => {
        const scope = (f?.scope === "report" || f?.scope === "page" || f?.scope === "visual") ? f.scope : "visual";
        if (scope === "report") return true;
        if (scope === "page") {
          const fk = String(f?.pageKey ?? "").trim();
          return !!effectivePageKey && fk === effectivePageKey;
        }
        const src = String(f?.sourceChartId ?? "").trim();
        return !!chartId && src === String(chartId);
      });
    })();

    const load = async () => {
      setDbTableLoading(true);
      setDbTableError(null);
      try {
        if (customSql) {
          if (!connectionId) {
            throw new Error("Direct SQL requires connectionId.");
          }
          const injectedSql = injectTemplateVars(customSql, {
            start: dateRange?.start,
            end: dateRange?.end,
          });
          const sqlRes = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              connectionId,
              sql: injectedSql,
              role: (() => {
                if (role === "data-admin") return "admin";
                if (role === "business") return "business";
                return "user";
              })(),
              maxRows: 5000,
            }),
            cache: "no-store",
          });
          const sqlJson = await sqlRes.json().catch(() => ({}));
          if (!sqlRes.ok) {
            throw new Error(String(sqlJson?.error ?? "SQL query failed"));
          }

          const sqlPayload = sqlJson?.data ?? sqlJson;
          const sqlColumns = Array.isArray(sqlPayload?.columns)
            ? sqlPayload.columns.map((c: any) => String(c))
            : [];
          const sqlRows = Array.isArray(sqlPayload?.rows) ? sqlPayload.rows : [];

          const ordered = (() => {
            if (String(vizType ?? "").toLowerCase() !== "table") {
              return { columns: sqlColumns, rows: sqlRows };
            }
            const detailsCols = Array.isArray((effectiveMapping as any)?.detailsColumns)
              ? (effectiveMapping as any).detailsColumns.map((c: any) => String(c ?? "").trim()).filter(Boolean)
              : [];
            if (detailsCols.length === 0 || sqlColumns.length === 0) {
              return { columns: sqlColumns, rows: sqlRows };
            }

            const indexByCol = new Map<string, number>();
            for (let i = 0; i < sqlColumns.length; i += 1) {
              indexByCol.set(String(sqlColumns[i] ?? ""), i);
            }
            const orderedCols = detailsCols.filter((c: string) => indexByCol.has(c));
            if (orderedCols.length === 0) {
              return { columns: sqlColumns, rows: sqlRows };
            }

            const orderedRows = sqlRows.map((row: any) => {
              const arr = Array.isArray(row) ? row : [];
              return orderedCols.map((col: string) => arr[indexByCol.get(col) ?? -1]);
            });
            return { columns: orderedCols, rows: orderedRows };
          })();

          if (!aborted) {
            setDbTableData({ columns: ordered.columns, rows: ordered.rows });
          }
          return;
        }

        const useSemantic = !!semanticModelId
          && !!logicalQuery
          && !!String((logicalQuery as any)?.sourceModel ?? "").trim();

        const rawRetentionMode = Boolean((pivotConfig as any)?.rawMode);
        const rawRetentionConnectionId = String((pivotConfig as any)?.rawConnectionId ?? connectionId).trim();
        const rawRetentionTableKey = String((pivotConfig as any)?.rawTableKey ?? tableKey).trim();

        if (useSemantic && effectiveMapping) {
          // Single source of truth: Visualizations panel owns logicalQuery in semantic mode.
          // ChartPreview should consume logicalQuery, not rebuild and overwrite it.
        }
        let semanticModelForRequest: any = null;
        let semanticModelIdForRequest = semanticModelId;
        let logicalQueryForRequest: any = logicalQuery;
        let sourceBindingsForRequest: Record<string, { connectionId: string; tableKey: string; connectionType?: string }> | undefined;

        if (!useSemantic) {
          if (!connectionId || !tableKey) {
            throw new Error("This visual requires connectionId and tableKey.");
          }
          if (!effectiveMapping) {
            throw new Error("This visual requires a column mapping.");
          }

          const auto = buildAutoSemanticQueryPayload({
            tableKey: rawRetentionMode && rawRetentionTableKey ? rawRetentionTableKey : tableKey,
            connectionId: rawRetentionMode && rawRetentionConnectionId ? rawRetentionConnectionId : connectionId,
            connectionType: String(chartData?.connectionType ?? ""),
            columnsMeta: Array.isArray((chartData as any)?.columnsMeta) ? (chartData as any).columnsMeta : [],
            mapping: {
              ...(effectiveMapping as any),
              filters: scopedDirectBiFilters.map((f: any) => ({
                field: String(f?.field ?? ""),
                operator: String(f?.op ?? "eq"),
                values: Array.isArray(f?.values) ? f.values : [],
              })),
            },
            vizType,
            pivotConfig,
            prevLogicalQuery: logicalQuery,
          });

          semanticModelForRequest = auto.semanticModel;
          logicalQueryForRequest = auto.logicalQuery;
          sourceBindingsForRequest = auto.sourceBindings;
          semanticModelIdForRequest = "";
        }

        const dbgGlobalContextBase = buildSemanticGlobalContext(biFilters, {
          dateRange: {
            start: dateRange?.start,
            end: dateRange?.end,
          },
        });
        const dbgParams = (() => {
          const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
          const selections = a && a.parameterSelections && typeof a.parameterSelections === "object" ? a.parameterSelections : null;
          if (!selections) return undefined;
          const out: Record<string, any> = {};
          for (const k of Object.keys(selections)) {
            const sel = (selections as any)[k];
            const values = Array.isArray(sel?.values) ? sel.values : [];
            const single = values.length === 1 ? values[0] : null;
            out[String(k).toLowerCase()] = single;
          }
          out.viewerRole = role;
          try {
            const uid = window.localStorage.getItem("dashboard:user:id");
            if (uid) out.viewerId = uid;
          } catch {}
          return out;
        })();
        const derivedMetrics = (() => {
          const cd = (chartData && typeof chartData === "object") ? (chartData as any) : null;
          const pipeline = cd?.pipeline && typeof cd.pipeline === "object" ? cd.pipeline : null;
          const steps = pipeline && Number(pipeline.version) === 1 && Array.isArray(pipeline.steps) ? pipeline.steps : [];
          const fromPipeline = steps
            .filter((s: any) => s && typeof s === "object" && s.kind === "compute")
            .map((s: any) => ({
              id: String(s.outputId ?? "").trim(),
              formula: String(s.formula ?? "").trim(),
              uiFormula: String(s.uiFormula ?? "").trim(),
              meta: s.meta,
            }))
            .filter((m: any) => !!m.id);
          if (fromPipeline.length) return fromPipeline;

          const arr = (cd && Array.isArray(cd.derivedMetrics)) ? cd.derivedMetrics : [];
          return arr.filter((m: any) => m && typeof m === "object");
        })();
        const ephemeralCalculatedMeasures = (() => {
          if (!logicalQuery || typeof logicalQuery !== "object") return null;

          const computeById: Record<string, any> = {};
          for (const m of derivedMetrics) {
            const id = String((m as any)?.id ?? "").trim();
            if (!id) continue;
            computeById[id] = m;
          }

          const extractMetricId = (ref: string): string => {
            const s = String(ref ?? "").trim();
            if (!s) return "";
            const parts = s.split(".");
            return String(parts[parts.length - 1] ?? "").trim();
          };

          const measures = Array.isArray((logicalQuery as any)?.measures) ? (logicalQuery as any).measures : [];

          const pipelineSteps = (() => {
            const cd = (chartData && typeof chartData === "object") ? (chartData as any) : null;
            const pipeline = cd?.pipeline && typeof cd.pipeline === "object" ? cd.pipeline : null;
            const steps = pipeline && Number(pipeline.version) === 1 && Array.isArray(pipeline.steps) ? pipeline.steps : [];
            return steps;
          })();

          const computeStepIdByOutputId = (() => {
            const map: Record<string, string> = {};
            for (const s of pipelineSteps) {
              if (!s || typeof s !== "object") continue;
              if (String((s as any).kind ?? "") !== "compute") continue;
              const outputId = String((s as any).outputId ?? "").trim();
              const stepId = String((s as any).id ?? "").trim();
              if (!outputId || !stepId) continue;
              map[outputId] = stepId;
            }
            return map;
          })();

          const rootIds: string[] = Array.from(new Set(measures
            .map((r: any) => extractMetricId(r))
            .filter((id: string) => !!id && Object.prototype.hasOwnProperty.call(computeById, id))
          ));

          // Build deps for closure resolution (A -> B -> C).
          const availableComputeIds = new Set(Object.keys(computeById));
          const depsById: Record<string, any[]> = {};
          for (const id of Object.keys(computeById)) {
            const dm = computeById[id];
            const ui = String((dm as any)?.uiFormula ?? (dm as any)?.formula ?? "");
            if (exprEngineRolloutMode === "on") {
              try {
                const stepId = String(computeStepIdByOutputId[id] ?? "");
                const res = analyzeComputeDepsWithEngine({ stepId, computeId: id, uiFormula: ui, availableComputeIds });
                depsById[id] = res.deps;
              } catch {
                depsById[id] = [];
              }
            } else {
              try {
                const ast = parseUiFormulaToAst(ui);
                const deps0 = extractDepsFromAst(ast);
                const deps = resolveTypedDeps({ deps: deps0, availableComputeIds });
                depsById[id] = deps;
              } catch {
                depsById[id] = [];
              }
            }
          }

          const closureIds = resolveUsedComputeClosure({
            rootIds,
            computeById: Object.fromEntries(Object.entries(computeById).map(([k]) => [k, { meta: { deps: depsById[k] } }])) as any,
          });

          const sqlComputes = closureIds.filter((id: string) => {
            const dm = computeById[id];
            if (!dm) return false;
            const sql = String((dm as any)?.formula ?? "").trim();
            if (!sql) return false;
            if (exprEngineRolloutMode === "on") {
              try {
                const uiFormula = String((dm as any)?.uiFormula ?? sql);
                const stepId = String(computeStepIdByOutputId[id] ?? "");
                const res = analyzeComputeDepsWithEngine({ stepId, computeId: id, uiFormula, availableComputeIds });
                return res.isSql;
              } catch {
                return false;
              }
            } else {
              try {
                const ast = parseUiFormulaToAst(String((dm as any)?.uiFormula ?? sql));
                return canCompileAstToSql(ast, "postgres");
              } catch {
                // If we cannot parse it, treat it as non-sql so that it doesn't poison injection.
                return false;
              }
            }
          });

          if (process.env.NODE_ENV !== "production") {
            try {
              // eslint-disable-next-line no-console
              console.debug("[computed-injection]", {
                rootIds,
                closureIds,
                sqlComputes,
                missingSql: closureIds.filter((id: string) => !sqlComputes.includes(id)),
              });
            } catch {}
          }

          const out: Record<string, { sql: string }> = {};
          for (const id of sqlComputes) {
            const dm = computeById[id];
            const sql = String((dm as any)?.formula ?? "").trim();
            if (!sql) continue;
            out[id] = { sql };
          }

          const userCalcRaw = (chartData as any)?.userCalculatedMeasures;
          const userEntries = Array.isArray(userCalcRaw)
            ? userCalcRaw
            : (userCalcRaw && typeof userCalcRaw === "object" ? Object.entries(userCalcRaw).map(([id, v]) => ({ id, ...(v as any) })) : []);
          for (const uc of userEntries as any[]) {
            const id = String((uc as any)?.id ?? "").trim();
            const sql = String((uc as any)?.sql ?? "").trim();
            if (!id || !sql) continue;
            out[id] = { sql };
          }

          return Object.keys(out).length ? out : null;
        })();

        const dbgGlobalContext = {
          ...(dbgGlobalContextBase as any),
          params: dbgParams,
        };
        const dbgRequestContext = buildSemanticRequestContext({
          chartId,
          pageKey: effectivePageKey,
        });
        if (process.env.NODE_ENV !== "production") {
          try {
            // eslint-disable-next-line no-console
            console.log("[semantic/query]", {
              chartId,
              pageKey: effectivePageKey,
              filters: Array.isArray((dbgGlobalContext as any)?.filters) ? (dbgGlobalContext as any).filters.length : 0,
              report: (Array.isArray((dbgGlobalContext as any)?.filters) ? (dbgGlobalContext as any).filters : []).filter((f: any) => (f?.scope ?? "visual") === "report").length,
              page: (Array.isArray((dbgGlobalContext as any)?.filters) ? (dbgGlobalContext as any).filters : []).filter((f: any) => (f?.scope ?? "visual") === "page").length,
              visual: (Array.isArray((dbgGlobalContext as any)?.filters) ? (dbgGlobalContext as any).filters : []).filter((f: any) => (f?.scope ?? "visual") === "visual").length,
              requestContext: dbgRequestContext,
              semanticModelId,
            });
          } catch {}
        }

        const res = await fetch("/api/semantic/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            {
              projectId: (() => {
                const urlPid = searchParams.get("project");
                if (urlPid) return urlPid;
                try {
                  return window.localStorage.getItem("dashboard:semantic:projectId") || "";
                } catch {
                  return "";
                }
              })(),
              query: {
                ...(logicalQueryForRequest as any),
                vizType,
              },
              ...(semanticModelForRequest ? { semanticModel: semanticModelForRequest } : {}),
              ...(sourceBindingsForRequest ? { sourceBindings: sourceBindingsForRequest } : {}),
              ...(semanticModelIdForRequest ? { semanticModelId: semanticModelIdForRequest } : {}),
              ...(ephemeralCalculatedMeasures ? { ephemeralCalculatedMeasures } : {}),
              globalContext: dbgGlobalContext,
              requestContext: dbgRequestContext,
              role: (() => {
                if (role === "data-admin") return "admin";
                if (role === "business") return "business";
                return "user";
              })(),
              maxRows: 500,
              page: Number((chartData as any)?.pagination?.page ?? 1) || 1,
              pageSize: Number((chartData as any)?.pagination?.pageSize ?? (logicalQueryForRequest as any)?.limit ?? 500) || 500,
            },
            null,
            2
          ),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load table");
        }

        const payload = (json?.data && typeof json.data === "object" && (json.data as any)?.data && typeof (json.data as any).data === "object")
          ? (json.data as any).data
          : (json?.data ?? {});
        const columns = Array.isArray(payload?.columns) ? payload.columns.map((c: any) => String(c)) : [];
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        const rowCount = typeof payload?.rowCount === "number" ? payload.rowCount : undefined;

        if (!aborted) {
          setDbTableData({ columns, rows, rowCount });
        }
      } catch (e: any) {
        if (!aborted) {
          setDbTableData(null);
          setDbTableError(e instanceof Error ? e.message : "Failed to load table");
        }
      } finally {
        if (!aborted) setDbTableLoading(false);
      }
    };

    load();

    return () => {
      aborted = true;
    };
  }, [
    chartName,
    role,
    chartId,
    effectivePageKey,
    biFilterVersion,
    pivotConfig,
    String(chartData?.kind ?? ""),
    String(chartData?.connectionId ?? ""),
    String(chartData?.tableKey ?? ""),
    String(chartData?.connectionType ?? ""),
    String((chartData as any)?.customSql ?? ""),
    String((chartData as any)?.__sqlRunNonce ?? ""),
    String((chartData as any)?.semanticModelId ?? ""),
    JSON.stringify((chartData as any)?.logicalQuery ?? null),
    JSON.stringify((chartData as any)?.columnMapping ?? null),
    JSON.stringify((chartData as any)?.pipeline ?? null),
    String(dateRange?.start instanceof Date ? dateRange.start.toISOString() : dateRange?.start ?? ""),
    String(dateRange?.end instanceof Date ? dateRange.end.toISOString() : dateRange?.end ?? ""),
    semanticArtifacts,
  ]);

  useEffect(() => {
    if (!pivotConfig) {
      setPivotResult(null);
      setPivotError(null);
      return;
    }
    if (!dbTableData || !Array.isArray(dbTableData.columns) || !Array.isArray(dbTableData.rows)) {
      setPivotResult(null);
      return;
    }

    let cancelled = false;
    const taskId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const worker = new Worker(new URL("../../workers/retention.worker.ts", import.meta.url), { type: "module" });

    const cohortField = String((pivotConfig as any)?.cohortField ?? "").trim();
    const activityField = String((pivotConfig as any)?.activityField ?? "").trim();
    const userField = String((pivotConfig as any)?.userField ?? "").trim();
    const usersField = String((pivotConfig as any)?.usersField ?? "").trim();
    const unit = String((pivotConfig as any)?.unit ?? (pivotConfig as any)?.period ?? "day").trim() || "day";

    const periodsRaw = (pivotConfig as any)?.periods;
    const requestedPeriods: number[] = Array.isArray(periodsRaw) && periodsRaw.length > 0
      ? periodsRaw.map((p: any) => Number(p)).filter((n: any) => Number.isFinite(n) && n >= 0)
      : [];
    const maxRowsCfg = Number((pivotConfig as any)?.maxRows ?? 50_000);
    const maxRows = Number.isFinite(maxRowsCfg)
      ? Math.max(1, Math.min(200_000, Math.trunc(maxRowsCfg)))
      : 50_000;

    const runSyncFallback = (reason: string) => {
      try {
        const payload = computePivotResultSync({
          rows: dbTableData.rows,
          columns: dbTableData.columns,
          cohortField,
          activityField,
          ...(userField ? { userField } : {}),
          ...(usersField ? { usersField } : {}),
          unit: (String(unit).toLowerCase() as any) || "day",
          ...(requestedPeriods.length ? { requestedPeriods } : {}),
          maxRows,
        });
        setPivotError(`[fallback] Worker failed: ${reason}. Computed on main thread.`);
        setPivotResult(payload as any);
      } catch (e: any) {
        setPivotResult(null);
        setPivotError(String(e?.message ?? reason ?? "Failed to compute pivot"));
      }
    };

    if (!cohortField || !activityField) {
      setPivotResult(null);
      setPivotError("Cohort Pivot is enabled but required fields are missing");
      worker.terminate();
      return;
    }

    if (!userField && !usersField) {
      setPivotResult(null);
      setPivotError("Cohort Pivot requires a User ID field or a Users count field");
      worker.terminate();
      return;
    }

    const onMsg = (e: MessageEvent<PivotWorkerResponse>) => {
      const msg = e.data as any;
      if (!msg || msg.taskId !== taskId) return;
      if (cancelled) return;

      if (msg.type === "PIVOT_ERROR" || msg.type === "RETENTION_ERROR") {
        runSyncFallback(String(msg.error ?? "Failed to compute pivot"));
        return;
      }
      if (msg.type === "PIVOT_RESULT" || msg.type === "RETENTION_RESULT") {
        setPivotError(null);
        setPivotResult(msg.payload as any);
      }
    };
    const onWorkerError = (e: ErrorEvent) => {
      if (cancelled) return;
      runSyncFallback(String(e?.message ?? "Worker runtime error"));
    };
    const onWorkerMessageError = () => {
      if (cancelled) return;
      runSyncFallback("Worker message deserialization error");
    };
    worker.addEventListener("message", onMsg as any);
    worker.addEventListener("error", onWorkerError as any);
    worker.addEventListener("messageerror", onWorkerMessageError as any);

    worker.postMessage({
      type: "COMPUTE_PIVOT",
      taskId,
      payload: {
        rows: dbTableData.rows,
        columns: dbTableData.columns,
        cohortField,
        activityField,
        ...(userField ? { userField } : {}),
        ...(usersField ? { usersField } : {}),
        unit,
        ...(requestedPeriods.length ? { requestedPeriods } : {}),
        maxRows,
      },
    });

    return () => {
      cancelled = true;
      try { worker.removeEventListener("message", onMsg as any); } catch {}
      try { worker.removeEventListener("error", onWorkerError as any); } catch {}
      try { worker.removeEventListener("messageerror", onWorkerMessageError as any); } catch {}
      try { worker.terminate(); } catch {}
    };
  }, [pivotConfig, dbTableData]);

  // Fetch for Line (time series)
  useEffect(() => {
    if (!chartName.includes("Line (time series)")) return;
    if (chartData?.kind === "db-table") return;
    const filterKey = (() => {
      try {
        const stable = [...propertyFilters]
          .map((f) => ({ k: String(f.key), o: String(f.operator), v: String(f.value) }))
          .sort((a, b) => (a.k + a.o + a.v).localeCompare(b.k + b.o + b.v));
        return JSON.stringify(stable);
      } catch {
        return "";
      }
    })();

    const queryKey = `${dateRange?.start?.toISOString?.() ?? "all"}|${dateRange?.end?.toISOString?.() ?? "all"}|${filterKey}`;
    const ctrl = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const sp = new URLSearchParams();
        if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
        if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
        for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
        const r = await fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: "no-store", signal: ctrl.signal });
        const rows = await r.json().catch(() => null);
        if (cancelled) return;
        if (!Array.isArray(rows) || rows.length === 0) return;
        setApiLineData(rows.map((rr: any) => ({ ts: Number(rr.ts ?? 0), v: Number(rr.events ?? 0) })));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      void queryKey;
    };
  }, [chartName, chartData?.kind, dateRange?.start, dateRange?.end, propertyFilters]);

  // Fetch for Bar (categorical)
  useEffect(() => {
    if (!chartName.includes("Bar (categorical)")) return;
    if (chartData?.kind === "db-table") return;
    const filterKey = (() => {
      try {
        const stable = [...propertyFilters]
          .map((f) => ({ k: String(f.key), o: String(f.operator), v: String(f.value) }))
          .sort((a, b) => (a.k + a.o + a.v).localeCompare(b.k + b.o + b.v));
        return JSON.stringify(stable);
      } catch {
        return "";
      }
    })();

    const queryKey = `${dateRange?.start?.toISOString?.() ?? "all"}|${dateRange?.end?.toISOString?.() ?? "all"}|${filterKey}`;
    const ctrl = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const sp = new URLSearchParams();
        if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
        if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
        for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
        const r = await fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: "no-store", signal: ctrl.signal });
        const rows = await r.json().catch(() => null);
        if (cancelled) return;
        if (!Array.isArray(rows) || rows.length === 0) return;
        setApiBarCatData(rows.map((rr: any) => ({ category: String(rr.category ?? ""), value: Number(rr.value ?? 0) })));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      void queryKey;
    };
  }, [chartName, dateRange?.start, dateRange?.end, propertyFilters]);

  // === DB data shortcuts (used by individual chart blocks below) ===
  const hasDbData = chartData?.kind === "db-table" && dbTableData && !dbTableLoading && !dbTableError && (dbTableData.columns?.length ?? 0) > 0;
  const dbCols: string[] = dbTableData?.columns ?? [];

  // Apply cell overrides from edit mode (if any)
  const cellOverrides: Record<string, string> | null = chartData?.__cellOverrides ?? null;
  const dbRows: unknown[][] = useMemo(() => {
    const raw: unknown[][] = dbTableData?.rows ?? [];
    if (!cellOverrides || Object.keys(cellOverrides).length === 0) return raw;
    return raw.map((row, rIdx) => {
      const newRow = [...(row as any[])];
      for (const [key, val] of Object.entries(cellOverrides)) {
        const [r, c] = key.split(':').map(Number);
        if (r === rIdx && c >= 0 && c < newRow.length) {
          // Try to preserve numeric type
          const num = Number(val);
          newRow[c] = isNaN(num) || val === '' ? val : num;
        }
      }
      return newRow;
    });
  }, [dbTableData?.rows, cellOverrides]);

  const dbColTypes = useMemo(() => {
    return dbCols.map((col, idx) => detectTableColumnType(dbRows, idx, col));
  }, [dbCols, dbRows]);

  const semanticTableRows = useMemo(() => {
    if (!semanticTableSort) return dbRows;
    const { column, dir } = semanticTableSort;
    const sign = dir === "asc" ? 1 : -1;
    return [...dbRows].sort((a, b) => {
      const av = (a as any[])?.[column];
      const bv = (b as any[])?.[column];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * sign;

      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return -1 * sign;
      if (as > bs) return 1 * sign;
      return 0;
    });
  }, [dbRows, semanticTableSort]);

  useEffect(() => {
    setSemanticTableSort(null);
  }, [dbTableData?.columns, chartId]);

  const vizType = resolveVizType(chartName);
  const mapping = (chartData?.columnMapping ?? null) as ColumnMapping | null;
  const cfgVizType = String((chartData as any)?.chartConfig?.general?.vizType ?? "").trim().toLowerCase();
  const legacyForcedViz = String((chartData as any)?.__forceVizType ?? "").trim().toLowerCase();
  const forcedViz = cfgVizType || legacyForcedViz;
  const customSql = String((chartData as any)?.customSql ?? "").trim();
  const effectiveVizType = (forcedViz === "line" || forcedViz === "bar" || forcedViz === "table" || forcedViz === "pivot" || forcedViz === "area" || forcedViz === "pie" || forcedViz === "donut" || forcedViz === "scatter" || forcedViz === "treemap" || forcedViz === "histogram" || forcedViz === "kpi")
    ? (forcedViz as any)
    : vizType;
  const columnsMeta: ColumnMeta[] = Array.isArray((chartData as any)?.columnsMeta) ? (chartData as any).columnsMeta : [];
  const mappingColumns: ColumnMeta[] = columnsMeta.length > 0 ? columnsMeta : dbCols.map((name) => ({ name }));
  const showMapping = !customSql && ((chartData as any)?.__showColumnMapping === true || (chartData?.kind === "db-table" && effectiveVizType !== "table" && !mapping));

  const pivotLineDb = useMemo(() => {
    if (!pivotConfig) return null;
    if (!pivotResult) return null;
    if (!(effectiveVizType === "line" || effectiveVizType === "area")) return null;

    // Use pre-formatted data from Worker to avoid sync computation on main thread
    const lineData = (pivotResult as any).lineChartData;
    if (!lineData || !Array.isArray(lineData.cols) || !Array.isArray(lineData.rows)) return null;
    if (lineData.cols.length === 0 || lineData.rows.length === 0) return null;

    return { cols: lineData.cols, rows: lineData.rows };
  }, [pivotConfig, pivotResult, effectiveVizType]);

  const y2Cols = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
  const y2Set = useMemo(() => {
    const s = new Set<string>();
    for (const m of y2Cols) {
      const c = String((m as any)?.col ?? "").trim();
      if (c) s.add(c);
    }
    return s;
  }, [y2Cols]);
  const hasY2 = y2Set.size > 0;

  const portableChartConfig = useMemo(() => {
    if (!chartData || typeof chartData !== "object") return null;
    const cfg = (chartData as any).chartConfig;
    return (cfg && typeof cfg === "object") ? cfg : null;
  }, [chartData]);

  const configBg = portableChartConfig?.general?.backgroundColor;
  const containerBgStyle = useMemo(() => {
    const bg = configBg;
    if (!bg || typeof bg !== "string") return undefined;
    if (bg === "transparent") return undefined;
    return { backgroundColor: bg } as const;
  }, [configBg]);

  const renderDbNoRows = () => {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-400">No rows</div>
      </div>
    );
  };

  const renderDbUniversalFallback = () => {
    if (chartData?.kind !== "db-table") return null;
    if (!hasDbData || (dbCols?.length ?? 0) === 0) return renderDbNoRows();
    try {
      const cols = pivotLineDb?.cols ?? dbCols;
      const rows = pivotLineDb?.rows ?? dbRows;
      const colTypes = cols.map((c: string, idx: number) => detectColType(rows, idx, c));
      const axes = pickAxes(cols, colTypes, { mapping: mapping as any });
      const built = buildDbChartOption({
        vizType: effectiveVizType,
        cols,
        colTypes,
        rows,
        axes,
        mapping: mapping as any,
      });
      if (built?.option) {
        return (
          <div className="w-full h-full p-2">
            <BaseChart
              option={withConfig(built.option as any)}
              height={Math.max(160, height - 8)}
              chartId={chartId}
              groupId={groupId}
            />
          </div>
        );
      }
    } catch {}
    return null;
  };

  const renderDbTableFallback = () => {
    const universal = renderDbUniversalFallback();
    if (universal) return universal;
    if ((dbCols?.length ?? 0) > 0) {
      return (
        <div className="w-full h-full p-2 bg-slate-950 overflow-auto" style={containerBgStyle as any}>
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                {dbCols.map((c) => (
                  <th
                    key={c}
                    className="sticky top-0 z-10 text-left font-semibold text-slate-200 bg-slate-950/95 backdrop-blur border-b border-white/10 px-2 py-1"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dbRows.slice(0, 200).map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                  {dbCols.map((_, cIdx) => (
                    <td key={cIdx} className="border-b border-white/5 px-2 py-1 text-slate-100 whitespace-nowrap">
                      {String((row as any[])?.[cIdx] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return renderDbNoRows();
  };

  const creativeStyles = useMemo(
    () => extractCreativeContainerStyles(portableChartConfig?.creative),
    [portableChartConfig?.creative],
  );

  const withConfig = useCallback((opt: any) => {
    try {
      if (portableChartConfig && typeof portableChartConfig === "object") {
        return applyChartConfigToEChartsOption(opt, portableChartConfig);
      }
    } catch {}
    return opt;
  }, [portableChartConfig]);

  const BaseChart = useCallback(
    ({ option, ...rest }: any) => {
      const chart = <EChartsBaseChart option={withConfig(option)} {...rest} />;
      if (!creativeStyles) return chart;
      return <ChartGlowWrapper styles={creativeStyles}>{chart}</ChartGlowWrapper>;
    },
    [withConfig, creativeStyles]
  );

  if (chartData?.kind === "db-table" && effectiveVizType === "kpi") {
    if (dbTableLoading || dbTableError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          {dbTableLoading && <div className="text-sm text-slate-400">Loading data...</div>}
          {dbTableError && <div className="text-sm text-rose-300">{dbTableError}</div>}
        </div>
      );
    }

    if (!hasDbData) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">No rows</div>
        </div>
      );
    }

    const title = String(chartName ?? "").trim() || String(dbCols?.[0] ?? "").trim() || "KPI";
    const rawVal = (dbRows?.[0] as any[])?.[0];
    const numVal = rawVal == null ? null : Number(rawVal);
    const display = (numVal != null && Number.isFinite(numVal))
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numVal)
      : String(rawVal ?? "—");

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4" style={containerBgStyle as any}>
        <div className="text-xs text-slate-400 uppercase tracking-wider text-center">{title}</div>
        <div className="text-5xl font-bold text-white mt-2 tabular-nums">{display}</div>
      </div>
    );
  }

  if (chartData?.kind === "db-table" && effectiveVizType === "table") {
    if (pivotConfig) {
      if (dbTableLoading) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-sm text-slate-400">Loading data...</div>
          </div>
        );
      }
      if (dbTableError || pivotError) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-sm text-rose-300">{pivotError ?? "Loading cohort pivot..."}</div>
          </div>
        );
      }
      if (!pivotResult) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-sm text-slate-400">No cohort pivot data</div>
          </div>
        );
      }

      return (
        <div className="w-full h-full p-2 bg-slate-950" style={containerBgStyle as any}>
          <CohortAnalysisChart
            title={chartName}
            result={pivotResult}
            defaultViewMode="table"
            height={Math.max(160, height - 8)}
            theme={theme === "dark" ? "dark" : "light"}
          />
        </div>
      );
    }

    if (dbTableLoading || dbTableError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          {dbTableLoading && <div className="text-sm text-slate-400">Loading data...</div>}
          {dbTableError && <div className="text-sm text-rose-300">{dbTableError}</div>}
        </div>
      );
    }

    if (!hasDbData) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">No rows</div>
        </div>
      );
    }

    return (
      <div className="w-full h-full p-2 bg-slate-950" style={containerBgStyle as any}>
        <VirtualizedTable
          items={semanticTableRows}
          height={Math.max(160, height - 8)}
          colSpan={Math.max(1, dbCols.length)}
          className="w-full"
          headerClassName="sticky top-0 z-10 bg-slate-950/95 backdrop-blur"
          renderHeader={
            <TableRow>
              {dbCols.map((c, idx) => {
                const active = semanticTableSort?.column === idx;
                const dir = active ? semanticTableSort?.dir : null;
                return (
                  <TableHeaderCell
                    key={`${c}:${idx}`}
                    className="text-left font-semibold text-slate-200 border-b border-white/10 px-2 py-1 cursor-pointer select-none hover:bg-white/5"
                    onClick={() => {
                      setSemanticTableSort((prev) => {
                        if (!prev || prev.column !== idx) return { column: idx, dir: "asc" };
                        if (prev.dir === "asc") return { column: idx, dir: "desc" };
                        return null;
                      });
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c}
                      {active ? (dir === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </TableHeaderCell>
                );
              })}
            </TableRow>
          }
          renderRow={(row, rowIdx) => {
            return (
              <TableRow className={rowIdx % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                {dbCols.map((_, cIdx) => (
                  <TableCell key={cIdx} className="border-b border-white/5 px-2 py-1 text-slate-100 whitespace-nowrap">
                    {formatCellValue((row as any[])?.[cIdx], dbColTypes[cIdx] ?? "unknown")}
                  </TableCell>
                ))}
              </TableRow>
            );
          }}
        />
      </div>
    );
  }

  if (chartData?.kind === "db-table" && effectiveVizType === "pivot") {
    if (dbTableLoading || dbTableError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          {dbTableLoading && <div className="text-sm text-slate-400">Loading data...</div>}
          {dbTableError && <div className="text-sm text-rose-300">{dbTableError}</div>}
        </div>
      );
    }
    if (!hasDbData) return renderDbNoRows();

    const rowField = String((mapping as any)?.detailsColumns?.[0] ?? "pivot_row").trim();
    const colField = String((mapping as any)?.details2Columns?.[0] ?? "pivot_col").trim();
    const valField = String((mapping as any)?.yColumns?.[0]?.col ?? "pivot_value").trim();

    const rowIdx = dbCols.indexOf(rowField) >= 0 ? dbCols.indexOf(rowField) : dbCols.indexOf("pivot_row");
    const colIdx = dbCols.indexOf(colField) >= 0 ? dbCols.indexOf(colField) : dbCols.indexOf("pivot_col");
    const valIdx = dbCols.indexOf(valField) >= 0 ? dbCols.indexOf(valField) : dbCols.indexOf("pivot_value");
    if (rowIdx < 0 || colIdx < 0 || valIdx < 0) return renderDbTableFallback();

    const rowKeys = Array.from(new Set(dbRows.map((r: any) => String((r as any[])?.[rowIdx] ?? "")).filter(Boolean))).slice(0, 200);
    const colKeys = Array.from(new Set(dbRows.map((r: any) => String((r as any[])?.[colIdx] ?? "")).filter(Boolean))).slice(0, 200);
    const matrix = new Map<string, Map<string, number>>();
    for (const rk of rowKeys) matrix.set(rk, new Map<string, number>());
    for (const row of dbRows) {
      const rk = String((row as any[])?.[rowIdx] ?? "");
      const ck = String((row as any[])?.[colIdx] ?? "");
      const v = Number((row as any[])?.[valIdx] ?? 0);
      if (!rk || !ck) continue;
      const rowMap = matrix.get(rk) ?? new Map<string, number>();
      rowMap.set(ck, (rowMap.get(ck) ?? 0) + (Number.isFinite(v) ? v : 0));
      matrix.set(rk, rowMap);
    }

    return (
      <div className="w-full h-full p-2 bg-slate-950 overflow-auto" style={containerBgStyle as any}>
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 text-left font-semibold text-slate-200 bg-slate-950/95 backdrop-blur border-b border-white/10 px-2 py-1">{rowField || "Rows"}</th>
              {colKeys.map((ck) => (
                <th key={ck} className="sticky top-0 z-10 text-right font-semibold text-slate-200 bg-slate-950/95 backdrop-blur border-b border-white/10 px-2 py-1">{ck}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((rk, rIdx) => {
              const rowMap = matrix.get(rk) ?? new Map<string, number>();
              return (
                <tr key={`${rk}_${rIdx}`} className={rIdx % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                  <td className="border-b border-white/5 px-2 py-1 text-slate-100 whitespace-nowrap font-semibold">{rk}</td>
                  {colKeys.map((ck) => (
                    <td key={`${rk}_${ck}`} className="border-b border-white/5 px-2 py-1 text-slate-100 whitespace-nowrap text-right tabular-nums">
                      {new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(rowMap.get(ck) ?? 0))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (chartData?.kind === "db-table" && showMapping) {
    if ((mappingColumns?.length ?? 0) === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">Loading columns...</div>
        </div>
      );
    }
    const modal = (
      <div className="fixed inset-0 z-[1000]">
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 overflow-auto">
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-[560px]">
              <ColumnMappingPanel
                chartName={chartName}
                columns={mappingColumns}
                initialMapping={mapping}
                vizTypeOverride={effectiveVizType as BuilderVizType}
                variant="card"
                onApply={(next) => {
                  if (!chartId) return;
                  try {
                    window.dispatchEvent(
                      new CustomEvent("dashboard:update-chart-data", {
                        detail: {
                          chartId,
                          patch: { columnMapping: next, __showColumnMapping: false },
                        },
                      })
                    );
                  } catch {}
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );

    if (typeof document === "undefined") {
      return modal;
    }

    return createPortal(modal, document.body);
  }

  if (chartData?.kind === "db-table" && effectiveVizType === "donut") {
    const built = renderDbUniversalFallback();
    if (built) return built;
    return renderDbNoRows();
  }

  // Render the appropriate chart content (all existing branches)
  let renderedChart: React.ReactNode = null;

  const lc = String(chartName ?? "").toLowerCase();

  // Power BI: Matrix (mock)
  if (lc === "matrix") {
    return (
      <div className="w-full h-full p-3 bg-slate-950" style={containerBgStyle as any}>
        <div className="rounded-xl overflow-hidden border border-white/10">
          <div className="px-3 py-2 bg-white/5 border-b border-white/10 text-xs font-semibold text-slate-200">Matrix (mock)</div>
          <div className="p-3 text-xs text-slate-400">Matrix визуал пока в виде заглушки.</div>
        </div>
      </div>
    );
  }

  // Power BI: Map / Filled map / Azure map (mock)
  if (lc === "map" || lc === "filled map" || lc === "azure map") {
    return (
      <div className="w-full h-full p-3 bg-slate-950" style={containerBgStyle as any}>
        <div className="w-full h-full rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-200">{chartName}</div>
            <div className="text-xs text-slate-400 mt-1">Map визуалы пока в виде моков.</div>
          </div>
        </div>
      </div>
    );
  }

  // Power BI: Gauge (mock)
  if (lc === "gauge") {
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      series: [
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12 } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { width: 2 } },
          axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' },
          pointer: { width: 4 },
          detail: { valueAnimation: true, formatter: '{value}%', color: theme === 'dark' ? '#fff' : '#000' },
          data: [{ value: 72, name: 'Gauge' }],
        },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(180, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Power BI: Card / Multi-row card / KPI (mock/simple)
  if (lc === "card" || lc === "multi-row card" || lc === "kpi") {
    const isMulti = lc === "multi-row card";
    const title = chartName;
    const seed = stableHash01(String(chartId ?? title));
    return (
      <div className="w-full h-full p-3 bg-slate-950 flex items-center justify-center" style={containerBgStyle as any}>
        <div className="w-full max-w-[520px] rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">{title}</div>
          {isMulti ? (
            <div className="mt-3 space-y-2">
              {["Metric A", "Metric B", "Metric C"].map((k) => (
                <div key={k} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-xs text-slate-200">{k}</div>
                  <div className="text-xs font-semibold text-white">{Math.round(1000 + seed * 9000).toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-3xl font-semibold text-white">{Math.round(1000 + seed * 9000).toLocaleString()}</div>
              <div className="text-xs text-emerald-400 mt-1">+{(seed * 20).toFixed(1)}%</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Power BI: Combo charts (dual axis)
  if (lc === "line and clustered column chart" || lc === "line and stacked column chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    if (chartData?.kind === "db-table" && !dbXY) {
      return renderDbTableFallback();
    }
    const x = dbXY ? dbXY.xLabels : Array.from({ length: 12 }, (_, i) => `M${i + 1}`);
    const series = dbXY && dbXY.series.length > 0
      ? dbXY.series
      : [
          { name: 'Column', data: x.map((_, i) => Math.round(100 + stableHash01(`${chartId ?? chartName}:combo:col:${i}`) * 80)) },
          { name: 'Line', data: x.map((_, i) => Math.round(40 + stableHash01(`${chartId ?? chartName}:combo:line:${i}`) * 30)) },
        ];
    const colSeriesName = String(series[0]?.name ?? 'Column');
    const lineSeriesName = String(series[1]?.name ?? 'Line');
    const isStacked = lc === "line and stacked column chart";

    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 56, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: [
        { type: 'value' },
        { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      ],
      series: [
        { type: 'bar', name: colSeriesName, data: (series[0]?.data ?? []), yAxisIndex: 0, barMaxWidth: 22, ...(isStacked ? { stack: 'total' } : {}), itemStyle: { borderRadius: [6,6,0,0] } },
        { type: 'line', name: lineSeriesName, data: (series[1]?.data ?? []), yAxisIndex: 1, smooth: true, showSymbol: false },
      ],
    };

    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(180, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  if ((chartData as any)?.kind === "slicer" || chartName === "Slicer") {
    if (!chartId) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">Slicer requires a chartId</div>
        </div>
      );
    }
    renderedChart = (
      <SlicerVisual
        chartId={chartId}
        chartData={chartData}
        pageKey={effectivePageKey}
        onPatchChartData={(patch) => {
          try {
            window.dispatchEvent(
              new CustomEvent("dashboard:update-chart-data", {
                detail: {
                  chartId,
                  patch: {
                    kind: "slicer",
                    ...patch,
                  },
                },
              })
            );
          } catch {}
        }}
      />
    );
  }

  // Show loading/error overlay for DB-connected charts
  else if (chartData?.kind === "db-table" && (dbTableLoading || dbTableError)) {
    renderedChart = (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        {dbTableLoading && <div className="text-sm text-slate-400">Loading data...</div>}
        {dbTableError && <div className="text-sm text-rose-300">{dbTableError}</div>}
      </div>
    );
  }
  // Generic: Line (time series) / Power BI: Line chart
  else if (chartName.includes("Line (time series)") || lc === "line chart") {
    const dbTs = hasDbData ? toTimeSeries(dbCols, dbRows) : null;
    const strokes = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
    if (dbTs) {
      renderedChart = (
        <ChartGlowWrapper styles={creativeStyles}>
          <div className="w-full h-full p-2 bg-slate-950" style={containerBgStyle as any}>
            <UPlotTrendModule
              data={dbTs.data}
              xKey="ts"
              series={dbTs.seriesKeys.map((sk, i) => ({ key: sk.key, name: sk.name, stroke: strokes[i % strokes.length] }))}
              height={Math.max(120, height - 8)}
              chartId={chartId}
              groupId={groupId}
            />
          </div>
        </ChartGlowWrapper>
      );
    } else {
      if (chartData?.kind === "db-table") {
        renderedChart = renderDbTableFallback();
      } else {
        const data = apiLineData ?? Array.from({ length: 24 }, (_, i) => ({
          ts: Date.now() - (23 - i) * 3600_000,
          v: 100 + Math.sin(i / 3) * 20 + stableHash01(`${chartId ?? chartName}:line:${i}`) * 10,
        }));
        renderedChart = (
          <ChartGlowWrapper styles={creativeStyles}>
            <div className="w-full h-full p-2 bg-slate-950" style={containerBgStyle as any}>
              <UPlotTrendModule
                data={data}
                xKey="ts"
                series={[{ key: "v", name: "Value", stroke: theme === 'dark' ? "#10b981" : "#000" }]}
                height={Math.max(120, height - 8)}
                chartId={chartId}
                groupId={groupId}
              />
            </div>
          </ChartGlowWrapper>
        );
      }
    }
  }

  // Power BI: Clustered column chart
  else if (lc === "clustered column chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, data: [320, 240, 180, 120], barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Power BI: Clustered bar chart (horizontal)
  else if (lc === "clustered bar chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, data: [320, 240, 180, 120], barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 80, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'top', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      yAxis: { type: 'category', data: cats },
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Grouped bar (legacy)
  else if (chartName.includes("Grouped bar")) {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, data: [320, 240, 180, 120], barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } },
          { name: 'Series 2', type: 'bar' as const, data: [260, 200, 150, 100], barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              chart.off?.('click');
              chart.on?.('click', (params: any) => {
                const isDb = chartData?.kind === "db-table";
                const drillCols = Array.isArray((chartData as any)?.columnMapping?.drilldownColumns)
                  ? (chartData as any).columnMapping.drilldownColumns
                  : [];
                if (isDb && drillCols.length > 0) {
                  handleDrillDown();
                }
              });

              if (chartData?.kind === "db-table") return;

              const sp = new URLSearchParams();
              if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
              if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const cats = rows.map(r => String(r.category ?? ''));
                  const v = rows.map(r => Number(r.value ?? 0));
                  const rev = rows.map(r => Number(r.revenue ?? 0));
                  chart.setOption(withConfig({
                    xAxis: { data: cats },
                    series: [
                      { name: 'Events', type: 'bar', data: v, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
                      { name: 'Revenue', type: 'bar', data: rev, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
                    ],
                  }));
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Power BI: Stacked column chart (vertical)
  else if (lc === "stacked column chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, stack: 'total', data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, stack: 'total', data: [120, 132, 101, 134], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
          { name: 'Series 2', type: 'bar' as const, stack: 'total', data: [220, 182, 191, 234], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Power BI: Stacked bar chart (horizontal)
  else if (lc === "stacked bar chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, stack: 'total', data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, stack: 'total', data: [120, 132, 101, 134], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
          { name: 'Series 2', type: 'bar' as const, stack: 'total', data: [220, 182, 191, 234], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 80, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'top', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      yAxis: { type: 'category', data: cats },
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Stacked bar (legacy)
  else if (chartName.includes("Stacked bar")) {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    const cats = dbXY ? dbXY.xLabels : ["A", "B", "C", "D"];
    const seriesData = dbXY
      ? dbXY.series.map(s => ({ name: s.name, type: 'bar' as const, stack: 'total', data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } }))
      : [
          { name: 'Series 1', type: 'bar' as const, stack: 'total', data: [120, 132, 101, 134], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
          { name: 'Series 2', type: 'bar' as const, stack: 'total', data: [220, 182, 191, 234], barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] as any } },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: seriesData,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              chart.off?.('click');
              chart.on?.('click', (params: any) => {
                const isDb = chartData?.kind === "db-table";
                const drillCols = Array.isArray((chartData as any)?.columnMapping?.drilldownColumns)
                  ? (chartData as any).columnMapping.drilldownColumns
                  : [];
                if (isDb && drillCols.length > 0) {
                  handleDrillDown();
                }
              });

              if (chartData?.kind === "db-table") return;

              const sp = new URLSearchParams();
              if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
              if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const cats = rows.map(r => String(r.category ?? ''));
                  const v = rows.map(r => Number(r.value ?? 0));
                  const rev = rows.map(r => Number(r.revenue ?? 0));
                  chart.setOption(withConfig({
                    xAxis: { data: cats },
                    series: [
                      { name: 'Events', type: 'bar', stack: 'total', data: v, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
                      { name: 'Revenue', type: 'bar', stack: 'total', data: rev, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
                    ],
                  }));
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Generic: Area / Power BI: Area chart
  else if ((chartName.includes("Area") && chartName.includes("накоп")) || lc === "area chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    if (chartData?.kind === "db-table" && !dbXY) {
      return renderDbTableFallback();
    }
    const x = dbXY ? dbXY.xLabels : Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const areaSeries = dbXY
      ? dbXY.series.map(s => ({ type: 'line' as const, name: s.name, data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, smooth: true, areaStyle: {}, showSymbol: false }))
      : [{ type: 'line' as const, name: 'Value', data: Array.from({ length: 24 }, (_, i) => Math.round(80 + i * 4 + Math.sin(i / 2) * 10)), smooth: true, areaStyle: {}, showSymbol: false }];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: areaSeries,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              if (chartData?.kind === "db-table") return;
              const sp = new URLSearchParams();
              if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
              if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const xs = rows.map(r => new Date(Number(r.ts))).map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  const ev = rows.map(r => Number(r.events ?? 0));
                  chart.setOption(withConfig({
                    xAxis: { data: xs },
                    series: [{ type: 'line', name: 'Events', data: ev, smooth: true, areaStyle: {}, showSymbol: false }],
                  }));
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Generic: Stacked area / Power BI: Stacked area chart
  else if (chartName.includes("Stacked area") || lc === "stacked area chart") {
    const dbXY = hasDbData ? toEChartsXY(dbCols, dbRows) : null;
    if (chartData?.kind === "db-table" && !dbXY) {
      return renderDbTableFallback();
    }
    const xData = dbXY ? dbXY.xLabels : Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const stackSeries = dbXY
      ? dbXY.series.map(s => ({ type: 'line' as const, name: s.name, data: s.data, yAxisIndex: (hasY2 && y2Set.has(String(s.name))) ? 1 : 0, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' }))
      : [
          { type: 'line' as const, name: 'S1', data: Array.from({ length: 24 }, (_, i) => Math.round(40 + i * 2 + Math.sin(i / 2) * 6)), smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
          { type: 'line' as const, name: 'S2', data: Array.from({ length: 24 }, (_, i) => Math.round(30 + i * 1.5 + Math.cos(i / 3) * 5)), smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
        ];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: hasY2 ? 56 : 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: xData },
      yAxis: hasY2 ? ([{ type: 'value' }, { type: 'value', position: 'right', axisLabel: { color: theme === 'dark' ? '#cbd5e1' : '#000' } }] as any) : ({ type: 'value' } as any),
      series: stackSeries,
    };
    renderedChart = (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              if (chartData?.kind === "db-table") return;
              const sp = new URLSearchParams();
              if (dateRange?.start) sp.set("startDate", dateRange.start.toISOString());
              if (dateRange?.end) sp.set("endDate", dateRange.end.toISOString());
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const xs = rows.map(r => new Date(Number(r.ts))).map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  const s1 = rows.map((r: any) => Number(r?.events ?? 0)).map((v: number) => (Number.isFinite(v) ? v : 0));
                  const s2 = rows.map((r: any) => Number(r?.users ?? 0)).map((v: number) => (Number.isFinite(v) ? v : 0));
                  chart.setOption({
                    xAxis: { data: xs },
                    series: [
                      { type: 'line', name: 'Events', data: s1, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
                      { type: 'line', name: 'Users', data: s2, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
                    ],
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Donut Chart (unified ECharts)
  if (chartData?.kind !== "db-table" && (chartName.includes("Donut") || chartName.includes("Traffic"))) {
    const dbPie = hasDbData ? toPieData(dbCols, dbRows) : null;
    if (chartData?.kind === "db-table" && !dbPie) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">No rows</div>
        </div>
      );
    }
    const fallback = [
      { name: "Desktop", value: Math.round(400 + stableHash01(`${chartId ?? chartName}:donut:desktop`) * 900) },
      { name: "Mobile", value: Math.round(300 + stableHash01(`${chartId ?? chartName}:donut:mobile`) * 700) },
      { name: "Tablet", value: Math.round(150 + stableHash01(`${chartId ?? chartName}:donut:tablet`) * 500) },
    ];
    const sortedData = dbPie ? dbPie : fallback.sort((a, b) => b.value - a.value);
    const total = sortedData.reduce((sum, d) => sum + d.value, 0);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { 
        top: 0, 
        textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' }, 
        orient: 'horizontal',
        data: sortedData.map(d => d.name)
      },
      series: [
        {
          name: 'Share',
          type: 'pie',
          radius: ['50%','70%'],
          avoidLabelOverlap: false,
          label: { show: true, formatter: '{b}' },
          labelLine: { show: true },
          data: sortedData.map(d => ({ name: d.name, value: d.value })),
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '45%',
          style: {
            text: total.toLocaleString(),
            textAlign: 'center',
            fill: theme === 'dark' ? '#fff' : '#000',
            fontSize: 20,
            fontWeight: 'bold',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '55%',
          style: {
            text: 'Total',
            textAlign: 'center',
            fill: theme === 'dark' ? '#94a3b8' : '#000',
            fontSize: 12,
          },
        },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(120, height - 24)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Universal fallback for DB-connected Component Library visuals
  const forceDbFallback = chartData?.kind === "db-table" && (
    chartName.includes("Interactive Dashboard") ||
    chartName.includes("Anomaly") ||
    chartName.includes("Insight") ||
    chartName.includes("Analyst") ||
    chartName.includes("Cyber Funnel") ||
    chartName.includes("Funnel") ||
    chartName.includes("Retention") ||
    chartName.includes("Pivot") ||
    chartName.includes("User Flow") ||
    chartName.includes("Sankey") ||
    chartName.includes("Chart") && chartName.includes("Builder") ||
    chartName.includes("Field List") ||
    chartName.includes("Filter panel")
  );

  if ((forceDbFallback || !renderedChart) && chartData?.kind === "db-table" && hasDbData && dbCols.length > 0) {
    const colTypes = dbCols.map((c, idx) => detectColType(dbRows, idx, c));
    const axes = pickAxes(dbCols, colTypes, { mapping: (chartData as any)?.columnMapping ?? null });
    const built = buildDbChartOption({
      vizType: effectiveVizType,
      cols: dbCols,
      colTypes,
      rows: dbRows,
      axes,
      mapping: (chartData as any)?.columnMapping ?? null,
    });

    if (built?.option) {
      renderedChart = (
        <div className="w-full h-full p-2">
          <BaseChart
            option={withConfig(built.option as any)}
            height={Math.max(120, height - 24)}
            chartId={chartId}
            groupId={groupId}
          />
        </div>
      );
    } else if (built?.kpi) {
      renderedChart = (
        <div className="w-full h-full p-3 bg-slate-950 flex items-center justify-center">
          <div className="w-full max-w-[520px] rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <Text className="text-slate-400 text-xs">{built.kpi.label}</Text>
            <Metric className="text-white text-2xl mt-1">{built.kpi.value}</Metric>
            {built.kpi.sub ? (
              <Text className="text-slate-400 text-xs mt-1">{built.kpi.sub}</Text>
            ) : null}
          </div>
        </div>
      );
    }
  }

  // Default - ECharts Area (unified)
  if (!renderedChart) {
    if (chartData?.kind === "db-table") {
      if (dbTableLoading) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-sm text-slate-400">Loading</div>
          </div>
        );
      }
      if (dbTableError) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-slate-950">
            <div className="text-sm text-red-300">{String((dbTableError as any)?.message ?? dbTableError ?? "DB query failed")}</div>
          </div>
        );
      }
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950">
          <div className="text-sm text-slate-400">No rows</div>
        </div>
      );
    }
    renderedChart = (
      <div className="w-full h-full p-2">
        {(() => {
          const fallback = Array.from({ length: 14 }, (_, i) => {
            const seed = stableHash01(`${chartId ?? chartName}:default-area:${i}`);
            return {
              date: new Date(Date.now() - (13 - i) * 24 * 3600_000).toLocaleDateString([], { month: 'short', day: '2-digit' }),
              value: Math.round(120 + Math.sin(i / 3) * 40 + seed * 20),
            };
          });
          return (
            <BaseChart
              option={{
                backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
                tooltip: { trigger: 'axis' },
                grid: { left: 32, right: 16, top: 8, bottom: 16, containLabel: true },
                xAxis: { type: 'category', data: fallback.map(d => d.date) },
                yAxis: { type: 'value' },
                series: [ { type: 'line', data: fallback.map(d => d.value), areaStyle: {}, smooth: true, showSymbol: false } ],
              }}
              height={Math.max(120, height - 24)}
              chartId={chartId}
              groupId={groupId}
            />
          );
        })()}
      </div>
    );
  }

  if (chartData?.kind === "db-table" && drillCols.length > 0) {
    const currentLevel = Math.max(-1, Math.min(drillCols.length - 1, drillLevel));
    const activePath = drillCols.slice(0, currentLevel + 1);
    return (
      <div className="relative w-full h-full">
        <DrillBreadcrumbControls
          activePath={activePath}
          canDrillUp={currentLevel >= 0}
          canDrillDown={currentLevel + 1 < drillCols.length}
          onDrillUp={handleDrillUp}
          onDrillDown={handleDrillDown}
        />
        {renderedChart}
      </div>
    );
  }

  return renderedChart;
});
