"use client";

import { Filter, Plus, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBiFilters, type BiFilter, type BiFilterOp, type BiPageScopeMode } from "../../store/biFiltersContext";
import { buildSemanticGlobalContext, buildSemanticRequestContext, SEMANTIC_REF_RE } from "../../lib/semantic/requestContext";
import { computeEffectivePageKey } from "../../lib/computeEffectivePageKey";

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
  top_n: "Top N",
};

function isSemanticRef(field: string): boolean {
  const s = String(field ?? "").trim();
  return !!s && SEMANTIC_REF_RE.test(s);
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
  const biFiltersRef = useRef<BiFilter[]>(Array.isArray(biFilters) ? biFilters : []);
  useEffect(() => {
    biFiltersRef.current = Array.isArray(biFilters) ? biFilters : [];
  }, [biFilters]);
  const dismissedAutoFiltersRef = useRef<Set<string>>(new Set());
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeChartData, setActiveChartData] = useState<any>(null);
  const activeChartIdRef = useRef<string | null>(null);
  activeChartIdRef.current = activeChartId;

  const effectivePageKey = useMemo(() => {
    return computeEffectivePageKey(pageScopeMode, activeTabId);
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
  const suggestAbortRef = useRef<AbortController | null>(null);
  const [semanticDebug, setSemanticDebug] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const fieldResolveSeqRef = useRef(0);
  const [confirmClearScope, setConfirmClearScope] = useState<null | "visual" | "page" | "report">(null);
  /** When true, filter row shows operator + values preview (Power BI–style expand). */
  const [expandedFilterRows, setExpandedFilterRows] = useState<Record<string, boolean>>({});
  const [filterSearch, setFilterSearch] = useState("");
  const [accordionOpen, setAccordionOpen] = useState<Record<"visual" | "page" | "report", boolean>>({
    visual: true,
    page: true,
    report: true,
  });
  const [addByNameFor, setAddByNameFor] = useState<null | "visual" | "page" | "report">(null);
  const [addByNameValue, setAddByNameValue] = useState("");

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
    if (suggestAbortRef.current) suggestAbortRef.current.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;
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
        signal: controller.signal,
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
      if (err?.name === "AbortError") return;
      setSuggestions([]);
      setSuggestError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      if (suggestAbortRef.current === controller) {
        setSuggestLoading(false);
      }
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
      if (suggestAbortRef.current) {
        suggestAbortRef.current.abort();
        suggestAbortRef.current = null;
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
      logicGroup: typeof (draft as any).logicGroup === "string" ? String((draft as any).logicGroup).trim() || undefined : undefined,
      logicOp: String((draft as any).logicOp ?? "and").toLowerCase() === "or" ? "or" : "and",
      fieldAlias: typeof (draft as any).fieldAlias === "string" ? String((draft as any).fieldAlias).trim() || undefined : undefined,
      topN: (draft as any).topN && typeof (draft as any).topN === "object" ? {
        mode: String((draft as any).topN.mode ?? "top") === "bottom" ? "bottom" : "top",
        n: Math.max(1, Number((draft as any).topN.n ?? 10) || 10),
        byMeasure: String((draft as any).topN.byMeasure ?? "").trim(),
      } : undefined,
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
    if (normalized.op === "top_n") {
      const n = Number((normalized.topN as any)?.n ?? values?.[0] ?? 0);
      const byMeasure = String((normalized.topN as any)?.byMeasure ?? values?.[1] ?? "").trim();
      if (!Number.isFinite(n) || n <= 0) {
        setEditorError("Top N requires a positive N");
        return false;
      }
      if (!byMeasure || !isSemanticRef(byMeasure)) {
        setEditorError("Top N requires measure ref in format Model.field");
        return false;
      }
      normalized.values = [Math.floor(n), byMeasure, String((normalized.topN as any)?.mode ?? "top")];
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
    const existing = biFiltersRef.current;
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
    if (op === "top_n") {
      const n = Number((editingDraft as any)?.topN?.n ?? values?.[0] ?? 0);
      const by = String((editingDraft as any)?.topN?.byMeasure ?? values?.[1] ?? "").trim();
      return Number.isFinite(n) && n > 0 && isSemanticRef(by);
    }
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
    dismissedAutoFiltersRef.current = new Set();
  }, [activeChartId]);

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
    if (
      String(f.scope ?? "visual") === "visual"
      && String(f.sourceChartId ?? "").trim()
      && isSemanticRef(String(f.field ?? "").trim())
    ) {
      dismissedAutoFiltersRef.current.add(`${String(f.sourceChartId ?? "").trim()}:${String(f.field ?? "").trim()}`);
    }
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

  useEffect(() => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) return;
    const logicalQuery = ((activeChartData as any)?.logicalQuery && typeof (activeChartData as any).logicalQuery === "object")
      ? (activeChartData as any).logicalQuery
      : null;
    if (!logicalQuery) return;

    const autoFields = [
      ...(Array.isArray((logicalQuery as any)?.dimensions) ? (logicalQuery as any).dimensions : []),
      ...(Array.isArray((logicalQuery as any)?.measures) ? (logicalQuery as any).measures : []),
    ]
      .map((x: any) => String(x ?? "").trim())
      .filter(Boolean);
    if (autoFields.length === 0) return;

    const existing = (Array.isArray(biFilters) ? biFilters : [])
      .filter((f: any) => (f?.scope ?? "visual") === "visual" && String(f?.sourceChartId ?? "").trim() === cid)
      .map((f: any) => String(f?.field ?? "").trim());
    const existingSet = new Set(existing);
    for (const field of autoFields) {
      if (!isSemanticRef(field)) continue;
      if (existingSet.has(field)) continue;
      if (dismissedAutoFiltersRef.current.has(`${cid}:${field}`)) continue;
      addFilter({
        field,
        op: "eq",
        values: [],
        scope: "visual",
        sourceChartId: cid,
      });
    }
  }, [activeChartId, activeChartData, biFilters, addFilter]);

  const editOverlayOpen = isEditorOpen && !!editingDraft;

  const addFilterByFieldInput = async (scope: "visual" | "page" | "report", rawInput: string) => {
    const fieldInput = String(rawInput ?? "").trim();
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
    setAddByNameValue("");
    setAddByNameFor(null);
    window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
    try {
      openEditor({ ...base, field: nextField });
    } catch {}
  };

  const filterMatchesQuery = (f: BiFilter, q: string): boolean => {
    const s = String(q ?? "").trim().toLowerCase();
    if (!s) return true;
    const field = String(f.field ?? "").toLowerCase();
    const op = opLabel(f.op).toLowerCase();
    const vals = Array.isArray(f.values) ? f.values.map((v) => String(v).toLowerCase()).join(" ") : "";
    return field.includes(s) || op.includes(s) || vals.includes(s);
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
                <div className="text-xs text-slate-400 truncate">On this visual, page, or all pages</div>
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

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search"
              className="w-full rounded-md border border-white/10 bg-white/[0.06] py-1.5 pl-8 pr-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400/30 focus:outline-none"
            />
          </div>

          <div className="space-y-0 divide-y divide-white/10 rounded-md border border-white/10 bg-white/[0.02]">
            {/* Visual */}
            <div className="p-2">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 py-1 text-left"
                onClick={() => setAccordionOpen((prev) => ({ ...prev, visual: !prev.visual }))}
              >
                <span className="text-[11px] font-medium text-slate-200">
                  {accordionOpen.visual ? "▾" : "▸"} Filters on this visual
                  <span className="ml-1 font-normal text-slate-500">({visualFilters.length})</span>
                </span>
              </button>
              {accordionOpen.visual && (
                <div className="mt-1 space-y-2 pl-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      disabled={!activeChartId}
                      onClick={() => {
                        setAddByNameFor((s) => (s === "visual" ? null : "visual"));
                        setAddByNameValue("");
                      }}
                      className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-40"
                    >
                      + Add by name
                    </button>
                    <button
                      type="button"
                      data-testid="filters-clear-visual-btn"
                      disabled={!activeChartId}
                      onClick={() => setConfirmClearScope(confirmClearScope === "visual" ? null : "visual")}
                      className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
                    >
                      Clear all
                    </button>
                  </div>
                  {addByNameFor === "visual" && (
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        value={addByNameValue}
                        onChange={(e) => setAddByNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void addFilterByFieldInput("visual", addByNameValue);
                        }}
                        placeholder="Model.field"
                        className="min-w-[140px] flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => void addFilterByFieldInput("visual", addByNameValue)}
                        className="rounded border border-white/15 bg-white/10 px-2 py-1 text-[10px] text-slate-200"
                      >
                        Add
                      </button>
                      <button type="button" onClick={() => { setAddByNameFor(null); setAddByNameValue(""); }} className="text-[10px] text-slate-500 hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                  {confirmClearScope === "visual" && (
                    <div className="flex items-center justify-between gap-2 rounded border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-100">
                      <span>Remove all visual filters?</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirmClearScope(null)} className="rounded border border-white/15 px-1.5 py-0.5">Cancel</button>
                        <button type="button" onClick={() => { if (!activeChartId) return; removeFiltersFromChart(activeChartId); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="rounded border border-rose-500/30 px-1.5 py-0.5">Clear</button>
                      </div>
                    </div>
                  )}
                  <div
                    onDragOver={allowDrop}
                    onDrop={onDropCreateFilter("visual")}
                    data-testid="filters-drop-visual"
                    className="border-t border-dashed border-white/10 py-1.5 text-center text-[10px] italic text-slate-500"
                  >
                    Drop a field here
                  </div>
                  <div className="space-y-1">
                    {visualFilters.filter((f) => filterMatchesQuery(f, filterSearch)).length === 0 ? (
                      <div className="text-[10px] text-slate-500">No filters in this section.</div>
                    ) : (
                      visualFilters.filter((f) => filterMatchesQuery(f, filterSearch)).map((f: BiFilter, idx: number) => {
                        const fk = makeKey(f);
                        return (
                          <div key={`${String(f?.field)}_${idx}`} className="flex items-start gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => setExpandedFilterRows((prev) => ({ ...prev, [fk]: !prev[fk] }))}
                            >
                              <div className="truncate text-[10px] font-medium text-slate-100">{String(f?.field ?? "")}</div>
                              {expandedFilterRows[fk] ? (
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                                </div>
                              ) : null}
                            </button>
                            <button type="button" data-testid="visual-filter-edit-btn" onClick={() => openEditor(f)} className="shrink-0 text-[10px] text-emerald-300/90 hover:text-emerald-200" title="Edit">
                              ✎
                            </button>
                            <button type="button" onClick={() => removeOne(f)} className="shrink-0 text-[10px] text-slate-400 hover:text-rose-300" title="Remove">
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Page */}
            <div className="p-2">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 py-1 text-left"
                onClick={() => setAccordionOpen((prev) => ({ ...prev, page: !prev.page }))}
              >
                <span className="text-[11px] font-medium text-slate-200">
                  {accordionOpen.page ? "▾" : "▸"} Filters on this page
                  <span className="ml-1 font-normal text-slate-500">({pageFilters.length})</span>
                </span>
              </button>
              {accordionOpen.page && (
                <div className="mt-1 space-y-2 pl-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      value={pageScopeMode}
                      onChange={(e) => {
                        const v = String(e.target.value ?? "").trim() as BiPageScopeMode;
                        setPageScopeMode(v);
                      }}
                      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-200"
                      title="Page scope mode"
                    >
                      <option value="dashboard">Dashboard</option>
                      <option value="tab">Tab</option>
                    </select>
                    <span className="text-[10px] text-slate-500">{pageKeyLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddByNameFor((s) => (s === "page" ? null : "page"));
                        setAddByNameValue("");
                      }}
                      className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20"
                    >
                      + Add by name
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope(confirmClearScope === "page" ? null : "page")}
                      className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                    >
                      Clear all
                    </button>
                  </div>
                  {addByNameFor === "page" && (
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        value={addByNameValue}
                        onChange={(e) => setAddByNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void addFilterByFieldInput("page", addByNameValue);
                        }}
                        placeholder="Model.field"
                        className="min-w-[140px] flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200"
                      />
                      <button type="button" onClick={() => void addFilterByFieldInput("page", addByNameValue)} className="rounded border border-white/15 bg-white/10 px-2 py-1 text-[10px] text-slate-200">
                        Add
                      </button>
                      <button type="button" onClick={() => { setAddByNameFor(null); setAddByNameValue(""); }} className="text-[10px] text-slate-500 hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                  {confirmClearScope === "page" && (
                    <div className="flex items-center justify-between gap-2 rounded border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-100">
                      <span>Remove all page filters?</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirmClearScope(null)} className="rounded border border-white/15 px-1.5 py-0.5">Cancel</button>
                        <button type="button" onClick={() => { removePageFiltersForKey(activePageKey); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="rounded border border-rose-500/30 px-1.5 py-0.5">Clear</button>
                      </div>
                    </div>
                  )}
                  <div
                    onDragOver={allowDrop}
                    onDrop={onDropCreateFilter("page")}
                    data-testid="filters-drop-page"
                    className="border-t border-dashed border-white/10 py-1.5 text-center text-[10px] italic text-slate-500"
                  >
                    Drop a field here
                  </div>
                  <div className="space-y-1">
                    {pageFilters.filter((f) => filterMatchesQuery(f, filterSearch)).length === 0 ? (
                      <div className="text-[10px] text-slate-500">No filters in this section.</div>
                    ) : (
                      pageFilters.filter((f) => filterMatchesQuery(f, filterSearch)).map((f: BiFilter, idx: number) => {
                        const fk = makeKey(f);
                        return (
                          <div key={`${String(f?.field)}_${idx}`} className="flex items-start gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5">
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpandedFilterRows((prev) => ({ ...prev, [fk]: !prev[fk] }))}>
                              <div className="truncate text-[10px] font-medium text-slate-100">{String(f?.field ?? "")}</div>
                              {expandedFilterRows[fk] ? (
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                                </div>
                              ) : null}
                            </button>
                            <button type="button" data-testid="page-filter-edit-btn" onClick={() => openEditor(f)} className="shrink-0 text-[10px] text-emerald-300/90 hover:text-emerald-200" title="Edit">
                              ✎
                            </button>
                            <button type="button" onClick={() => removeOne(f)} className="shrink-0 text-[10px] text-slate-400 hover:text-rose-300" title="Remove">
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Report */}
            <div className="p-2" data-testid="filters-report-section">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 py-1 text-left"
                onClick={() => setAccordionOpen((prev) => ({ ...prev, report: !prev.report }))}
              >
                <span className="text-[11px] font-medium text-slate-200">
                  {accordionOpen.report ? "▾" : "▸"} Filters on all pages
                  <span className="ml-1 font-normal text-slate-500">({reportFilters.length})</span>
                </span>
              </button>
              {accordionOpen.report && (
                <div className="mt-1 space-y-2 pl-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddByNameFor((s) => (s === "report" ? null : "report"));
                        setAddByNameValue("");
                      }}
                      className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20"
                    >
                      + Add by name
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearScope(confirmClearScope === "report" ? null : "report")}
                      className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                    >
                      Clear all
                    </button>
                  </div>
                  {addByNameFor === "report" && (
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        value={addByNameValue}
                        onChange={(e) => setAddByNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void addFilterByFieldInput("report", addByNameValue);
                        }}
                        placeholder="Model.field"
                        className="min-w-[140px] flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200"
                      />
                      <button type="button" onClick={() => void addFilterByFieldInput("report", addByNameValue)} className="rounded border border-white/15 bg-white/10 px-2 py-1 text-[10px] text-slate-200">
                        Add
                      </button>
                      <button type="button" onClick={() => { setAddByNameFor(null); setAddByNameValue(""); }} className="text-[10px] text-slate-500 hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                  {confirmClearScope === "report" && (
                    <div className="flex items-center justify-between gap-2 rounded border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-100">
                      <span>Remove all report filters?</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirmClearScope(null)} className="rounded border border-white/15 px-1.5 py-0.5">Cancel</button>
                        <button type="button" onClick={() => { removeFiltersByScope("report"); setConfirmClearScope(null); window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied")); }} className="rounded border border-rose-500/30 px-1.5 py-0.5">Clear</button>
                      </div>
                    </div>
                  )}
                  <div
                    onDragOver={allowDrop}
                    onDrop={onDropCreateFilter("report")}
                    data-testid="filters-drop-report"
                    className="border-t border-dashed border-white/10 py-1.5 text-center text-[10px] italic text-slate-500"
                  >
                    Drop a field here
                  </div>
                  <div className="space-y-1">
                    {reportFilters.filter((f) => filterMatchesQuery(f, filterSearch)).length === 0 ? (
                      <div className="text-[10px] text-slate-500">No filters in this section.</div>
                    ) : (
                      reportFilters.filter((f) => filterMatchesQuery(f, filterSearch)).map((f: BiFilter, idx: number) => {
                        const fk = makeKey(f);
                        return (
                          <div data-testid="report-filter-card" key={`${String(f?.field)}_${idx}`} className="flex items-start gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5">
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpandedFilterRows((prev) => ({ ...prev, [fk]: !prev[fk] }))}>
                              <div className="truncate text-[10px] font-medium text-slate-100">{String(f?.field ?? "")}</div>
                              {expandedFilterRows[fk] ? (
                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  {opLabel(f?.op)} {Array.isArray(f?.values) ? f.values.join(", ") : String(f?.values ?? "")}
                                </div>
                              ) : null}
                            </button>
                            <button type="button" data-testid="report-filter-edit-btn" onClick={() => openEditor(f)} className="shrink-0 text-[10px] text-emerald-300/90 hover:text-emerald-200" title="Edit">
                              ✎
                            </button>
                            <button type="button" onClick={() => removeOne(f)} className="shrink-0 text-[10px] text-slate-400 hover:text-rose-300" title="Remove">
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorMode("basic")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border ${editorMode === "basic" ? "border-blue-400/30 bg-blue-500/10 text-blue-200" : "border-white/10 bg-white/5 text-slate-300"}`}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode("advanced")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border ${editorMode === "advanced" ? "border-blue-400/30 bg-blue-500/10 text-blue-200" : "border-white/10 bg-white/5 text-slate-300"}`}
                  >
                    Advanced
                  </button>
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
                          } else if (op === "top_n") {
                            const n = Math.max(1, Number((prev as any)?.topN?.n ?? prev.values?.[0] ?? 10) || 10);
                            const byMeasure = String((prev as any)?.topN?.byMeasure ?? prev.values?.[1] ?? "").trim();
                            const mode = String((prev as any)?.topN?.mode ?? prev.values?.[2] ?? "top").trim() === "bottom" ? "bottom" : "top";
                            (next as any).topN = { n, byMeasure, mode };
                            next.values = [n, byMeasure, mode];
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
                      <option value="top_n">Top N</option>
                    </select>
                  </div>

                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Value(s)</div>
                    {editingDraft.op === "top_n" ? (
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        <select
                          value={String((editingDraft as any)?.topN?.mode ?? "top")}
                          onChange={(e) => {
                            const v = String(e.target.value ?? "top") === "bottom" ? "bottom" : "top";
                            setEditingDraft((prev) => prev ? ({ ...prev, topN: { ...(prev as any).topN, mode: v } as any, values: [Number((prev as any)?.topN?.n ?? 10), String((prev as any)?.topN?.byMeasure ?? ""), v] }) : prev);
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        >
                          <option value="top">Top</option>
                          <option value="bottom">Bottom</option>
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={Number((editingDraft as any)?.topN?.n ?? 10)}
                          onChange={(e) => {
                            const n = Math.max(1, Number(e.target.value || 1));
                            setEditingDraft((prev) => prev ? ({ ...prev, topN: { ...(prev as any).topN, n } as any, values: [n, String((prev as any)?.topN?.byMeasure ?? ""), String((prev as any)?.topN?.mode ?? "top")] }) : prev);
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        />
                        <input
                          type="text"
                          value={String((editingDraft as any)?.topN?.byMeasure ?? "")}
                          onChange={(e) => {
                            const byMeasure = String(e.target.value ?? "");
                            setEditingDraft((prev) => prev ? ({ ...prev, topN: { ...(prev as any).topN, byMeasure } as any, values: [Number((prev as any)?.topN?.n ?? 10), byMeasure, String((prev as any)?.topN?.mode ?? "top")] }) : prev);
                          }}
                          placeholder="Model.measure"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50 col-span-3"
                        />
                      </div>
                    ) : editingDraft.op === "between" || editingDraft.op === "not_between" ? (
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

                    {(editingDraft.op === "between" || editingDraft.op === "not_between") && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          defaultValue={30}
                          id="relative_days_input"
                          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById("relative_days_input") as HTMLInputElement | null;
                            const days = Math.max(1, Number(el?.value ?? 30) || 30);
                            const to = new Date();
                            const from = new Date(to.getTime());
                            from.setDate(from.getDate() - days);
                            setEditingDraft((prev) => prev ? ({ ...prev, values: [from.toISOString(), to.toISOString()] }) : prev);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                        >
                          Relative: last N days
                        </button>
                      </div>
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
                  <div className="space-y-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">Logic Operator</div>
                      <select
                        value={String((editingDraft as any)?.logicOp ?? "and")}
                        onChange={(e) => {
                          const v = String(e.target.value ?? "and") === "or" ? "or" : "and";
                          setEditingDraft((prev) => prev ? ({ ...prev, logicOp: v }) : prev);
                        }}
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                      >
                        <option value="and">AND</option>
                        <option value="or">OR</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">Field Alias (cross-model)</div>
                      <input
                        type="text"
                        value={String((editingDraft as any)?.fieldAlias ?? "")}
                        onChange={(e) => {
                          const v = String(e.target.value ?? "");
                          setEditingDraft((prev) => prev ? ({ ...prev, fieldAlias: v }) : prev);
                        }}
                        placeholder="Alias key from semantic model"
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Advanced mode controls cross-model alias matching and global AND/OR behavior.
                    </div>
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
