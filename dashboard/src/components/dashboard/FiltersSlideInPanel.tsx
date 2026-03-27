"use client";

import { Filter, Plus } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBiFilters, type BiFilter, type BiFilterOp, type BiPageScopeMode } from "../../store/biFiltersContext";
import { buildSemanticGlobalContext, buildSemanticRequestContext } from "../../lib/semantic/requestContext";

const OP_LABELS: Record<string, string> = {
  eq: "is equal to",
  neq: "is not equal to",
  in: "is in list",
  not_in: "is not in list",
  between: "is between",
  not_between: "is not between",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to",
  contains: "contains",
  icontains: "contains (case-insensitive)",
  notcontains: "does not contain",
  noticontains: "does not contain (case-insensitive)",
  startswith: "starts with",
  istartswith: "starts with (case-insensitive)",
  endswith: "ends with",
  iendswith: "ends with (case-insensitive)",
  isnull: "is null",
  isnotnull: "is not null",
};

function isSemanticRef(field: string): boolean {
  const s = String(field ?? "").trim();
  if (!s) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

export function FiltersSlideInPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const raw = String(window.localStorage.getItem("dashboard:filtersPanelWidth") ?? "").trim();
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
      window.localStorage.setItem("dashboard:filtersPanelWidth", String(panelWidth));
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:panel-width-changed", {
          detail: { panel: "filters", width: panelWidth },
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

  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");

  const {
    filters: biFilters,
    addFilter,
    setFilters,
    removeFiltersFromChart,
    removeFiltersByScope,
    pageScopeMode,
    setPageScopeMode,
    activePageKey,
    setActivePageKey,
    removePageFiltersForKey,
  } = useBiFilters();
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeChartData, setActiveChartData] = useState<any>(null);
  const activeChartIdRef = useRef<string | null>(null);
  activeChartIdRef.current = activeChartId;

  const effectivePageKey = useMemo(() => {
    return pageScopeMode === "tab" ? (activeTabId ? String(activeTabId) : "tab:unknown") : "dashboard";
  }, [pageScopeMode, activeTabId]);

  const [newField, setNewField] = useState<string>("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"basic" | "advanced">("basic");
  const [editingKey, setEditingKey] = useState<string>("");
  const [editingDraft, setEditingDraft] = useState<BiFilter | null>(null);
  const [valueSearch, setValueSearch] = useState<string>("");
  const [suggestQuery, setSuggestQuery] = useState<string>("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestRafRef = useRef<number | null>(null);
  const [semanticDebug, setSemanticDebug] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const fieldResolveSeqRef = useRef(0);
  const [confirmClearScope, setConfirmClearScope] = useState<null | "visual" | "page" | "report">(null);

  const opLabel = useCallback((op: unknown) => {
    const k = String(op ?? "eq").toLowerCase();
    return OP_LABELS[k] ?? k;
  }, []);

  const resolveToSemanticRef = async (rawField: string): Promise<string> => {
    const field = String(rawField ?? "").trim();
    if (!field) return "";
    if (isSemanticRef(field)) return field;

    let projectId = "";
    try {
      const lsPid = String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
      projectId = String(urlProjectId ?? "").trim() || lsPid;
    } catch {
      projectId = String(urlProjectId ?? "").trim();
    }
    if (!projectId) return "";

    try {
      const bindingRes = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const bindingJson = await bindingRes.json().catch(() => ({}));
      const modelJson = bindingJson?.data?.model?.model_json ?? null;
      if (!modelJson || typeof modelJson !== "object") return "";
      const modelsObj = (modelJson as any)?.models && typeof (modelJson as any).models === "object" ? (modelJson as any).models : {};
      const modelNames = Object.keys(modelsObj);
      if (modelNames.length === 0) return "";

      const preferredSourceModel = (() => {
        const sm = String(activeChartData?.logicalQuery?.sourceModel ?? "").trim();
        return sm && Object.prototype.hasOwnProperty.call(modelsObj, sm) ? sm : "";
      })();

      const tryModel = (mn: string): string => {
        const m = (modelJson as any)?.models?.[mn];
        if (!m || typeof m !== "object") return "";
        const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
        const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
        const found = [...dims, ...meas].find((k) => k.toLowerCase() === field.toLowerCase());
        return found ? `${mn}.${found}` : "";
      };

      if (preferredSourceModel) {
        const hit = tryModel(preferredSourceModel);
        if (hit) return hit;
      }

      const hits: string[] = [];
      for (const mn of modelNames) {
        const h = tryModel(mn);
        if (h) hits.push(h);
      }
      if (hits.length === 1) return hits[0];
      return "";
    } catch {
      return "";
    }
  };

  const makeKey = (f: BiFilter) => {
    return `${String(f.scope ?? "visual")}|${String(f.pageKey ?? "")}|${String(f.sourceChartId ?? "")}|${String(f.field ?? "")}|${String(f.op ?? "")}|${JSON.stringify(f.values ?? [])}`;
  };

  const openEditor = (f: BiFilter) => {
    setIsEditorOpen(true);
    setEditorMode("basic");
    setEditingDraft({
      ...f,
      values: Array.isArray(f.values) ? f.values : (f.values != null ? [f.values] : []),
    });
    setEditingKey(makeKey(f));
    setIsEditorOpen(true);
    setNewField(String(f.field ?? "").trim());
    setValueSearch("");
    setSuggestQuery("");
    setSuggestError(null);
    setSuggestions([]);
    setEditorError(null);
  };

  const canUseSemanticSuggestions = useMemo(() => {
    try {
      const lsPid = typeof window !== "undefined" ? String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim() : "";
      const pid = String(urlProjectId ?? "").trim() || lsPid;
      return !!pid;
    } catch {
      return !!String(urlProjectId ?? "").trim();
    }
  }, [urlProjectId]);

  const fetchSuggestions = async (q: string) => {
    if (!editingDraft) return;
    const field = String(editingDraft.field ?? "").trim();
    if (!field) return;
    if (!isSemanticRef(field)) {
      setSuggestError("Field must be a semantic ref in format 'Model.field'");
      setSuggestions([]);
      return;
    }
    let projectId = "";
    try {
      const lsPid = String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
      projectId = String(urlProjectId ?? "").trim() || lsPid;
    } catch {}
    if (!projectId) {
      setSuggestError("Semantic project binding not found");
      return;
    }

    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const activeField = String(editingDraft.field ?? "").trim();
      const globalContext = buildSemanticGlobalContext(biFilters, { excludeField: activeField });

      const res = await fetch("/api/semantic/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          field,
          search: q,
          limit: 30,
          debug: semanticDebug,
          globalContext,
          requestContext: buildSemanticRequestContext({
            chartId: activeChartIdRef.current,
            pageKey: effectivePageKey,
          }),
        }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed to load suggestions (${res.status})`);
      const vals = Array.isArray(json?.data?.values) ? json.data.values : [];
      setSuggestions(vals.map((v: any) => String(v)));
      if (semanticDebug && json?.debug) {
        // eslint-disable-next-line no-console
        console.log("/api/semantic/values debug", json.debug);
      }
    } catch (err: any) {
      setSuggestions([]);
      setSuggestError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setSuggestLoading(false);
    }
  };

  useEffect(() => {
    if (!isEditorOpen || !editingDraft) return;
    if (!canUseSemanticSuggestions) return;
    if (suggestRafRef.current) {
      window.clearTimeout(suggestRafRef.current);
      suggestRafRef.current = null;
    }
    const q = String(suggestQuery ?? "").trim();
    suggestRafRef.current = window.setTimeout(() => {
      void fetchSuggestions(q);
    }, 250) as any;
    return () => {
      if (suggestRafRef.current) {
        window.clearTimeout(suggestRafRef.current);
        suggestRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestQuery, isEditorOpen, editingDraft?.field, canUseSemanticSuggestions]);

  useEffect(() => {
    const raw = String(editingDraft?.field ?? "").trim();
    if (!isEditorOpen || !editingDraft) return;
    if (!raw) return;
    if (isSemanticRef(raw)) return;

    const seq = ++fieldResolveSeqRef.current;
    void (async () => {
      const resolved = await resolveToSemanticRef(raw);
      if (fieldResolveSeqRef.current !== seq) return;
      if (!resolved) return;
      setEditingDraft((prev) => prev ? ({ ...prev, field: resolved }) : prev);
      setNewField(resolved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditorOpen, editingDraft?.field]);

  useEffect(() => {
    if (!isEditorOpen) return;
    if (!editorError) return;
    setEditorError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditorOpen,
    editingDraft?.field,
    editingDraft?.op,
    editingDraft?.scope,
    editingDraft?.sourceChartId,
    editingDraft?.pageKey,
    JSON.stringify(Array.isArray(editingDraft?.values) ? editingDraft?.values : []),
  ]);

  const commitEditor = async (): Promise<boolean> => {
    if (!editingDraft) return false;
    const draft = editingDraft;
    const resolved = await resolveToSemanticRef(String(draft.field ?? "").trim());
    const normalized: BiFilter = {
      field: resolved || String(draft.field ?? "").trim(),
      op: draft.op,
      values: Array.isArray(draft.values) ? draft.values : (draft.values != null ? [draft.values] : []),
      scope: draft.scope,
      sourceChartId: typeof draft.sourceChartId === "string" ? draft.sourceChartId : undefined,
      pageKey: typeof draft.pageKey === "string" ? draft.pageKey : undefined,
    };
    setEditorError(null);
    if (!normalized.field) {
      setEditorError("Field is required");
      return false;
    }
    if (!isSemanticRef(normalized.field)) {
      setEditorError("Field must be a semantic ref in format 'Model.field'");
      return false;
    }

    if ((normalized.scope ?? "visual") === "visual") {
      const cid = String(normalized.sourceChartId ?? "").trim();
      if (!cid) {
        setEditorError("Visual scope requires a selected chart");
        return false;
      }
    }
    if ((normalized.scope ?? "visual") === "page") {
      const pk = String(normalized.pageKey ?? "").trim();
      if (!pk) {
        setEditorError("Page scope requires a page key");
        return false;
      }
    }

    const values = Array.isArray(normalized.values) ? normalized.values : [];
    if (normalized.op === "between" || normalized.op === "not_between") {
      if (values.length < 2 || String(values[0] ?? "").trim() === "" || String(values[1] ?? "").trim() === "") {
        setEditorError("Between requires two values");
        return false;
      }
    }
    if (normalized.op === "in" || normalized.op === "not_in") {
      if (values.length === 0) {
        setEditorError("IN requires at least one value");
        return false;
      }
    }
    if (
      normalized.op === "eq" ||
      normalized.op === "neq" ||
      normalized.op === "contains" ||
      normalized.op === "icontains" ||
      normalized.op === "startswith" ||
      normalized.op === "istartswith" ||
      normalized.op === "endswith" ||
      normalized.op === "iendswith" ||
      normalized.op === "gt" ||
      normalized.op === "gte" ||
      normalized.op === "lt" ||
      normalized.op === "lte"
    ) {
      if (values.length < 1 || String(values[0] ?? "").trim() === "") {
        setEditorError("Value is required");
        return false;
      }
    }

    const toKey = makeKey;
    const existing = (Array.isArray(biFilters) ? biFilters : []);
    const next = existing.map((f) => (toKey(f) === editingKey ? normalized : f));
    setFilters(next);
    try {
      window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
    } catch {}
    setEditingDraft((prev) => prev ? ({ ...prev, field: normalized.field }) : prev);
    setNewField(normalized.field);
    return true;
  };

  const editorCanSave = useMemo(() => {
    if (!editingDraft) return false;
    const field = String(editingDraft.field ?? "").trim();
    if (!field) return false;
    if (!isSemanticRef(field)) return false;

    const scope = String(editingDraft.scope ?? "visual").trim();
    if (scope === "visual") {
      const cid = String(editingDraft.sourceChartId ?? "").trim();
      if (!cid) return false;
    }
    if (scope === "page") {
      const pk = String(editingDraft.pageKey ?? "").trim();
      if (!pk) return false;
    }

    const op = editingDraft.op;
    const values = Array.isArray(editingDraft.values) ? editingDraft.values : [];
    if (op === "isnull" || op === "isnotnull") return true;
    if (op === "between" || op === "not_between") return values.length >= 2 && String(values[0] ?? "").trim() !== "" && String(values[1] ?? "").trim() !== "";
    if (op === "in" || op === "not_in") return values.length > 0;
    if (
      op === "eq" ||
      op === "neq" ||
      op === "contains" ||
      op === "icontains" ||
      op === "startswith" ||
      op === "istartswith" ||
      op === "endswith" ||
      op === "iendswith" ||
      op === "gt" ||
      op === "gte" ||
      op === "lt" ||
      op === "lte"
    ) {
      return values.length >= 1 && String(values[0] ?? "").trim() !== "";
    }
    return true;
  }, [editingDraft]);

  useEffect(() => {
    const onActiveChartIdEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.chartId ? String(detail.chartId) : null;
      setActiveChartId(cid);
      const nextChartData = (detail?.chartData && typeof detail.chartData === "object") ? detail.chartData : null;
      setActiveChartData(nextChartData);
      const tid = detail?.activeTabId ? String(detail.activeTabId) : null;
      setActiveTabId(tid);
    };
    window.addEventListener("dashboard:active-chart-id", onActiveChartIdEvt as EventListener);
    return () => window.removeEventListener("dashboard:active-chart-id", onActiveChartIdEvt as EventListener);
  }, []);

  useEffect(() => {
    const onActiveTabEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const tid = detail?.activeTabId ? String(detail.activeTabId) : null;
      setActiveTabId(tid);
    };
    window.addEventListener("dashboard:active-tab-id", onActiveTabEvt as EventListener);
    return () => window.removeEventListener("dashboard:active-tab-id", onActiveTabEvt as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => {
      const report = (Array.isArray(biFilters) ? biFilters : []).filter((f: any) => (f?.scope ?? "visual") === "report");
      const first = report[0];
      if (!first) return;
      try {
        openEditor(first);
      } catch {}
    };
    window.addEventListener("dashboard:open-first-report-filter-editor", handler as EventListener);
    return () => window.removeEventListener("dashboard:open-first-report-filter-editor", handler as EventListener);
  }, [biFilters]);

  useEffect(() => {
    const handler = () => {
      void (async () => {
        try {
          const ok = await commitEditor();
          if (ok) {
            try {
              window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
            } catch {}
          }
        } catch {}
      })();
    };
    window.addEventListener("dashboard:apply-filter-editor", handler as EventListener);
    return () => window.removeEventListener("dashboard:apply-filter-editor", handler as EventListener);
  }, [editingDraft, editingKey]);

  useEffect(() => {
    if (pageScopeMode === "tab") {
      setActivePageKey(activeTabId ? String(activeTabId) : "tab:unknown");
    } else {
      setActivePageKey("dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageScopeMode, activeTabId]);

  const pageKeyLabel = useMemo(() => {
    if (pageScopeMode === "tab") return activeTabId ? `Tab ${activeTabId}` : "Tab";
    return "Dashboard";
  }, [pageScopeMode, activeTabId]);

  const removeOne = (target: BiFilter) => {
    const f = target;
    setFilters((Array.isArray(biFilters) ? biFilters : []).filter((x) => {
      if (String(x.field) !== String(f.field)) return true;
      if (String(x.op) !== String(f.op)) return true;
      if (String(x.scope ?? "visual") !== String(f.scope ?? "visual")) return true;
      if (String(x.sourceChartId ?? "") !== String(f.sourceChartId ?? "")) return true;
      if (String(x.pageKey ?? "") !== String(f.pageKey ?? "")) return true;
      return JSON.stringify(x.values ?? []) !== JSON.stringify(f.values ?? []);
    }));
    try {
      window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
    } catch {}
  };

  const onDropCreateFilter = (scope: "visual" | "page" | "report") => (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const data = JSON.parse(raw);
      const col = data?.column;
      const ref = String(col?.ref ?? "").trim();
      const table = String(col?.table ?? "").trim();
      const name = String(col?.name ?? "").trim();
      const field = ref || (table && name ? `${table}.${name}` : name);
      if (!field) return;

      void (async () => {
        const resolved = await resolveToSemanticRef(field);
        const nextField = resolved || field;

        const base: BiFilter = {
          field: nextField,
          op: "eq",
          values: [],
          scope,
        };
        if (scope === "visual") {
          if (!activeChartIdRef.current) return;
          base.sourceChartId = activeChartIdRef.current;
        }
        if (scope === "page") {
          base.pageKey = activePageKey;
        }
        if (!isSemanticRef(base.field)) return;

        addFilter(base);
        try {
          window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
        } catch {}
        setNewField(nextField);
        try {
          const created: BiFilter = {
            ...base,
            field: nextField,
          };
          openEditor(created);
        } catch {}
      })();
    } catch {}
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const visualFilters = useMemo(() => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) return [];
    return (Array.isArray(biFilters) ? biFilters : []).filter((f: any) => (f?.scope ?? "visual") === "visual" && String(f?.sourceChartId ?? "") === cid);
  }, [biFilters, activeChartId]);

  const pageFilters = useMemo(() => {
    const k = String(activePageKey ?? "").trim();
    if (!k) return [];
    return (Array.isArray(biFilters) ? biFilters : []).filter((f: any) => (f?.scope ?? "visual") === "page" && String(f?.pageKey ?? "") === k);
  }, [biFilters, activePageKey]);

  const reportFilters = useMemo(() => {
    return (Array.isArray(biFilters) ? biFilters : []).filter((f: any) => (f?.scope ?? "visual") === "report");
  }, [biFilters]);

  const editOverlayOpen = isEditorOpen && !!editingDraft;

  const addFilterByFieldPrompt = async (scope: "visual" | "page" | "report") => {
    const raw = window.prompt("Field name or semantic ref (Model.field)");
    const fieldInput = String(raw ?? "").trim();
    if (!fieldInput) return;
    const resolved = await resolveToSemanticRef(fieldInput);
    const nextField = resolved || fieldInput;
    const base: BiFilter = {
      field: nextField,
      op: "eq",
      values: [],
      scope,
    };
    if (scope === "visual") {
      if (!activeChartIdRef.current) return;
      base.sourceChartId = activeChartIdRef.current;
    }
    if (scope === "page") base.pageKey = activePageKey;
    if (!isSemanticRef(base.field)) return;
    addFilter(base);
    window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
  };

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
              <Filter className="w-4 h-4 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Filters</div>
                <div className="text-xs text-slate-400 truncate">Report-level</div>
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
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">Visual filters <span className="text-xs text-slate-500 font-normal">({visualFilters.length})</span></div>
                  <div className="text-xs text-slate-400 mt-0.5" title="Applies only to the selected chart">Applied to selected chart</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!activeChartId}
                    onClick={() => void addFilterByFieldPrompt("visual")}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add Filter
                  </button>
                  <button
                    type="button"
                    data-testid="filters-clear-visual-btn"
                    disabled={!activeChartId}
                    onClick={() => setConfirmClearScope(confirmClearScope === "visual" ? null : "visual")}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {confirmClearScope === "visual" && (
                <div className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2 text-[11px] text-rose-100 flex items-center justify-between gap-2">
                  <span>Remove all visual filters?</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setConfirmClearScope(null)} className="px-2 py-1 rounded-md border border-white/15 bg-white/5">Cancel</button>
                    <button type="button" onClick={() => { if (!activeChartId) return; removeFiltersFromChart(activeChartId); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/20">Clear</button>
                  </div>
                </div>
              )}

              <div
                onDragOver={allowDrop}
                onDrop={onDropCreateFilter("visual")}
                data-testid="filters-drop-visual"
                className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-500"
              >
                Drag field here to create a visual filter
              </div>

              <div className="mt-3 space-y-2">
                {visualFilters.length === 0 ? (
                  <div className="text-xs text-slate-500">No visual-level filters.</div>
                ) : (
                  visualFilters.map((f: any, idx: number) => (
                    <div key={`${String(f?.field)}_${idx}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-white font-semibold truncate">{String(f?.field ?? "")}</div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditor(f)}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOne(f)}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">Page filters <span className="text-xs text-slate-500 font-normal">({pageFilters.length})</span></div>
                  <div className="text-xs text-slate-400 mt-0.5" title="Applies to all charts on this page">Applied to {pageKeyLabel}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void addFilterByFieldPrompt("page")}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 transition"
                  >
                    + Add Filter
                  </button>
                  <select
                    value={pageScopeMode}
                    onChange={(e) => {
                      const v = String(e.target.value ?? "").trim() as BiPageScopeMode;
                      setPageScopeMode(v);
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-400/40"
                    title="Page scope mode"
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="tab">Tab</option>
                  </select>
                <button
                  type="button"
                  onClick={() => setConfirmClearScope(confirmClearScope === "page" ? null : "page")}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  Clear
                </button>
                </div>
              </div>
              {confirmClearScope === "page" && (
                <div className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2 text-[11px] text-rose-100 flex items-center justify-between gap-2">
                  <span>Remove all page filters?</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setConfirmClearScope(null)} className="px-2 py-1 rounded-md border border-white/15 bg-white/5">Cancel</button>
                    <button type="button" onClick={() => { removePageFiltersForKey(activePageKey); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/20">Clear</button>
                  </div>
                </div>
              )}

              <div
                onDragOver={allowDrop}
                onDrop={onDropCreateFilter("page")}
                data-testid="filters-drop-page"
                className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-500"
              >
                Drag field here to create a page filter
              </div>

              <div className="mt-3 space-y-2">
                {pageFilters.length === 0 ? (
                  <div className="text-xs text-slate-500">No page-level filters.</div>
                ) : (
                  pageFilters.map((f: any, idx: number) => (
                    <div
                      key={`${String(f?.field)}_${idx}`}
                      role="button"
                      tabIndex={0}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition cursor-pointer"
                      onClick={() => openEditor(f)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditor(f);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-white font-semibold truncate">{String(f?.field ?? "")}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid="report-filter-edit-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(f);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOne(f);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="filters-report-section">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">Report filters <span className="text-xs text-slate-500 font-normal">({reportFilters.length})</span></div>
                  <div className="text-xs text-slate-400 mt-0.5" title="Applies to all pages and visuals in the report">Applied to entire report</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void addFilterByFieldPrompt("report")}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 transition"
                  >
                    + Add Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearScope(confirmClearScope === "report" ? null : "report")}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {confirmClearScope === "report" && (
                <div className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2 text-[11px] text-rose-100 flex items-center justify-between gap-2">
                  <span>Remove all report filters?</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setConfirmClearScope(null)} className="px-2 py-1 rounded-md border border-white/15 bg-white/5">Cancel</button>
                    <button type="button" onClick={() => { removeFiltersByScope("report"); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/20">Clear</button>
                  </div>
                </div>
              )}

              <div
                onDragOver={allowDrop}
                onDrop={onDropCreateFilter("report")}
                data-testid="filters-drop-report"
                className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-500"
              >
                Drag field here to create a report filter
              </div>

              <div className="mt-3 space-y-2">
                {reportFilters.length === 0 ? (
                  <div className="text-xs text-slate-500">No report-level filters.</div>
                ) : (
                  reportFilters.map((f: any, idx: number) => (
                    <div
                      data-testid="report-filter-card"
                      key={`${String(f?.field)}_${idx}`}
                      role="button"
                      tabIndex={0}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition cursor-pointer"
                      onClick={() => openEditor(f)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditor(f);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-white font-semibold truncate">{String(f?.field ?? "")}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid="report-filter-edit-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(f);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOne(f);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {editOverlayOpen && editingDraft && (
        <div className="fixed inset-0 z-50" data-testid="filter-editor-overlay">
          <button
            type="button"
            aria-label="Close editor"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setIsEditorOpen(false);
              setEditingDraft(null);
              setEditingKey("");
            }}
          />

          <div className="absolute right-4 top-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Filter</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{String(editingDraft.field ?? "")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditorOpen(false);
                    setEditingDraft(null);
                    setEditingKey("");
                  }}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Mode</div>
                <div className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-200">
                  Basic
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Scope</div>
                <select
                  value={String(editingDraft.scope ?? "visual")}
                  onChange={(e) => {
                    const sc = String(e.target.value ?? "").trim() as any;
                    setEditingDraft((prev) => {
                      if (!prev) return prev;
                      const next: BiFilter = { ...prev, scope: sc } as any;
                      if (sc === "visual") {
                        const cid = String(activeChartIdRef.current ?? "").trim();
                        next.sourceChartId = cid || undefined;
                        next.pageKey = undefined;
                      } else if (sc === "page") {
                        next.pageKey = String(activePageKey ?? "").trim() || undefined;
                        next.sourceChartId = undefined;
                      } else {
                        next.sourceChartId = undefined;
                        next.pageKey = undefined;
                      }
                      return next;
                    });
                  }}
                  className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                >
                  <option value="visual">Visual</option>
                  <option value="page">Page</option>
                  <option value="report">Report</option>
                </select>
              </div>

              {editorMode === "basic" ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Operator</div>
                    <select
                      data-testid="filter-operator-select"
                      value={editingDraft.op}
                      onChange={(e) => {
                        const op = e.target.value as BiFilterOp;
                        setEditingDraft((prev) => {
                          if (!prev) return prev;
                          const next: BiFilter = { ...prev, op };
                          if (op === "between" || op === "not_between") {
                            const a = String(prev.values?.[0] ?? "");
                            const b = String(prev.values?.[1] ?? "");
                            next.values = [a, b];
                          } else if (op === "in" || op === "not_in") {
                            next.values = Array.isArray(prev.values) ? prev.values : [];
                          } else if (op === "isnull" || op === "isnotnull") {
                            next.values = [];
                          } else if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
                            const v = String(prev.values?.[0] ?? "");
                            next.values = [v];
                          } else {
                            const v = String(prev.values?.[0] ?? "");
                            next.values = [v];
                          }
                          return next;
                        });
                      }}
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                    >
                      <option value="eq">is</option>
                      <option value="neq">is not</option>
                      <option value="contains">contains</option>
                      <option value="icontains">contains (ignore case)</option>
                      <option value="startswith">starts with</option>
                      <option value="istartswith">starts with (ignore case)</option>
                      <option value="endswith">ends with</option>
                      <option value="iendswith">ends with (ignore case)</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">&gt;=</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">&lt;=</option>
                      <option value="in">is any of</option>
                      <option value="not_in">is none of</option>
                      <option value="between">is between</option>
                      <option value="not_between">is not between</option>
                      <option value="isnull">is empty (NULL)</option>
                      <option value="isnotnull">is not empty (NOT NULL)</option>
                      <option value="between" disabled>Relative date (soon)</option>
                    </select>
                  </div>

                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Value(s)</div>
                    {editingDraft.op === "between" || editingDraft.op === "not_between" ? (
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <input
                          data-testid="filter-between-from"
                          type="text"
                          value={String(editingDraft.values?.[0] ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditingDraft((prev) => prev ? ({ ...prev, values: [v, String(prev.values?.[1] ?? "")] }) : prev);
                          }}
                          placeholder="from"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        />
                        <input
                          data-testid="filter-between-to"
                          type="text"
                          value={String(editingDraft.values?.[1] ?? "")}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditingDraft((prev) => prev ? ({ ...prev, values: [String(prev.values?.[0] ?? ""), v] }) : prev);
                          }}
                          placeholder="to"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        />
                      </div>
                    ) : editingDraft.op === "in" || editingDraft.op === "not_in" ? (
                      <div className="mt-1">
                        <input
                          type="text"
                          value={valueSearch}
                          onChange={(e) => setValueSearch(e.target.value)}
                          placeholder="Type and press Enter to add"
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const v = String(valueSearch ?? "").trim();
                            if (!v) return;
                            setEditingDraft((prev) => {
                              if (!prev) return prev;
                              const arr = Array.isArray(prev.values) ? prev.values.map((x) => String(x)) : [];
                              if (!arr.includes(v)) arr.push(v);
                              return { ...prev, values: arr };
                            });
                            setValueSearch("");
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        />

                        <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                          <div className="text-[11px] uppercase tracking-wider text-slate-500">Suggestions</div>
                          {!canUseSemanticSuggestions ? (
                            <div className="mt-1 text-xs text-slate-500">No semantic suggestions available. Use manual entry.</div>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={suggestQuery}
                                onChange={(e) => setSuggestQuery(e.target.value)}
                                placeholder="Search values..."
                                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                              />
                              {suggestLoading ? (
                                <div className="mt-2 text-xs text-slate-500">Loading…</div>
                              ) : suggestError ? (
                                <div className="mt-2 text-xs text-amber-300">{suggestError}</div>
                              ) : suggestions.length === 0 ? (
                                <div className="mt-2 text-xs text-slate-500">No matches</div>
                              ) : (
                                <div className="mt-2 max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                  {suggestions.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => {
                                        setEditingDraft((prev) => {
                                          if (!prev) return prev;
                                          const arr = Array.isArray(prev.values) ? prev.values.map((x) => String(x)) : [];
                                          if (!arr.includes(s)) arr.push(s);
                                          return { ...prev, values: arr };
                                        });
                                      }}
                                      className="w-full text-left px-2 py-1 rounded-md border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10 transition"
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {(Array.isArray(editingDraft.values) ? editingDraft.values : []).map((v: any, i: number) => (
                            <button
                              key={`${String(v)}_${i}`}
                              type="button"
                              onClick={() => {
                                setEditingDraft((prev) => {
                                  if (!prev) return prev;
                                  const arr = Array.isArray(prev.values) ? prev.values : [];
                                  return { ...prev, values: arr.filter((_: any, idx: number) => idx !== i) };
                                });
                              }}
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                            >
                              {String(v)} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <input
                        data-testid="filter-single-value"
                        type="text"
                        value={String(editingDraft.values?.[0] ?? "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditingDraft((prev) => prev ? ({ ...prev, values: [v] }) : prev);
                        }}
                        placeholder="value"
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                      />
                    )}

                    {editorError ? (
                      <div className="mt-2 text-xs text-amber-300">{editorError}</div>
                    ) : null}

                    {(
                      editingDraft.op === "eq" ||
                      editingDraft.op === "neq" ||
                      editingDraft.op === "contains" ||
                      editingDraft.op === "icontains" ||
                      editingDraft.op === "startswith" ||
                      editingDraft.op === "istartswith" ||
                      editingDraft.op === "endswith" ||
                      editingDraft.op === "iendswith"
                    ) && (
                      <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-2">
                        <div className="text-[11px] uppercase tracking-wider text-slate-500">Suggestions</div>
                        {process.env.NODE_ENV !== "production" && (
                          <label className="mt-1 flex items-center gap-2 text-xs text-slate-400 select-none">
                            <input
                              type="checkbox"
                              checked={semanticDebug}
                              onChange={(e) => setSemanticDebug(e.target.checked)}
                            />
                            debug
                          </label>
                        )}
                        {!canUseSemanticSuggestions ? (
                          <div className="mt-1 text-xs text-slate-500">No semantic suggestions available. Use manual entry.</div>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={suggestQuery}
                              onChange={(e) => setSuggestQuery(e.target.value)}
                              placeholder="Search values..."
                              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                            />
                            {suggestLoading ? (
                              <div className="mt-2 text-xs text-slate-500">Loading…</div>
                            ) : suggestError ? (
                              <div className="mt-2 text-xs text-amber-300">{suggestError}</div>
                            ) : suggestions.length === 0 ? (
                              <div className="mt-2 text-xs text-slate-500">No matches</div>
                            ) : (
                              <div className="mt-2 max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                                {suggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => {
                                      setEditingDraft((prev) => (prev ? ({ ...prev, values: [s] }) : prev));
                                    }}
                                    className="w-full text-left px-2 py-1 rounded-md border border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10 transition"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs text-slate-400">
                    Advanced filtering is a placeholder for now. Next step: add expression builder / AND-OR groups.
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!editingDraft) return;
                  setEditingDraft({ ...editingDraft, values: [] });
                }}
                className="px-3 py-2 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                Clear values
              </button>
              <button
                type="button"
                disabled={!editorCanSave}
                data-testid="filter-apply-btn"
                onClick={async () => {
                  const ok = await commitEditor();
                  if (!ok) return;
                  setIsEditorOpen(false);
                  setEditingDraft(null);
                  setEditingKey("");
                }}
                className="px-3 py-2 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
