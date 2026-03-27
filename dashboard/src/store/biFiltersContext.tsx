"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  | "isnotnull";

export type BiFilterScope = "report" | "page" | "visual";

export type BiPageScopeMode = "dashboard" | "tab";

export type BiFilter = {
  field: string;
  op: BiFilterOp;
  values: any[];
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
  removeFiltersByScope: (scope: BiFilterScope) => void;
  pageScopeMode: BiPageScopeMode;
  setPageScopeMode: (mode: BiPageScopeMode) => void;
  activePageKey: string;
  setActivePageKey: (key: string) => void;
  removePageFiltersForKey: (pageKey: string) => void;
};

const BiFiltersContext = createContext<BiFilterContextState | null>(null);

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
    op !== "isnotnull"
  ) return null;
  return {
    field,
    op,
    values,
    scope,
    sourceChartId: typeof f?.sourceChartId === "string" ? f.sourceChartId : undefined,
    pageKey: pageKey || undefined,
  };
}

function mergeUnique(filters: BiFilter[]): BiFilter[] {
  const key = (f: BiFilter) => `${f.scope ?? "visual"}|${f.pageKey ?? ""}|${f.sourceChartId ?? ""}|${f.field}|${f.op}|${JSON.stringify(f.values ?? [])}`;
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

export function BiFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<BiFilter[]>([]);
  const [version, setVersion] = useState<number>(0);

  const [pageScopeMode, setPageScopeModeState] = useState<BiPageScopeMode>("dashboard");
  const [activePageKey, setActivePageKeyState] = useState<string>("dashboard");

  const filtersRef = useRef<BiFilter[]>([]);
  filtersRef.current = filters;

  const setFilters = (next: BiFilter[]) => {
    const normalized = mergeUnique(next.map(normalizeFilter).filter(Boolean) as BiFilter[]);
    setFiltersState(normalized);
    let nextVersion = 0;
    setVersion((v) => {
      nextVersion = v + 1;
      return nextVersion;
    });

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:bi-filters-changed", {
          detail: { filters: normalized, version: nextVersion },
        })
      );
    } catch {}
  };

  const clear = () => setFilters([]);

  const addFilter = (filter: BiFilter) => {
    setFilters([...filtersRef.current, filter]);
  };

  const removeFiltersFromChart = (sourceChartId: string) => {
    const id = String(sourceChartId ?? "").trim();
    if (!id) return;
    setFilters(filtersRef.current.filter((f) => String(f.sourceChartId ?? "") !== id));
  };

  const removeFiltersByScope = (scope: BiFilterScope) => {
    const sc = String(scope ?? "").trim() as BiFilterScope;
    if (sc !== "report" && sc !== "page" && sc !== "visual") return;
    setFilters(filtersRef.current.filter((f) => (f.scope ?? "visual") !== sc));
  };

  const setPageScopeMode = (mode: BiPageScopeMode) => {
    const m = String(mode ?? "").trim() as BiPageScopeMode;
    if (m !== "dashboard" && m !== "tab") return;
    setPageScopeModeState(m);
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:bi-page-scope-changed", {
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
        new CustomEvent("dashboard:bi-page-scope-changed", {
          detail: { pageScopeMode, activePageKey: k },
        })
      );
    } catch {}
  };

  const removePageFiltersForKey = (pageKey: string) => {
    const k = String(pageKey ?? "").trim();
    if (!k) return;
    setFilters(filtersRef.current.filter((f) => (f.scope ?? "visual") !== "page" || String(f.pageKey ?? "") !== k));
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      const nextProjectId = detail?.projectId == null ? "" : String(detail.projectId).trim();

      // When switching projects (or going to a new empty dashboard), clear BI filters.
      // Filters should not leak across projects.
      setFiltersState([]);
      setVersion((v) => v + 1);
      setPageScopeModeState("dashboard");
      setActivePageKeyState("dashboard");

      try {
        window.dispatchEvent(
          new CustomEvent("dashboard:bi-filters-changed", {
            detail: { filters: [], version: version + 1, projectId: nextProjectId },
          })
        );
      } catch {}
    };
    window.addEventListener("dashboard:project-changed", handler as EventListener);
    return () => window.removeEventListener("dashboard:project-changed", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
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
    window.addEventListener("dashboard:bi-filters-changed", handler as EventListener);
    return () => window.removeEventListener("dashboard:bi-filters-changed", handler as EventListener);
  }, []);

  const value = useMemo<BiFilterContextState>(() => ({
    filters,
    version,
    setFilters,
    clear,
    addFilter,
    removeFiltersFromChart,
    removeFiltersByScope,
    pageScopeMode,
    setPageScopeMode,
    activePageKey,
    setActivePageKey,
    removePageFiltersForKey,
  }), [filters, version]);

  return <BiFiltersContext.Provider value={value}>{children}</BiFiltersContext.Provider>;
}

export function useBiFilters(): BiFilterContextState {
  const ctx = useContext(BiFiltersContext);
  if (!ctx) throw new Error("useBiFilters must be used within BiFiltersProvider");
  return ctx;
}
