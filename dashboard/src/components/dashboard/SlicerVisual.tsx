"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useBiFilters, type BiFilter } from "../../store/biFiltersContext";
import { buildSemanticGlobalContext, buildSemanticRequestContext } from "../../lib/semantic/requestContext";

type DragFieldInfo = {
  ref: string;
  fieldType?: "dimension" | "measure" | "time";
  semanticType?: string;
};

type ParsedDrop = { kind: "field"; field: DragFieldInfo };

function parseDropEvent(e: React.DragEvent): ParsedDrop | null {
  const raw = e.dataTransfer.getData("application/json")
    || e.dataTransfer.getData("text/plain")
    || e.dataTransfer.getData("text")
    || "";
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
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
    const semanticType = data && typeof data === "object" ? String((data as any)?.semanticType ?? "").trim() : "";

    return {
      kind: "field",
      field: {
        ref,
        fieldType: kind === "semantic-field" && (fieldType === "dimension" || fieldType === "measure" || fieldType === "time")
          ? (fieldType as any)
          : undefined,
        semanticType: kind === "semantic-field" && semanticType ? semanticType : undefined,
      },
    };
  } catch {
    const ref = String(raw).trim();
    return ref ? { kind: "field", field: { ref } } : null;
  }
}

type SlicerMode = "list" | "dropdown" | "dateRange";

type SlicerState = {
  fieldRef?: string;
  sourceKind?: "field" | "parameter";
  parameterId?: string;
  fieldParameterId?: string;
  mode?: SlicerMode;
  multiSelect?: boolean;
  selectedValues?: string[];
  dateOp?: "between" | "gte" | "lte";
  dateFrom?: string;
  dateTo?: string;
};

