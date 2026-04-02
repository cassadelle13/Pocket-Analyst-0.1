"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBiFilters, type BiFilter } from "../../store/biFiltersContext";
import { parseDropEvent, type SlicerMode, type SlicerState, isSemanticRef } from "./slicer/types";
import { useSlicerValues } from "./slicer/useSlicerValues";
import { useSlicerFilter } from "./slicer/useSlicerFilter";
import { SlicerHeader } from "./slicer/SlicerHeader";
import { SlicerFieldBinding } from "./slicer/SlicerFieldBinding";
import { SlicerListMode } from "./slicer/SlicerListMode";
import { SlicerTileMode } from "./slicer/SlicerTileMode";
import { SlicerDropdownMode } from "./slicer/SlicerDropdownMode";
import { SlicerDateRangeMode } from "./slicer/SlicerDateRangeMode";
import { SlicerNumericRangeMode } from "./slicer/SlicerNumericRangeMode";
import { SlicerHierarchyMode } from "./slicer/SlicerHierarchyMode";
import { SlicerInputMode } from "./slicer/SlicerInputMode";

type SlicerChartData = {
  kind?: string;
  name?: string;
  __sourceChartId?: string;
  __slicerBiScope?: "report" | "page" | "visual" | string;
  connectionId?: string;
  tableKey?: string;
  slicer?: SlicerState;
  [key: string]: unknown;
};

