"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DashboardEvent } from "../lib/dashboardEvents";

export type BiFilterOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "between"
  | "not_between"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "icontains"
  | "notcontains"
  | "noticontains"
  | "startswith"
  | "istartswith"
  | "endswith"
  | "iendswith"
  | "isnull"
  | "isnotnull"
  | "top_n";

export type BiFilterScope = "report" | "page" | "visual";

export type BiPageScopeMode = "dashboard" | "tab";

export type BiFilter = {
  field: string;
  op: BiFilterOp;
  values: any[];
  logicGroup?: string;
  logicOp?: "and" | "or";
  fieldAlias?: string;
  topN?: { mode: "top" | "bottom"; n: number; byMeasure: string };
  scope?: BiFilterScope;
  sourceChartId?: string;
  pageKey?: string;
};

export type BiFilterContextState = {
  filters: BiFilter[];
  version: number;
  setFilters: (next: BiFilter[]) => void;
  clear: () => void;
  addFilter: (filter: BiFilter) => void;
  removeFiltersFromChart: (sourceChartId: string) => void;
  replaceFiltersForChart: (sourceChartId: string, nextFilters: BiFilter[], ownerFilterGroup?: string) => void;
  removeFiltersByScope: (scope: BiFilterScope) => void;
  pageScopeMode: BiPageScopeMode;
  setPageScopeMode: (mode: BiPageScopeMode) => void;
  activePageKey: string;
  setActivePageKey: (key: string) => void;
  removePageFiltersForKey: (pageKey: string) => void;
};

const BiFiltersContext = createContext<BiFilterContextState | null>(null);
const biFiltersStorageKey = (projectId: string) => `dashboard:bi-filters:${projectId}`;

function normalizeFilter(f: any): BiFilter | null {
  const field = String(f?.field ?? "").trim();
  const opRaw = String(f?.op ?? "").trim().toLowerCase();
  const op = (opRaw === "nin" ? "not_in" : opRaw) as BiFilterOp;
  const values = Array.isArray(f?.values) ? f.values : (f?.values != null ? [f.values] : []);
  const scopeRaw = String(f?.scope ?? "").trim() as BiFilterScope;
  const scope: BiFilterScope = (scopeRaw === "report" || scopeRaw === "page" || scopeRaw === "visual") ? scopeRaw : "visual";
  const pageKey = (typeof f?.pageKey === "string") ? String(f.pageKey).trim() : "";
  if (!field) return null;
  if (
    op !== "eq" &&
    op !== "neq" &&
    op !== "in" &&
    op !== "not_in" &&
    op !== "between" &&
    op !== "not_between" &&
    op !== "gt" &&
    op !== "gte" &&
    op !== "lt" &&
    op !== "lte" &&
    op !== "contains" &&
    op !== "icontains" &&
    op !== "notcontains" &&
    op !== "noticontains" &&
    op !== "startswith" &&
    op !== "istartswith" &&
    op !== "endswith" &&
    op !== "iendswith" &&
    op !== "isnull" &&
    op !== "isnotnull" &&
    op !== "top_n"
  ) return null;
  return {
    field,
    op,
    values,
    logicGroup: typeof f?.logicGroup === "string" ? String(f.logicGroup).trim() || undefined : undefined,
    logicOp: String(f?.logicOp ?? "").toLowerCase() === "or" ? "or" : "and",
    fieldAlias: typeof f?.fieldAlias === "string" ? String(f.fieldAlias).trim() || undefined : undefined,
    topN: f?.topN && typeof f.topN === "object" ? {
      mode: String((f as any).topN.mode ?? "top") === "bottom" ? "bottom" : "top",
      n: Math.max(1, Number((f as any).topN.n ?? 10) || 10),
      byMeasure: String((f as any).topN.byMeasure ?? "").trim(),
    } : undefined,
    scope,
    sourceChartId: typeof f?.sourceChartId === "string" ? f.sourceChartId : undefined,
    pageKey: pageKey || undefined,
  };
}

function mergeUnique(filters: BiFilter[]): BiFilter[] {
  const key = (f: BiFilter) => `${f.scope ?? "visual"}|${f.pageKey ?? ""}|${f.sourceChartId ?? ""}|${f.field}|${f.op}|${JSON.stringify(f.values ?? [])}|${f.logicGroup ?? ""}|${f.logicOp ?? "and"}|${f.fieldAlias ?? ""}|${JSON.stringify(f.topN ?? null)}`;
  const seen = new Set<string>();
  const res: BiFilter[] = [];
  for (const f of filters) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    res.push(f);
  }
  return res;
}

