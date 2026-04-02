"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MouseEvent } from "react";
import type { BiFilter } from "../../../store/biFiltersContext";
import { buildScopedFilter, isSemanticRef, type DateRelOverride, type SlicerMode } from "./types";

type Params = {
  chartId: string;
  fieldRef: string;
  sourceKind: "field" | "parameter";
  parameterId: string;
  mode: SlicerMode;
  multiSelect: boolean;
  pageKey: string;
  effectiveScope: "report" | "page" | "visual";
  effectiveFilterTargetChartId: string;
  dateMode: "absolute" | "relative";
  relativeAmount: number;
  relativeUnit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
  textFilterOp: "eq" | "contains" | "startswith" | "icontains" | "istartswith";
  selectedValues: string[];
  onPatchChartData: (patch: any) => void;
  replaceFiltersForChart: (chartId: string, nextFilters: BiFilter[], ownerFilterGroup?: string) => void;
};

function toIsoOrNull(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function resolveRelativeDateBoundsWith(
  amount: number,
  unit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year"
): { fromIso: string; toIso: string } {
  const to = new Date();
  const from = new Date(to.getTime());
  const a = Math.max(1, Number(amount) || 1);
  if (unit === "minute") from.setMinutes(from.getMinutes() - a);
  else if (unit === "hour") from.setHours(from.getHours() - a);
  else if (unit === "day") from.setDate(from.getDate() - a);
  else if (unit === "week") from.setDate(from.getDate() - (a * 7));
  else if (unit === "month") from.setMonth(from.getMonth() - a);
  else if (unit === "quarter") from.setMonth(from.getMonth() - (a * 3));
  else from.setFullYear(from.getFullYear() - a);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export function useSlicerFilter(params: Params) {
  const {
    chartId,
    fieldRef,
    sourceKind,
    parameterId,
    mode,
    multiSelect,
    pageKey,
    effectiveScope,
    effectiveFilterTargetChartId,
    dateMode,
    relativeAmount,
    relativeUnit,
    textFilterOp,
    selectedValues,
    onPatchChartData,
    replaceFiltersForChart,
  } = params;
  const ownerFilterGroup = `slicer:${String(chartId ?? "").trim()}`;
  const selectedValuesRef = useRef<string[]>(Array.isArray(selectedValues) ? selectedValues : []);
  useEffect(() => {
    selectedValuesRef.current = Array.isArray(selectedValues) ? selectedValues.map((x) => String(x)) : [];
  }, [selectedValues]);

  const baseCtx = useMemo(() => ({
    fieldRef,
    sourceModel: fieldRef.includes(".") ? fieldRef.split(".")[0] : undefined,
    effectiveScope,
    pageKey,
    effectiveFilterTargetChartId,
    ownerFilterGroup,
  }), [fieldRef, effectiveScope, pageKey, effectiveFilterTargetChartId, ownerFilterGroup]);

  const replaceFiltersForTarget = (nextFilters: BiFilter[]) => {
    // #region agent log
    fetch('http://127.0.0.1:7891/ingest/42f4b2b3-bbc6-4993-849a-db95471cb317',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6bac71'},body:JSON.stringify({sessionId:'6bac71',runId:'slicer-queryerror-run1',hypothesisId:'H1',location:'useSlicerFilter.ts:replaceFiltersForTarget',message:'slicer emits filters',data:{chartId,effectiveScope,pageKey,effectiveFilterTargetChartId,fieldRef,nextFiltersCount:Array.isArray(nextFilters)?nextFilters.length:0,nextFilters:(Array.isArray(nextFilters)?nextFilters:[]).map((f)=>({field:String((f as any)?.field??''),op:String((f as any)?.op??''),values:Array.isArray((f as any)?.values)?(f as any).values:[]}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (effectiveScope === "page" && !String(pageKey ?? "").trim()) {
      return;
    }
    const normalized = (Array.isArray(nextFilters) ? nextFilters : []).map((f) => ({
      ...f,
      logicGroup: String(f?.logicGroup ?? "").trim() || ownerFilterGroup,
    }));
    replaceFiltersForChart(effectiveFilterTargetChartId, normalized, ownerFilterGroup);
  };

  const writeListFilterToStore = (nextSelected: string[]) => {
    if (sourceKind === "parameter") return;
    if (!fieldRef || !isSemanticRef(fieldRef)) return;
    const values = nextSelected.map((v) => String(v));
    if (values.length === 0) {
      replaceFiltersForTarget([]);
      return;
    }
    replaceFiltersForTarget([buildScopedFilter(baseCtx, "in", values)]);
  };

  const writeDateFilterToStore = (
    op: "between" | "gte" | "lte",
    fromRaw: string,
    toRaw: string,
    relOverride?: DateRelOverride
  ) => {
    const dm = relOverride?.dateMode ?? dateMode;
    const ra = relOverride?.relativeAmount ?? relativeAmount;
    const ru = relOverride?.relativeUnit ?? relativeUnit;
    const rel = dm === "relative" ? resolveRelativeDateBoundsWith(ra, ru) : null;
    const fromIso = rel?.fromIso ?? toIsoOrNull(fromRaw);
    const toIso = rel?.toIso ?? toIsoOrNull(toRaw);

    if (!fieldRef || !isSemanticRef(fieldRef)) return;

    if (op === "between") {
      if (!fromIso || !toIso) return;
      replaceFiltersForTarget([buildScopedFilter(baseCtx, "between", [fromIso, toIso])]);
      window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", { detail: { start: fromIso, end: toIso } }));
      return;
    }
    if (op === "gte") {
      if (!fromIso) return;
      replaceFiltersForTarget([buildScopedFilter(baseCtx, "gte", [fromIso])]);
      window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", { detail: { start: fromIso, ...(toIso ? { end: toIso } : {}) } }));
      return;
    }
    if (!toIso) return;
    replaceFiltersForTarget([buildScopedFilter(baseCtx, "lte", [toIso])]);
    window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", { detail: { ...(fromIso ? { start: fromIso } : {}), end: toIso } }));
  };

  const writeNumericRangeFilterToStore = (op: "between" | "gte" | "lte", fromRaw: string, toRaw: string) => {
    if (!fieldRef || !isSemanticRef(fieldRef)) return;
    const normalizeNum = (v: string): number | null => {
      const n = Number(String(v ?? "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const fromNum = normalizeNum(fromRaw);
    const toNum = normalizeNum(toRaw);
    if (op === "between") {
      if (fromNum == null || toNum == null) return;
      replaceFiltersForTarget([buildScopedFilter(baseCtx, "between", [fromNum, toNum])]);
      return;
    }
    if (op === "gte") {
      if (fromNum == null) return;
      replaceFiltersForTarget([buildScopedFilter(baseCtx, "gte", [fromNum])]);
      return;
    }
    if (toNum == null) return;
    replaceFiltersForTarget([buildScopedFilter(baseCtx, "lte", [toNum])]);
  };

  const patchSelectedValues = (nextSelected: string[]) => {
    onPatchChartData({
      slicer: {
        mode,
        multiSelect,
        fieldRef,
        sourceKind,
        parameterId,
        selectedValues: nextSelected,
      },
    });
    if (sourceKind === "parameter") {
      try {
        const patch: any = {
          parameterSelections: {
            [String(parameterId ?? "").toLowerCase()]: { values: nextSelected },
          },
        };
        window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch } }));
      } catch {}
      return;
    }
    writeListFilterToStore(nextSelected);
  };

  const clearSelection = () => {
    onPatchChartData({
      slicer: {
        mode,
        multiSelect,
        fieldRef,
        selectedValues: [],
        dateFrom: "",
        dateTo: "",
        hierarchyPath: [],
        textFilterValue: "",
      },
    });
    if (sourceKind === "parameter") {
      try {
        const patch: any = {
          parameterSelections: {
            [String(parameterId ?? "").toLowerCase()]: { values: [] },
          },
        };
        window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch } }));
      } catch {}
      return;
    }
    replaceFiltersForChart(effectiveFilterTargetChartId, [], ownerFilterGroup);
  };

  const toggleValue = (vRaw: string, e?: MouseEvent) => {
    const v = String(vRaw ?? "");
    if (!v) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!multiSelect) {
      const only = String(selectedValuesRef.current[0] ?? "");
      patchSelectedValues(only === v ? [] : [v]);
      return;
    }
    const next = new Set(selectedValuesRef.current);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    patchSelectedValues(Array.from(next));
  };

  const applyTextInputFilter = (textFilterValue: string) => {
    const v = String(textFilterValue ?? "").trim();
    if (!fieldRef || !isSemanticRef(fieldRef) || !v) return;
    replaceFiltersForTarget([buildScopedFilter(baseCtx, textFilterOp, [v])]);
  };

  return {
    writeListFilterToStore,
    writeDateFilterToStore,
    writeNumericRangeFilterToStore,
    patchSelectedValues,
    clearSelection,
    toggleValue,
    applyTextInputFilter,
    replaceFiltersForTarget,
  };
}