export function SlicerVisual({
  chartId,
  chartData,
  pageKey,
  onPatchChartData,
}: {
  chartId: string;
  chartData: SlicerChartData | null | undefined;
  pageKey: string;
  onPatchChartData: (patch: any) => void;
}) {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");
  const { filters: biFilters, replaceFiltersForChart } = useBiFilters();
  const chartDataObj = (chartData && typeof chartData === "object") ? chartData : null;

  const rawSourceChartId = useMemo(() => {
    const id = chartDataObj ? String(chartDataObj.__sourceChartId ?? "").trim() : "";
    return id || null;
  }, [chartDataObj]);

  const slicer: SlicerState = (chartDataObj && chartDataObj.slicer && typeof chartDataObj.slicer === "object")
    ? chartDataObj.slicer
    : {};

  const slicerRef = useRef(slicer);
  slicerRef.current = slicer;

  const isFieldParameterSlicer = String((slicer as any).sourceKind ?? "") === "fieldParameter";
  const explicitBiScopeRaw = String(chartDataObj?.__slicerBiScope ?? "").trim().toLowerCase();
  const explicitBiScope: "report" | "page" | "visual" | null =
    explicitBiScopeRaw === "report" || explicitBiScopeRaw === "page" || explicitBiScopeRaw === "visual"
      ? (explicitBiScopeRaw as "report" | "page" | "visual")
      : null;
  const menuLinkedChartId = explicitBiScope ? null : (rawSourceChartId && !isFieldParameterSlicer ? rawSourceChartId : null);
  const effectiveScope: "report" | "page" | "visual" = explicitBiScope ? explicitBiScope : (menuLinkedChartId ? "visual" : "report");
  const effectiveFilterTargetChartId = effectiveScope === "visual"
    ? (rawSourceChartId && !isFieldParameterSlicer ? rawSourceChartId : chartId)
    : chartId;

  const mode: SlicerMode = (
    slicer.mode === "dropdown" ||
    slicer.mode === "tile" ||
    slicer.mode === "dateRange" ||
    slicer.mode === "list" ||
    slicer.mode === "range" ||
    slicer.mode === "hierarchy" ||
    slicer.mode === "input"
  ) ? slicer.mode : "list";

  const sourceKind: "field" | "parameter" = (slicer as any).sourceKind === "parameter" ? "parameter" : "field";
  const parameterId = String((slicer as any).parameterId ?? "").trim();
  const fieldParameterId = String((slicer as any).fieldParameterId ?? "").trim();
  const syncGroup = String(slicer.syncGroup ?? "").trim();
  const fieldRef = String(slicer.fieldRef ?? "").trim();
  const multiSelect = slicer.multiSelect !== false;
  const showSearch = slicer.showSearch !== false;
  const showSelectAll = Boolean(slicer.showSelectAll);
  const forceSelection = Boolean(slicer.forceSelection);
  const sortOrder: "asc" | "desc" = String((slicer as any).sortOrder ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const orientation: "vertical" | "horizontal" = String(slicer.orientation ?? "vertical").toLowerCase() === "horizontal" ? "horizontal" : "vertical";
  const restrictToLeafNodes = Boolean(slicer.restrictToLeafNodes);
  const valuesFontSize = Number.isFinite(Number(slicer.valuesFontSize)) ? Math.max(10, Math.min(24, Number(slicer.valuesFontSize))) : 12;
  const valuesBackgroundColor = String(slicer.valuesBackgroundColor ?? "#f1f5f9");
  const headerVisible = slicer.headerVisible !== false;

  const hierarchyLevels = useMemo(
    () => Array.isArray(slicer.hierarchyLevels)
      ? slicer.hierarchyLevels.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [],
    [slicer.hierarchyLevels]
  );
  const hierarchyPath = useMemo(
    () => Array.isArray(slicer.hierarchyPath)
      ? slicer.hierarchyPath.map((x) => String(x ?? "").trim())
      : [],
    [slicer.hierarchyPath]
  );
  const hierarchyCursor = hierarchyLevels[hierarchyPath.length] ?? "";
  const textFilterOp: SlicerState["textFilterOp"] = (
    slicer.textFilterOp === "contains" ||
    slicer.textFilterOp === "startswith" ||
    slicer.textFilterOp === "icontains" ||
    slicer.textFilterOp === "istartswith"
  ) ? slicer.textFilterOp : "eq";
  const textFilterValue = String(slicer.textFilterValue ?? "");
  const dateOp: "between" | "gte" | "lte" = (slicer.dateOp === "between" || slicer.dateOp === "gte" || slicer.dateOp === "lte")
    ? slicer.dateOp
    : "between";
  const dateFrom = String(slicer.dateFrom ?? "");
  const dateTo = String(slicer.dateTo ?? "");
  const dateMode: "absolute" | "relative" = slicer.dateMode === "relative" ? "relative" : "absolute";
  const relativeAmount = Number.isFinite(Number(slicer.relativeAmount)) ? Math.max(1, Number(slicer.relativeAmount)) : 30;
  const relativeUnit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year" = (
    slicer.relativeUnit === "minute" ||
    slicer.relativeUnit === "hour" ||
    slicer.relativeUnit === "day" ||
    slicer.relativeUnit === "week" ||
    slicer.relativeUnit === "month" ||
    slicer.relativeUnit === "quarter" ||
    slicer.relativeUnit === "year"
  ) ? slicer.relativeUnit : "day";
  const selected = useMemo(() => new Set(Array.isArray(slicer.selectedValues) ? slicer.selectedValues.map((x) => String(x)) : []), [slicer.selectedValues]);

  const [semanticArtifacts, setSemanticArtifacts] = useState<any>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const next = detail?.semanticArtifacts;
      setSemanticArtifacts(next && typeof next === "object" ? next : null);
    };
    window.addEventListener("dashboard:semantic-artifacts", handler as EventListener);
    return () => window.removeEventListener("dashboard:semantic-artifacts", handler as EventListener);
  }, []);

  const paramDef = useMemo(() => {
    if (sourceKind !== "parameter") return null;
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const params = a && a.parameters && typeof a.parameters === "object" ? a.parameters : null;
    if (!params || !parameterId) return null;
    const direct = (params as any)[parameterId];
    if (direct) return direct;
    const pidLc = parameterId.toLowerCase();
    for (const k of Object.keys(params)) {
      if (String(k).toLowerCase() === pidLc) return (params as any)[k];
    }
    return null;
  }, [semanticArtifacts, parameterId, sourceKind]);

  const fieldParamDef = useMemo(() => {
    const sk = String((slicer as any).sourceKind ?? "");
    if (sk !== "fieldParameter") return null;
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const fps = a && a.fieldParameters && typeof a.fieldParameters === "object" ? a.fieldParameters : null;
    if (!fps || !fieldParameterId) return null;
    const direct = (fps as any)[fieldParameterId];
    if (direct) return direct;
    const idLc = fieldParameterId.toLowerCase();
    for (const k of Object.keys(fps)) {
      if (String(k).toLowerCase() === idLc) return (fps as any)[k];
    }
    return null;
  }, [semanticArtifacts, fieldParameterId, slicer]);

  const fieldParamItems = useMemo(() => {
    if (!fieldParamDef) return [] as Array<{ label: string; ref: string }>;
    const items = Array.isArray((fieldParamDef as any)?.items) ? (fieldParamDef as any).items : [];
    return items
      .map((it: any) => ({ label: String(it?.label ?? it?.ref ?? "").trim(), ref: String(it?.ref ?? "").trim() }))
      .filter((x: any) => x.ref);
  }, [fieldParamDef]);

  const fieldParamSelectedRef = useMemo(() => {
    if (!fieldParamDef) return "";
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const sel = a && a.fieldParameterSelections && typeof a.fieldParameterSelections === "object" ? (a.fieldParameterSelections as any) : null;
    if (!sel) return "";
    const keyLc = String(fieldParameterId ?? "").toLowerCase();
    const direct = sel[fieldParameterId] ?? sel[keyLc];
    return String(direct?.ref ?? "").trim();
  }, [semanticArtifacts, fieldParamDef, fieldParameterId]);

  const fieldParamSelectedRefs = useMemo(() => {
    if (!fieldParamDef) return [] as string[];
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const sel = a && a.fieldParameterSelections && typeof a.fieldParameterSelections === "object" ? (a.fieldParameterSelections as any) : null;
    if (!sel) return [];
    const keyLc = String(fieldParameterId ?? "").toLowerCase();
    const direct = sel[fieldParameterId] ?? sel[keyLc];
    const refs = Array.isArray(direct?.refs) ? direct.refs : [];
    return refs.map((r: any) => String(r)).filter(Boolean);
  }, [semanticArtifacts, fieldParamDef, fieldParameterId]);

  const paramValues = useMemo(() => {
    if (sourceKind !== "parameter") return [] as string[];
    const vals = Array.isArray((paramDef as any)?.values) ? (paramDef as any).values : [];
    return vals.map((v: any) => String(v)).filter(Boolean);
  }, [paramDef, sourceKind]);

  const paramSelected = useMemo(() => {
    if (sourceKind !== "parameter") return [] as string[];
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const sel = a && a.parameterSelections && typeof a.parameterSelections === "object" ? (a.parameterSelections as any) : null;
    if (!sel) return [];
    const pidLc = String(parameterId ?? "").toLowerCase();
    const direct = sel[parameterId] ?? sel[pidLc];
    const values = Array.isArray(direct?.values) ? direct.values : [];
    return values.map((v: any) => String(v)).filter(Boolean);
  }, [semanticArtifacts, parameterId, sourceKind]);

  const persistSlicerMeta = (patch: Partial<SlicerState>) => {
    const base = slicerRef.current;
    onPatchChartData({
      slicer: {
        ...base,
        ...patch,
        fieldRef: patch.fieldRef !== undefined ? patch.fieldRef : (base.fieldRef ?? fieldRef),
      },
    });
  };

  const projectId = useMemo(() => {
    try {
      const lsPid = typeof window !== "undefined" ? String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim() : "";
      return String(urlProjectId ?? "").trim() || lsPid;
    } catch {
      return String(urlProjectId ?? "").trim();
    }
  }, [urlProjectId]);

  const canSuggest = useMemo(() => !!projectId, [projectId]);
  const {
    valueSearch,
    setValueSearch,
    setSuggestQuery,
    suggestLoading,
    suggestError,
    setSuggestError,
    filteredSuggestions,
  } = useSlicerValues({
    sourceKind,
    mode,
    fieldRef,
    hierarchyCursor,
    hierarchyLevels,
    hierarchyPath,
    effectiveScope,
    pageKey,
    effectiveFilterTargetChartId,
    canSuggest,
    projectId,
    biFilters: Array.isArray(biFilters) ? biFilters : [],
    paramValues,
    sortOrder,
    limit: 500,
  });

  const {
    writeDateFilterToStore,
    writeNumericRangeFilterToStore,
    patchSelectedValues,
    clearSelection,
    toggleValue,
    applyTextInputFilter,
    replaceFiltersForTarget,
  } = useSlicerFilter({
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
    textFilterOp: textFilterOp ?? "eq",
    selectedValues: Array.isArray(slicer.selectedValues) ? slicer.selectedValues : [],
    onPatchChartData: (patch) => onPatchChartData({ slicer: { ...slicer, ...(patch?.slicer ?? patch) } }),
    replaceFiltersForChart,
  });

  const hasBinding = sourceKind === "parameter"
    ? paramValues.length > 0
    : (mode === "hierarchy" ? hierarchyLevels.length > 0 : !!fieldRef);
  const hasFieldParameterBinding = String((slicer as any).sourceKind ?? "") === "fieldParameter" && !!fieldParameterId;
  const hasSelection = useMemo(() => {
    if (mode === "dateRange") return !!String(dateFrom ?? "").trim() || !!String(dateTo ?? "").trim();
    if (mode === "hierarchy") return hierarchyPath.length > 0;
    if (mode === "input") return textFilterValue.trim().length > 0;
    return Array.isArray(slicer.selectedValues) && slicer.selectedValues.length > 0;
  }, [dateFrom, dateTo, mode, slicer.selectedValues, hierarchyPath, textFilterValue]);

  const headerLabel = (() => {
    const sk = String((slicer as any).sourceKind ?? "");
    if (String(slicer.headerTitle ?? "").trim()) return String(slicer.headerTitle).trim();
    if (sk === "fieldParameter") return String((fieldParamDef as any)?.name ?? "").trim() || fieldParameterId || "Field parameter";
    if (sourceKind === "parameter") return (String((paramDef as any)?.name ?? "").trim() || parameterId || "Parameter");
    return fieldRef || "Slicer";
  })();
  const scopeLabel = effectiveScope === "report" ? "All charts" : effectiveScope === "page" ? `Page: ${pageKey}` : `Visual: ${effectiveFilterTargetChartId}`;

  const [isDropOver, setIsDropOver] = useState(false);
  const suppressNextSyncBroadcastRef = useRef(false);

  const applyDroppedFieldRef = (nextRef: string, semanticType?: string, fieldType?: string) => {
    const ref = String(nextRef ?? "").trim();
    if (ref === "__time__") return;
    if (fieldType === "measure") {
      setSuggestError("Slicers use dimensions or time fields, not measures.");
      window.setTimeout(() => setSuggestError(null), 5000);
      return;
    }
    const cur = slicerRef.current;
    if (cur.mode === "hierarchy") {
      const levels = Array.isArray(cur.hierarchyLevels) ? [...cur.hierarchyLevels] : [];
      levels.push(ref);
      onPatchChartData({ slicer: { ...cur, sourceKind: "field", parameterId: "", hierarchyLevels: levels, hierarchyPath: [] } });
      return;
    }
    onPatchChartData({
      slicer: {
        ...cur,
        sourceKind: "field",
        parameterId: "",
        fieldRef: ref,
        fieldSemanticType: String(semanticType ?? "").trim() || undefined,
        selectedValues: [],
        dateFrom: "",
        dateTo: "",
      },
    });
  };

  const applyHierarchyLevelValue = (vRaw: string) => {
    const v = String(vRaw ?? "").trim();
    if (!v) return;
    const path = [...hierarchyPath, v];
    persistSlicerMeta({ hierarchyPath: path });
    const isLeaf = path.length >= hierarchyLevels.length;
    if (restrictToLeafNodes && !isLeaf) return;
    const filters: BiFilter[] = [];
    for (let i = 0; i < path.length; i++) {
      const lf = hierarchyLevels[i];
      if (!lf) continue;
      filters.push({
        field: lf,
        op: "eq",
        values: [path[i]],
        scope: effectiveScope,
        pageKey: effectiveScope === "page" ? pageKey : undefined,
        sourceChartId: effectiveFilterTargetChartId,
      });
    }
    replaceFiltersForTarget(filters);
  };

  const hierarchyGoBack = () => {
    if (hierarchyPath.length === 0) return;
    const path = hierarchyPath.slice(0, -1);
    const filters: BiFilter[] = [];
    for (let i = 0; i < path.length; i++) {
      const lf = hierarchyLevels[i];
      if (!lf) continue;
      filters.push({
        field: lf,
        op: "eq",
        values: [path[i]],
        scope: effectiveScope,
        pageKey: effectiveScope === "page" ? pageKey : undefined,
        sourceChartId: effectiveFilterTargetChartId,
      });
    }
    persistSlicerMeta({ hierarchyPath: path });
    const isLeaf = path.length >= hierarchyLevels.length;
    if (restrictToLeafNodes && !isLeaf) {
      replaceFiltersForTarget([]);
      return;
    }
    replaceFiltersForTarget(filters);
  };

  const clearHierarchyLevels = () => {
    persistSlicerMeta({ hierarchyLevels: [], hierarchyPath: [] });
    replaceFiltersForTarget([]);
  };

  const applyFieldParameterSelection = (selectedRef: string) => {
    const ref = String(selectedRef ?? "").trim();
    if (!ref) return;
    const fpIdLc = String(fieldParameterId ?? "").toLowerCase();
    try {
      window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", {
        detail: { patch: { fieldParameterSelections: { [fpIdLc]: { ref } } } },
      }));
    } catch {}
    const targetChart = String((chartData as any)?.__sourceChartId ?? "").trim();
    if (!targetChart) return;
    const kind = String((fieldParamDef as any)?.kind ?? "measure") === "dimension" ? "dimension" : "measure";
    window.dispatchEvent(new CustomEvent("dashboard:update-chart-data", {
      detail: {
        chartId: targetChart,
        patch: {
          logicalQuery: kind === "measure" ? { measures: [ref], measuresV2: [{ ref }] } : { dimensions: [ref] },
        },
      },
    }));
  };

  const applyFieldParameterSelections = (selectedRefs: string[]) => {
    const refs = (Array.isArray(selectedRefs) ? selectedRefs : []).map((r) => String(r ?? "").trim()).filter(Boolean);
    if (refs.length === 0) return;
    const fpIdLc = String(fieldParameterId ?? "").toLowerCase();
    try {
      window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", {
        detail: { patch: { fieldParameterSelections: { [fpIdLc]: { refs } } } },
      }));
    } catch {}
    const targetChart = String((chartData as any)?.__sourceChartId ?? "").trim();
    if (!targetChart) return;
    const kind = String((fieldParamDef as any)?.kind ?? "measure") === "dimension" ? "dimension" : "measure";
    window.dispatchEvent(new CustomEvent("dashboard:update-chart-data", {
      detail: {
        chartId: targetChart,
        patch: { logicalQuery: kind === "measure" ? { measures: refs, measuresV2: refs.map((ref) => ({ ref })) } : { dimensions: refs } },
      },
    }));
  };

  useEffect(() => {
    if (sourceKind !== "parameter") return;
    onPatchChartData({ slicer: { ...slicerRef.current, sourceKind, parameterId, selectedValues: paramSelected } });
  }, [sourceKind, parameterId, paramSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!syncGroup) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      const group = String((detail as any)?.group ?? "").trim();
      const sender = String((detail as any)?.senderChartId ?? "").trim();
      if (!group || group !== syncGroup) return;
      if (sender && sender === String(chartId)) return;
      suppressNextSyncBroadcastRef.current = true;

      const nextModeRaw = String((detail as any)?.mode ?? "");
      const nextMode = (nextModeRaw === "list" || nextModeRaw === "dropdown" || nextModeRaw === "tile" || nextModeRaw === "dateRange" || nextModeRaw === "range" || nextModeRaw === "hierarchy" || nextModeRaw === "input")
        ? (nextModeRaw as SlicerMode)
        : mode;
      const values = Array.isArray((detail as any)?.selectedValues) ? (detail as any).selectedValues.map((v: any) => String(v)) : [];

      const nextPatch: any = { ...slicerRef.current, mode: nextMode, selectedValues: values };
      if (nextMode === "dateRange" || nextMode === "range") {
        const nextDateOp = String((detail as any)?.dateOp ?? "");
        const nextDateFrom = String((detail as any)?.dateFrom ?? "");
        const nextDateTo = String((detail as any)?.dateTo ?? "");
        if (nextDateOp === "between" || nextDateOp === "gte" || nextDateOp === "lte") {
          nextPatch.dateOp = nextDateOp;
          nextPatch.dateFrom = nextDateFrom;
          nextPatch.dateTo = nextDateTo;
          if (nextMode === "dateRange") {
            const syncDateMode = String((detail as any)?.dateMode ?? "") === "relative" ? "relative" : "absolute";
            const syncRelAmt = Number((detail as any)?.relativeAmount);
            const syncRelUnitRaw = String((detail as any)?.relativeUnit ?? "").trim();
            const syncRelUnit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year" = (
              syncRelUnitRaw === "minute" || syncRelUnitRaw === "hour" ||
              syncRelUnitRaw === "day" || syncRelUnitRaw === "week" || syncRelUnitRaw === "month" ||
              syncRelUnitRaw === "quarter" || syncRelUnitRaw === "year"
            ) ? syncRelUnitRaw : "day";
            nextPatch.dateMode = syncDateMode;
            nextPatch.relativeAmount = Number.isFinite(syncRelAmt) && syncRelAmt >= 1 ? syncRelAmt : 30;
            nextPatch.relativeUnit = syncRelUnit;
            writeDateFilterToStore(nextDateOp as any, nextDateFrom, nextDateTo, {
              dateMode: syncDateMode,
              relativeAmount: nextPatch.relativeAmount,
              relativeUnit: syncRelUnit,
            });
          } else {
            writeNumericRangeFilterToStore(nextDateOp as any, nextDateFrom, nextDateTo);
          }
        }
      } else if (nextMode === "input") {
        nextPatch.textFilterValue = String((detail as any)?.textFilterValue ?? "");
      } else if (nextMode === "hierarchy") {
        const path = Array.isArray((detail as any)?.hierarchyPath) ? (detail as any).hierarchyPath.map((x: any) => String(x)) : [];
        nextPatch.hierarchyPath = path;
      } else {
        if (!isSemanticRef(fieldRef)) {
          replaceFiltersForTarget([]);
        } else if (values.length === 0) {
          replaceFiltersForTarget([]);
        } else {
          replaceFiltersForTarget([{
            field: fieldRef,
            op: "in",
            values,
            scope: effectiveScope,
            pageKey: effectiveScope === "page" ? pageKey : undefined,
            sourceChartId: effectiveFilterTargetChartId,
            logicGroup: `slicer:${chartId}`,
          }]);
        }
      }

      onPatchChartData({ slicer: nextPatch });
    };
    window.addEventListener("dashboard:slicer-sync", handler as EventListener);
    return () => window.removeEventListener("dashboard:slicer-sync", handler as EventListener);
  }, [syncGroup, chartId, mode, slicer, onPatchChartData, writeDateFilterToStore, writeNumericRangeFilterToStore, replaceFiltersForChart, effectiveFilterTargetChartId, fieldRef, effectiveScope, pageKey]);

  useEffect(() => {
    if (!syncGroup) return;
    if (suppressNextSyncBroadcastRef.current) {
      suppressNextSyncBroadcastRef.current = false;
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("dashboard:slicer-sync", {
        detail: {
          group: syncGroup,
          senderChartId: chartId,
          mode,
          selectedValues: Array.isArray(slicer.selectedValues) ? slicer.selectedValues : [],
          dateOp,
          dateFrom,
          dateTo,
          dateMode,
          relativeAmount,
          relativeUnit,
          textFilterValue,
          hierarchyPath,
        },
      }));
    } catch {}
  }, [syncGroup, chartId, mode, slicer.selectedValues, dateOp, dateFrom, dateTo, dateMode, relativeAmount, relativeUnit, textFilterValue, hierarchyPath]);

  useEffect(() => {
    const handler = () => clearSelection();
    window.addEventListener("dashboard:reset-slicers", handler as EventListener);
    return () => window.removeEventListener("dashboard:reset-slicers", handler as EventListener);
  }, [clearSelection]);

  const applyPastedValues = (raw: string) => {
    const tokens = String(raw ?? "")
      .split(/[\n,\t;]/g)
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 2000);
    if (tokens.length === 0) return;
    const pool = new Set(filteredSuggestions.map((v) => String(v)));
    const accepted = tokens.filter((v) => pool.has(v));
    if (accepted.length === 0) return;
    patchSelectedValues(Array.from(new Set(accepted)));
  };

  const guardedToggleValue = (v: string, e?: React.MouseEvent) => {
    if (forceSelection && !multiSelect && selected.has(v) && selected.size <= 1) return;
    toggleValue(v, e as any);
  };

  const onSelectAllToggle = () => {
    if (filteredSuggestions.length === 0) return;
    const allSelected = filteredSuggestions.every((v) => selected.has(v));
    patchSelectedValues(allSelected ? [] : Array.from(new Set([...Array.from(selected), ...filteredSuggestions])));
  };

  return (
    <div className="w-full h-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-900">
      {headerVisible && (
        <SlicerHeader
          title={headerLabel}
          scopeLabel={scopeLabel}
          hasSelection={hasSelection}
          sortOrder={sortOrder}
          onToggleSort={() => persistSlicerMeta({ sortOrder: sortOrder === "asc" ? "desc" : "asc" })}
          onClearSelection={clearSelection}
        />
      )}

      {sourceKind !== "parameter" && String((slicer as any).sourceKind ?? "") !== "fieldParameter" && (
        <SlicerFieldBinding
          mode={mode}
          fieldRef={fieldRef}
          hierarchyLevels={hierarchyLevels}
          isDropOver={isDropOver}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDropOver(true);
          }}
          onDragLeave={() => setIsDropOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDropOver(false);
            try {
              const parsed = parseDropEvent(e);
              if (!parsed || parsed.kind !== "field") return;
              applyDroppedFieldRef(String(parsed.field?.ref ?? ""), String(parsed.field?.semanticType ?? ""), parsed.field?.fieldType);
            } catch {}
          }}
          onClearField={() => applyDroppedFieldRef("")}
          onClearLevels={clearHierarchyLevels}
        />
      )}

      <div className="mt-3">
        {hasFieldParameterBinding && (
          <div className="space-y-2">
            {mode === "dropdown" ? (
              <select
                value={fieldParamSelectedRef}
                onChange={(e) => applyFieldParameterSelection(String(e.target.value ?? ""))}
                className="w-full h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none"
              >
                {fieldParamItems.map((it: { label: string; ref: string }) => (
                  <option key={it.ref} value={it.ref}>{it.label || it.ref}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-1">
                {fieldParamItems.map((it: { label: string; ref: string }) => {
                  const checked = fieldParamSelectedRefs.includes(it.ref);
                  return (
                    <button
                      key={it.ref}
                      type="button"
                      onClick={() => {
                        const next = new Set(fieldParamSelectedRefs);
                        if (next.has(it.ref)) next.delete(it.ref);
                        else next.add(it.ref);
                        applyFieldParameterSelections(Array.from(next) as string[]);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-slate-100 border border-slate-200"
                      title={it.ref}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-4 h-4 rounded border shrink-0 ${checked ? "bg-emerald-500/30 border-emerald-400/60" : "bg-white border-slate-300"}`}></span>
                        <span className="text-xs text-slate-900 truncate">{it.label || it.ref}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">{checked ? "on" : "off"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!hasFieldParameterBinding && mode === "list" && (
          <SlicerListMode
            hasBinding={hasBinding}
            valueSearch={valueSearch}
            onValueSearchChange={(v) => {
              setValueSearch(v);
              setSuggestQuery(v);
            }}
            filteredSuggestions={filteredSuggestions}
            suggestLoading={suggestLoading}
            suggestError={suggestError}
            selected={selected}
            multiSelect={multiSelect}
            forceSelection={forceSelection}
            orientation={orientation}
            showSelectAll={showSelectAll}
            onToggleValue={guardedToggleValue}
            onSelectAllToggle={onSelectAllToggle}
            onPasteValues={applyPastedValues}
            valuesFontSize={valuesFontSize}
            valuesBackgroundColor={valuesBackgroundColor}
          />
        )}
        {!hasFieldParameterBinding && mode === "tile" && (
          <SlicerTileMode
            hasBinding={hasBinding}
            showSearch={showSearch}
            valueSearch={valueSearch}
            onValueSearchChange={(v) => {
              setValueSearch(v);
              setSuggestQuery(v);
            }}
            filteredSuggestions={filteredSuggestions}
            suggestLoading={suggestLoading}
            suggestError={suggestError}
            selected={selected}
            multiSelect={multiSelect}
            forceSelection={forceSelection}
            orientation={orientation}
            showSelectAll={showSelectAll}
            onToggleValue={guardedToggleValue}
            onSelectAllToggle={onSelectAllToggle}
            valuesFontSize={valuesFontSize}
          />
        )}
        {!hasFieldParameterBinding && mode === "dropdown" && (
          <SlicerDropdownMode
            hasBinding={hasBinding}
            showSearch={showSearch}
            valueSearch={valueSearch}
            onValueSearchChange={(v) => {
              setValueSearch(v);
              setSuggestQuery(v);
            }}
            filteredSuggestions={filteredSuggestions}
            suggestLoading={suggestLoading}
            suggestError={suggestError}
            selected={selected}
            multiSelect={multiSelect}
            forceSelection={forceSelection}
            showSelectAll={showSelectAll}
            onToggleValue={guardedToggleValue}
            onSingleSelect={(v) => patchSelectedValues(v ? [v] : [])}
            onSelectAllToggle={onSelectAllToggle}
            onPasteValues={applyPastedValues}
          />
        )}
        {!hasFieldParameterBinding && mode === "dateRange" && (
          <SlicerDateRangeMode
            hasBinding={hasBinding}
            dateOp={dateOp}
            dateFrom={dateFrom}
            dateTo={dateTo}
            dateMode={dateMode}
            relativeAmount={relativeAmount}
            relativeUnit={relativeUnit}
            onDateOpChange={(v) => persistSlicerMeta({ dateOp: v })}
            onDateFromChange={(v) => persistSlicerMeta({ dateFrom: v })}
            onDateToChange={(v) => persistSlicerMeta({ dateTo: v })}
            onDateModeChange={(v) => persistSlicerMeta({ dateMode: v })}
            onRelativeAmountChange={(v) => persistSlicerMeta({ relativeAmount: v })}
            onRelativeUnitChange={(v) => persistSlicerMeta({ relativeUnit: v })}
            onClear={() => {
              persistSlicerMeta({ dateFrom: "", dateTo: "", selectedValues: [] });
              replaceFiltersForTarget([]);
            }}
            onApply={() => {
              persistSlicerMeta({ dateOp, dateFrom, dateTo, selectedValues: [] });
              writeDateFilterToStore(dateOp, dateFrom, dateTo);
            }}
          />
        )}
        {!hasFieldParameterBinding && mode === "range" && (
          <SlicerNumericRangeMode
            hasBinding={hasBinding}
            dateOp={dateOp}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateOpChange={(v) => persistSlicerMeta({ dateOp: v })}
            onDateFromChange={(v) => persistSlicerMeta({ dateFrom: v })}
            onDateToChange={(v) => persistSlicerMeta({ dateTo: v })}
            onClear={() => {
              persistSlicerMeta({ dateFrom: "", dateTo: "", selectedValues: [] });
              replaceFiltersForTarget([]);
            }}
            onApply={() => {
              persistSlicerMeta({ dateOp, dateFrom, dateTo, selectedValues: [] });
              writeNumericRangeFilterToStore(dateOp, dateFrom, dateTo);
            }}
          />
        )}
        {!hasFieldParameterBinding && mode === "hierarchy" && (
          <SlicerHierarchyMode
            hasBinding={hasBinding}
            valueSearch={valueSearch}
            onValueSearchChange={(v) => {
              setValueSearch(v);
              setSuggestQuery(v);
            }}
            hierarchyPath={hierarchyPath}
            hierarchyCursor={hierarchyCursor}
            restrictToLeafNodes={restrictToLeafNodes}
            filteredSuggestions={filteredSuggestions}
            suggestLoading={suggestLoading}
            suggestError={suggestError}
            onApplyLevelValue={applyHierarchyLevelValue}
            onGoBack={hierarchyGoBack}
          />
        )}
        {!hasFieldParameterBinding && mode === "input" && (
          <SlicerInputMode
            hasBinding={hasBinding}
            textFilterOp={textFilterOp}
            textFilterValue={textFilterValue}
            onTextFilterOpChange={(v) => persistSlicerMeta({ textFilterOp: v })}
            onTextFilterValueChange={(v) => persistSlicerMeta({ textFilterValue: v })}
            onClear={() => {
              persistSlicerMeta({ textFilterValue: "" });
              replaceFiltersForTarget([]);
            }}
            onApply={() => applyTextInputFilter(textFilterValue)}
          />
        )}
      </div>
    </div>
  );
}