export function reconcileFiltersForChart(
  sourceChartId: string,
  prev: BiFilter[],
  nextFilters: BiFilter[],
  ownerFilterGroup?: string
): BiFilter[] {
  const id = String(sourceChartId ?? "").trim();
  if (!id) return Array.isArray(prev) ? prev : [];
  const ownerGroup = String(ownerFilterGroup ?? "").trim();
  if (ownerGroup) {
    return [
      ...(Array.isArray(prev) ? prev : []).filter((f) => {
        if (String(f.sourceChartId ?? "").trim() !== id) return true;
        return String(f.logicGroup ?? "").trim() !== ownerGroup;
      }),
      ...(Array.isArray(nextFilters) ? nextFilters : []),
    ];
  }
  const nextFieldSet = new Set(
    (Array.isArray(nextFilters) ? nextFilters : [])
      .map((f) => String((f as any)?.field ?? "").trim())
      .filter(Boolean)
  );
  return [
    ...(Array.isArray(prev) ? prev : []).filter((f) => {
      if (String(f.sourceChartId ?? "").trim() !== id) return true;
      return nextFieldSet.size > 0 && !nextFieldSet.has(String(f.field ?? "").trim());
    }),
    ...(Array.isArray(nextFilters) ? nextFilters : []),
  ];
}