function isSemanticRef(field: string): boolean {
  const s = String(field ?? "").trim();
  if (!s) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

export function SlicerVisual({
  chartId,
  chartData,
  pageKey,
  onPatchChartData,
}: {
  chartId: string;
  chartData: any;
  pageKey: string;
  onPatchChartData: (patch: any) => void;
}) {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");
  const { filters: biFilters, removeFiltersFromChart, addFilter } = useBiFilters();

  const linkedSourceChartId = useMemo(() => {
    const id = (chartData && typeof chartData === "object") ? String((chartData as any).__sourceChartId ?? "").trim() : "";
    return id || null;
  }, [chartData]);

  const effectiveFilterTargetChartId = linkedSourceChartId ?? chartId;
  const effectiveScope: "page" | "visual" = linkedSourceChartId ? "visual" : "page";

  const slicer: SlicerState = (chartData && typeof chartData === "object" && (chartData as any).slicer && typeof (chartData as any).slicer === "object")
    ? (chartData as any).slicer
    : {};

  const mode: SlicerMode = (slicer.mode === "dropdown" || slicer.mode === "dateRange" || slicer.mode === "list")
    ? slicer.mode
    : "list";

  const sourceKind: "field" | "parameter" = (slicer as any).sourceKind === "parameter" ? "parameter" : "field";
  const parameterId = String((slicer as any).parameterId ?? "").trim();
  const fieldParameterId = String((slicer as any).fieldParameterId ?? "").trim();

  const multiSelect = slicer.multiSelect !== false;
  const fieldRef = String(slicer.fieldRef ?? "").trim();
  const selected = useMemo(() => new Set(Array.isArray(slicer.selectedValues) ? slicer.selectedValues.map((x) => String(x)) : []), [slicer.selectedValues]);

  const dateOp: "between" | "gte" | "lte" = (slicer.dateOp === "between" || slicer.dateOp === "gte" || slicer.dateOp === "lte")
    ? slicer.dateOp
    : "between";
  const dateFrom = String(slicer.dateFrom ?? "");
  const dateTo = String(slicer.dateTo ?? "");

  const [valueSearch, setValueSearch] = useState("");
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestTimerRef = useRef<number | null>(null);

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
    const ref = String(direct?.ref ?? "").trim();
    return ref;
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
    onPatchChartData({
      slicer: {
        ...slicer,
        ...patch,
        fieldRef,
      },
    });
  };

  const canSuggest = useMemo(() => {
    try {
      const lsPid = typeof window !== "undefined" ? String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim() : "";
      const pid = String(urlProjectId ?? "").trim() || lsPid;
      return !!pid;
    } catch {
      return !!String(urlProjectId ?? "").trim();
    }
  }, [urlProjectId]);

  const toIsoOrNull = (v: string): string | null => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const writeDateFilterToStore = (op: "between" | "gte" | "lte", fromRaw: string, toRaw: string) => {
    removeFiltersFromChart(effectiveFilterTargetChartId);
    const fromIso = toIsoOrNull(fromRaw);
    const toIso = toIsoOrNull(toRaw);

    if (!fieldRef || !isSemanticRef(fieldRef)) return;

    if (op === "between") {
      if (!fromIso || !toIso) return;
      const f: BiFilter = {
        field: fieldRef,
        op: "between",
        values: [fromIso, toIso],
        scope: effectiveScope,
        pageKey: effectiveScope === "page" ? pageKey : undefined,
        sourceChartId: effectiveFilterTargetChartId,
      };
      addFilter(f);
      window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", {
        detail: { start: fromIso, end: toIso },
      }));
      return;
    }

    if (op === "gte") {
      if (!fromIso) return;
      const f: BiFilter = {
        field: fieldRef,
        op: "gte",
        values: [fromIso],
        scope: effectiveScope,
        pageKey: effectiveScope === "page" ? pageKey : undefined,
        sourceChartId: effectiveFilterTargetChartId,
      };
      addFilter(f);
      window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", {
        detail: { start: fromIso, end: toIso },
      }));
      return;
    }

    if (op === "lte") {
      if (!toIso) return;
      const f: BiFilter = {
        field: fieldRef,
        op: "lte",
        values: [toIso],
        scope: effectiveScope,
        pageKey: effectiveScope === "page" ? pageKey : undefined,
        sourceChartId: effectiveFilterTargetChartId,
      };
      addFilter(f);
      window.dispatchEvent(new CustomEvent("dashboard:set-global-date-range", {
        detail: { start: fromIso, end: toIso },
      }));
    }
  };

  const projectId = useMemo(() => {
    try {
      const lsPid = typeof window !== "undefined" ? String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim() : "";
      return String(urlProjectId ?? "").trim() || lsPid;
    } catch {
      return String(urlProjectId ?? "").trim();
    }
  }, [urlProjectId]);

  const writeFilterToStore = (nextSelected: string[]) => {
    if (sourceKind === "parameter") return;
    removeFiltersFromChart(effectiveFilterTargetChartId);
    const values = nextSelected.map((v) => String(v));
    if (values.length === 0) return;

    const f: BiFilter = {
      field: fieldRef,
      op: "in",
      values,
      scope: effectiveScope,
      pageKey: effectiveScope === "page" ? pageKey : undefined,
      sourceChartId: effectiveFilterTargetChartId,
    };
    addFilter(f);
  };

  const patchSelectedValues = (nextSelected: string[]) => {
    onPatchChartData({
      slicer: {
        ...slicer,
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
        window.dispatchEvent(
          new CustomEvent("dashboard:update-semantic-artifacts", {
            detail: { patch },
          })
        );
      } catch {}
      return;
    }
    writeFilterToStore(nextSelected);
  };

  const applyFieldParameterSelection = (selectedRef: string) => {
    const ref = String(selectedRef ?? "").trim();
    if (!ref) return;
    const fpIdLc = String(fieldParameterId ?? "").toLowerCase();

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:update-semantic-artifacts", {
          detail: {
            patch: {
              fieldParameterSelections: {
                [fpIdLc]: { ref },
              },
            },
          },
        })
      );
    } catch {}

    const targetChart = String((chartData as any)?.__sourceChartId ?? "").trim();
    if (!targetChart) return;
    const kind = String((fieldParamDef as any)?.kind ?? "measure") === "dimension" ? "dimension" : "measure";

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: targetChart,
          patch: {
            logicalQuery: {
              ...(kind === "measure"
                ? { measures: [ref], measuresV2: [{ ref }] }
                : { dimensions: [ref] }),
            },
          },
        },
      })
    );
  };

  const applyFieldParameterSelections = (selectedRefs: string[]) => {
    const refs = (Array.isArray(selectedRefs) ? selectedRefs : []).map((r) => String(r ?? "").trim()).filter(Boolean);
    if (refs.length === 0) return;
    const fpIdLc = String(fieldParameterId ?? "").toLowerCase();

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:update-semantic-artifacts", {
          detail: {
            patch: {
              fieldParameterSelections: {
                [fpIdLc]: { refs },
              },
            },
          },
        })
      );
    } catch {}

    const targetChart = String((chartData as any)?.__sourceChartId ?? "").trim();
    if (!targetChart) return;
    const kind = String((fieldParamDef as any)?.kind ?? "measure") === "dimension" ? "dimension" : "measure";

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: targetChart,
          patch: {
            logicalQuery: {
              ...(kind === "measure"
                ? { measures: refs, measuresV2: refs.map((ref) => ({ ref })) }
                : { dimensions: refs }),
            },
          },
        },
      })
    );
  };

  const clearSelection = () => {
    onPatchChartData({
      slicer: {
        ...slicer,
        mode,
        multiSelect,
        fieldRef,
        selectedValues: [],
        dateFrom: "",
        dateTo: "",
      },
    });
    if (sourceKind === "parameter") {
      try {
        const patch: any = {
          parameterSelections: {
            [String(parameterId ?? "").toLowerCase()]: { values: [] },
          },
        };
        window.dispatchEvent(
          new CustomEvent("dashboard:update-semantic-artifacts", {
            detail: { patch },
          })
        );
      } catch {}
      return;
    }
    removeFiltersFromChart(effectiveFilterTargetChartId);
  };

  const toggleValue = (vRaw: string, e?: React.MouseEvent) => {
    const v = String(vRaw ?? "");
    if (!v) return;

    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const isCtrl = !!(e && ((e as any).ctrlKey || (e as any).metaKey));

    // Power BI-like behavior:
    // - single select: click selects one; clicking again clears
    // - multi select: click selects one; Ctrl/Meta+click toggles additional values
    if (!multiSelect) {
      const only = Array.from(selected)[0] ?? "";
      patchSelectedValues(only === v ? [] : [v]);
      return;
    }

    if (!isCtrl) {
      patchSelectedValues([v]);
      return;
    }

    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    patchSelectedValues(Array.from(next));
  };

  const fetchSuggestions = async (q: string) => {
    if (sourceKind === "parameter") {
      setSuggestError(null);
      setSuggestions(paramValues);
      return;
    }
    if (!fieldRef || !isSemanticRef(fieldRef)) {
      setSuggestError("Bind a semantic field first (Model.field)");
      setSuggestions([]);
      return;
    }
    if (!projectId) {
      setSuggestError("Semantic project binding not found");
      setSuggestions([]);
      return;
    }

    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const globalContext = buildSemanticGlobalContext(biFilters, { excludeField: fieldRef });
      const res = await fetch("/api/semantic/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          field: fieldRef,
          search: q,
          limit: 60,
          globalContext,
          requestContext: buildSemanticRequestContext({ chartId, pageKey }),
        }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed to load values (${res.status})`);
      const vals = Array.isArray(json?.data?.values) ? json.data.values : [];
      setSuggestions(vals.map((x: any) => String(x)).filter(Boolean));
    } catch (err: any) {
      setSuggestions([]);
      setSuggestError(err instanceof Error ? err.message : "Failed to load values");
    } finally {
      setSuggestLoading(false);
    }
  };

  useEffect(() => {
    if (sourceKind === "parameter") {
      setSuggestions(paramValues);
      return;
    }
    if (!canSuggest) return;
    if (!fieldRef) return;
    if (suggestTimerRef.current) {
      window.clearTimeout(suggestTimerRef.current);
      suggestTimerRef.current = null;
    }
    const q = String(suggestQuery ?? "").trim();
    suggestTimerRef.current = window.setTimeout(() => {
      void fetchSuggestions(q);
    }, 250) as any;
    return () => {
      if (suggestTimerRef.current) {
        window.clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestQuery, canSuggest, fieldRef, pageKey, chartId]);

  useEffect(() => {
    if (sourceKind !== "parameter") return;
    onPatchChartData({
      slicer: {
        ...slicer,
        sourceKind,
        parameterId,
        selectedValues: paramSelected,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKind, parameterId]);

  const filteredSuggestions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, valueSearch]);

  const hasBinding = !!fieldRef;
  const hasParameterBinding = sourceKind === "parameter" && !!parameterId;
  const hasFieldParameterBinding = String((slicer as any).sourceKind ?? "") === "fieldParameter" && !!fieldParameterId;

  const headerLabel = (() => {
    const sk = String((slicer as any).sourceKind ?? "");
    if (sk === "fieldParameter") return String((fieldParamDef as any)?.name ?? "").trim() || fieldParameterId || "Field parameter";
    if (sourceKind === "parameter") return (String((paramDef as any)?.name ?? "").trim() || parameterId || "Parameter");
    return fieldRef || "Slicer";
  })();

  const hasSelection = useMemo(() => {
    if (mode === "dateRange") return !!String(dateFrom ?? "").trim() || !!String(dateTo ?? "").trim();
    return Array.isArray(slicer.selectedValues) && slicer.selectedValues.length > 0;
  }, [dateFrom, dateTo, mode, slicer.selectedValues]);

  const [isDropOver, setIsDropOver] = useState(false);

  const applyDroppedFieldRef = (nextRef: string) => {
    const ref = String(nextRef ?? "").trim();
    if (ref === "__time__") return;
    onPatchChartData({
      kind: "slicer",
      slicer: {
        ...slicer,
        sourceKind: "field",
        parameterId: "",
        fieldRef: ref,
        selectedValues: [],
        dateFrom: "",
        dateTo: "",
      },
    });
  };

  return (
    <div className="w-full h-full bg-slate-950/40" style={{ padding: 10 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200 truncate">{headerLabel}</div>
        </div>
        <div className="flex items-center gap-1">
          {hasSelection && (
            <button
              type="button"
              onClick={clearSelection}
              className="p-1.5 rounded-md hover:bg-white/10 text-slate-300"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {sourceKind !== "parameter" && String((slicer as any).sourceKind ?? "") !== "fieldParameter" && (
        <div
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
              applyDroppedFieldRef(String(parsed.field?.ref ?? ""));
            } catch {}
          }}
          className={`mt-2 rounded-xl border px-3 py-2 transition ${
            isDropOver
              ? "border-emerald-400/30 bg-emerald-500/10"
              : "border-white/10 bg-white/[0.03]"
          }`}
          title="Drag a field from Fields panel"
        >
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Field</div>
          <div className="mt-1">
            {fieldRef ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[11px] font-semibold text-white truncate">
                  {fieldRef}
                </div>
                <button
                  type="button"
                  onClick={() => applyDroppedFieldRef("")}
                  className="p-1.5 rounded-md hover:bg-white/10 text-slate-300"
                  title="Clear field"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 py-1">{isDropOver ? "Drop here" : "Drag field here"}</div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3">
        {String((slicer as any).sourceKind ?? "") === "fieldParameter" && hasFieldParameterBinding && (
          <div className="space-y-2">
            {mode === "dropdown" ? (
              <select
                value={fieldParamSelectedRef}
                onChange={(e) => {
                  const v = String(e.target.value ?? "");
                  applyFieldParameterSelection(v);
                }}
                className="w-full h-10 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none"
                title="Select field"
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
                      className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 border border-white/10"
                      title={it.ref}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-4 h-4 rounded border shrink-0 ${checked ? "bg-emerald-500/30 border-emerald-400/60" : "bg-white/5 border-white/15"}`}></span>
                        <span className="text-xs text-slate-100 truncate">{it.label || it.ref}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">{checked ? "on" : "off"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === "dateRange" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={dateOp}
                onChange={(e) => {
                  const next = String(e.target.value);
                  if (next !== "between" && next !== "gte" && next !== "lte") return;
                  persistSlicerMeta({ dateOp: next as any });
                }}
                disabled={!hasBinding}
                className="h-10 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none disabled:opacity-50"
                title="Operator"
              >
                <option value="between">Between</option>
                <option value="gte">After (&gt;=)</option>
                <option value="lte">Before (&lt;=)</option>
              </select>

              <select
                value="absolute"
                disabled
                className="h-10 px-3 rounded-xl bg-black/10 border border-white/10 text-sm text-slate-500 outline-none"
                title="Relative date (disabled)"
              >
                <option value="absolute">Absolute</option>
                <option value="relative">Relative date</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => persistSlicerMeta({ dateFrom: e.target.value })}
                disabled={!hasBinding || dateOp === "lte"}
                className="h-10 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none disabled:opacity-50"
                title="From"
              />

              <input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => persistSlicerMeta({ dateTo: e.target.value })}
                disabled={!hasBinding || dateOp === "gte"}
                className="h-10 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none disabled:opacity-50"
                title="To"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  persistSlicerMeta({ dateFrom: "", dateTo: "", selectedValues: [] });
                  removeFiltersFromChart(chartId);
                }}
                disabled={!hasBinding}
                className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 disabled:opacity-50"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => {
                  persistSlicerMeta({ dateOp, dateFrom, dateTo, selectedValues: [] });
                  writeDateFilterToStore(dateOp, dateFrom, dateTo);
                }}
                disabled={!hasBinding}
                className="h-9 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-xs text-emerald-100 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        {mode !== "dropdown" && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={valueSearch}
              onChange={(e) => {
                const v = e.target.value;
                setValueSearch(v);
                setSuggestQuery(v);
              }}
              placeholder={hasBinding ? "Search values..." : ""}
              disabled={!hasBinding}
              className="w-full bg-black/20 border border-white/10 focus:border-emerald-400/60 outline-none rounded-xl pl-9 pr-3 py-2 text-sm text-white disabled:opacity-50"
            />
          </div>
        )}

        {mode === "dropdown" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={valueSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setValueSearch(v);
                  setSuggestQuery(v);
                }}
                placeholder={hasBinding ? "Search values..." : ""}
                disabled={!hasBinding}
                className="w-full bg-black/20 border border-white/10 focus:border-emerald-400/60 outline-none rounded-xl pl-9 pr-3 py-2 text-sm text-white disabled:opacity-50"
              />
            </div>

            {!multiSelect && (
              <select
                value={Array.from(selected)[0] ?? ""}
                onChange={(e) => {
                  const v = String(e.target.value ?? "");
                  patchSelectedValues(v ? [v] : []);
                }}
                disabled={!hasBinding}
                className="w-full h-10 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none disabled:opacity-50"
                title="Select value"
              >
                <option value="">(none)</option>
                {filteredSuggestions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            )}

            {multiSelect && (
              <select
                multiple
                value={Array.from(selected)}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map((o) => String(o.value));
                  patchSelectedValues(opts);
                }}
                disabled={!hasBinding}
                className="w-full h-[180px] px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none disabled:opacity-50"
                title="Select values"
              >
                {filteredSuggestions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {suggestError && (
          <div className="mt-2 text-xs text-rose-300">{suggestError}</div>
        )}

        {suggestLoading && (
          <div className="mt-2 text-xs text-slate-500">Loading…</div>
        )}

        {mode === "list" && (
          <div className="mt-2 max-h-[260px] overflow-auto custom-scrollbar">
            {filteredSuggestions.length === 0 && hasBinding && !suggestLoading && !suggestError && (
              <div className="text-xs text-slate-500 py-2">No values</div>
            )}
            <div className="space-y-1">
              {filteredSuggestions.map((v) => {
                const checked = selected.has(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={(e) => toggleValue(v, e)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-left"
                    title={v}
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-slate-200 truncate">{v}</div>
                    </div>
                    <div className={`w-4 h-4 rounded border shrink-0 ${checked ? "bg-emerald-500/30 border-emerald-400/60" : "bg-white/5 border-white/15"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