export function BiFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<BiFilter[]>([]);
  const [version, setVersion] = useState<number>(0);

  const [pageScopeMode, setPageScopeModeState] = useState<BiPageScopeMode>("dashboard");
  const [activePageKey, setActivePageKeyState] = useState<string>("dashboard");

  const filtersRef = useRef<BiFilter[]>([]);
  filtersRef.current = filters;
  const selfDispatchRef = useRef(false);

  const setFilters = (next: BiFilter[]) => {
    const normalized = mergeUnique(next.map(normalizeFilter).filter(Boolean) as BiFilter[]);
    // #region agent log
    fetch('http://127.0.0.1:7891/ingest/42f4b2b3-bbc6-4993-849a-db95471cb317',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6bac71'},body:JSON.stringify({sessionId:'6bac71',runId:'slicer-queryerror-run2',hypothesisId:'H6',location:'biFiltersContext.tsx:setFilters',message:'biFilters store updated',data:{incomingCount:Array.isArray(next)?next.length:0,normalizedCount:normalized.length,visualCount:normalized.filter((f)=>String((f as any)?.scope??'visual')==='visual').length,sample:normalized.slice(0,3).map((f)=>({field:String((f as any)?.field??''),scope:String((f as any)?.scope??''),sourceChartId:String((f as any)?.sourceChartId??''),op:String((f as any)?.op??'')}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setFiltersState(normalized);
    setVersion((v) => {
      const nextVersion = v + 1;
      try {
        selfDispatchRef.current = true;
        window.dispatchEvent(
          new CustomEvent(DashboardEvent.BI_FILTERS_CHANGED, {
            detail: { filters: normalized, version: nextVersion },
          })
        );
      } catch {}
      return nextVersion;
    });
  };

  const clear = () => setFilters([]);

  const mutateFilters = (updater: (prev: BiFilter[]) => BiFilter[]) => {
    const prev = Array.isArray(filtersRef.current) ? filtersRef.current : [];
    setFilters(updater(prev));
  };

  const addFilter = (filter: BiFilter) => {
    mutateFilters((prev) => [...prev, filter]);
  };

  const removeFiltersFromChart = (sourceChartId: string) => {
    const id = String(sourceChartId ?? "").trim();
    if (!id) return;
    mutateFilters((prev) => prev.filter((f) => String(f.sourceChartId ?? "") !== id));
  };

  const replaceFiltersForChart = (sourceChartId: string, nextFilters: BiFilter[], ownerFilterGroup?: string) => {
    const id = String(sourceChartId ?? "").trim();
    if (!id) return;
    mutateFilters((prev) => reconcileFiltersForChart(id, prev, nextFilters, ownerFilterGroup));
  };

  const removeFiltersByScope = (scope: BiFilterScope) => {
    const sc = String(scope ?? "").trim() as BiFilterScope;
    if (sc !== "report" && sc !== "page" && sc !== "visual") return;
    mutateFilters((prev) => prev.filter((f) => (f.scope ?? "visual") !== sc));
  };

  const setPageScopeMode = (mode: BiPageScopeMode) => {
    const m = String(mode ?? "").trim() as BiPageScopeMode;
    if (m !== "dashboard" && m !== "tab") return;
    setPageScopeModeState(m);
    try {
      window.dispatchEvent(
        new CustomEvent(DashboardEvent.BI_PAGE_SCOPE_CHANGED, {
          detail: { pageScopeMode: m, activePageKey },
        })
      );
    } catch {}
  };

  const setActivePageKey = (key: string) => {
    const k = String(key ?? "").trim() || "dashboard";
    setActivePageKeyState(k);
    try {
      window.dispatchEvent(
        new CustomEvent(DashboardEvent.BI_PAGE_SCOPE_CHANGED, {
          detail: { pageScopeMode, activePageKey: k },
        })
      );
    } catch {}
  };

  const removePageFiltersForKey = (pageKey: string) => {
    const k = String(pageKey ?? "").trim();
    if (!k) return;
    mutateFilters((prev) => prev.filter((f) => (f.scope ?? "visual") !== "page" || String(f.pageKey ?? "") !== k));
  };

  useEffect(() => {
    const persist = () => {
      try {
        const pid = String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
        if (!pid) return;
        window.localStorage.setItem(biFiltersStorageKey(pid), JSON.stringify(filtersRef.current ?? []));
      } catch {}
    };
    persist();
  }, [filters, version]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      const nextProjectId = detail?.projectId == null ? "" : String(detail.projectId).trim();

      // Restore project-local filters from localStorage; fallback to empty.
      let restored: BiFilter[] = [];
      try {
        if (nextProjectId) {
          const raw = window.localStorage.getItem(biFiltersStorageKey(nextProjectId));
          const arr = raw ? JSON.parse(raw) : [];
          restored = mergeUnique((Array.isArray(arr) ? arr : []).map(normalizeFilter).filter(Boolean) as BiFilter[]);
        }
      } catch {}

      setFiltersState(restored);
      setVersion((v) => {
        const nextVersion = v + 1;
        try {
          selfDispatchRef.current = true;
          window.dispatchEvent(
            new CustomEvent(DashboardEvent.BI_FILTERS_CHANGED, {
              detail: { filters: restored, version: nextVersion, projectId: nextProjectId },
            })
          );
        } catch {}
        return nextVersion;
      });
      setPageScopeModeState("dashboard");
      setActivePageKeyState("dashboard");
    };
    window.addEventListener(DashboardEvent.PROJECT_CHANGED, handler as EventListener);
    return () => window.removeEventListener(DashboardEvent.PROJECT_CHANGED, handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      if (selfDispatchRef.current) {
        selfDispatchRef.current = false;
        return;
      }
      const detail = (e as CustomEvent).detail;
      const incoming = Array.isArray(detail?.filters) ? detail.filters : [];
      const normalized = mergeUnique(incoming.map(normalizeFilter).filter(Boolean) as BiFilter[]);
      setFiltersState(normalized);
      setVersion((v) => {
        const incomingV = Number(detail?.version);
        if (Number.isFinite(incomingV) && incomingV > v) return incomingV;
        return v + 1;
      });
    };
    window.addEventListener(DashboardEvent.BI_FILTERS_CHANGED, handler as EventListener);
    return () => window.removeEventListener(DashboardEvent.BI_FILTERS_CHANGED, handler as EventListener);
  }, []);

  const value = useMemo<BiFilterContextState>(() => ({
    filters,
    version,
    setFilters,
    clear,
    addFilter,
    removeFiltersFromChart,
    replaceFiltersForChart,
    removeFiltersByScope,
    pageScopeMode,
    setPageScopeMode,
    activePageKey,
    setActivePageKey,
    removePageFiltersForKey,
  }), [
    filters,
    version,
    pageScopeMode,
    activePageKey,
    setFilters,
    clear,
    addFilter,
    removeFiltersFromChart,
    replaceFiltersForChart,
    removeFiltersByScope,
    setPageScopeMode,
    setActivePageKey,
    removePageFiltersForKey,
  ]);

  return <BiFiltersContext.Provider value={value}>{children}</BiFiltersContext.Provider>;
}

export function useBiFilters(): BiFilterContextState {
  const ctx = useContext(BiFiltersContext);
  if (!ctx) throw new Error("useBiFilters must be used within BiFiltersProvider");
  return ctx;
}
