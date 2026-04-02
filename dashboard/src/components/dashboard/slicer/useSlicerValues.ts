"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BiFilter } from "../../../store/biFiltersContext";
import { buildSemanticGlobalContext, buildSemanticRequestContext } from "../../../lib/semantic/requestContext";
import { isSemanticRef } from "./types";

type UseSlicerValuesParams = {
  sourceKind: "field" | "parameter";
  mode: "list" | "dropdown" | "tile" | "dateRange" | "range" | "hierarchy" | "input";
  fieldRef: string;
  hierarchyCursor: string;
  hierarchyLevels: string[];
  hierarchyPath: string[];
  effectiveScope: "report" | "page" | "visual";
  pageKey: string;
  effectiveFilterTargetChartId: string;
  canSuggest: boolean;
  projectId: string;
  biFilters: BiFilter[];
  paramValues: string[];
  sortOrder?: "asc" | "desc";
  limit?: number;
};

export function useSlicerValues(params: UseSlicerValuesParams) {
  const {
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
    biFilters,
    paramValues,
    sortOrder = "asc",
    limit = 500,
  } = params;

  const [valueSearch, setValueSearch] = useState("");
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const suggestTimerRef = useRef<number | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const relevantBiFilters = useMemo(() => {
    const sourceId = String(effectiveFilterTargetChartId ?? "").trim();
    return (Array.isArray(biFilters) ? biFilters : []).filter((f) => {
      const scope = String((f as any)?.scope ?? "visual").trim();
      const filterSourceId = String((f as any)?.sourceChartId ?? "").trim();
      if (scope !== "visual") return true;
      return !sourceId || filterSourceId !== sourceId;
    });
  }, [biFilters, effectiveFilterTargetChartId]);
  const biFiltersHash = useMemo(
    () => JSON.stringify(relevantBiFilters.map((f) => ({
      field: String((f as any)?.field ?? ""),
      op: String((f as any)?.op ?? ""),
      values: Array.isArray((f as any)?.values) ? (f as any).values : [],
      scope: String((f as any)?.scope ?? "visual"),
      sourceChartId: String((f as any)?.sourceChartId ?? ""),
      pageKey: String((f as any)?.pageKey ?? ""),
      logicGroup: String((f as any)?.logicGroup ?? ""),
      logicOp: String((f as any)?.logicOp ?? "and"),
    }))),
    [relevantBiFilters]
  );
  const hierarchyLevelsHash = useMemo(() => JSON.stringify(hierarchyLevels), [hierarchyLevels]);
  const hierarchyPathHash = useMemo(() => JSON.stringify(hierarchyPath), [hierarchyPath]);
  const paramValuesHash = useMemo(() => JSON.stringify(paramValues), [paramValues]);

  const fetchSuggestions = async (q: string) => {
    if (sourceKind === "parameter") {
      setSuggestError(null);
      setSuggestions(paramValues);
      return;
    }
    const hierarchyVirtual: BiFilter[] = [];
    if (mode === "hierarchy") {
      for (let i = 0; i < hierarchyPath.length; i++) {
        const lf = hierarchyLevels[i];
        const val = hierarchyPath[i];
        if (lf && val) {
          hierarchyVirtual.push({
            field: lf,
            op: "eq",
            values: [val],
            scope: effectiveScope,
            pageKey: effectiveScope === "page" ? pageKey : undefined,
            sourceChartId: effectiveFilterTargetChartId,
          });
        }
      }
    }
    const suggestField = mode === "hierarchy" ? hierarchyCursor : fieldRef;
    if (!suggestField || !isSemanticRef(suggestField)) {
      setSuggestError(mode === "hierarchy" ? "Add hierarchy levels (drop fields) first" : "Bind a semantic field first (Model.field)");
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
    if (suggestionsAbortRef.current) suggestionsAbortRef.current.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;
    try {
      const mergedBi = [...relevantBiFilters, ...hierarchyVirtual];
      const globalContext = buildSemanticGlobalContext(mergedBi, { excludeField: suggestField });
      const res = await fetch("/api/semantic/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          field: suggestField,
          search: q,
          sortOrder,
          limit,
          purpose: "slicer",
          globalContext,
          requestContext: buildSemanticRequestContext({ chartId: effectiveFilterTargetChartId, pageKey }),
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed to load values (${res.status})`);
      const vals = Array.isArray(json?.data?.values) ? json.data.values : [];
      setSuggestions(vals.map((x: any) => String(x)).filter(Boolean));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setSuggestions([]);
      setSuggestError(err instanceof Error ? err.message : "Failed to load values");
    } finally {
      if (suggestionsAbortRef.current === controller) {
        setSuggestLoading(false);
      }
    }
  };

  useEffect(() => {
    if (sourceKind === "parameter") {
      setSuggestions(paramValues);
      return;
    }
    if (!canSuggest) return;
    if (mode === "hierarchy") {
      if (!hierarchyCursor) return;
    } else if (!fieldRef) return;
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
      if (suggestionsAbortRef.current) {
        suggestionsAbortRef.current.abort();
        suggestionsAbortRef.current = null;
      }
    };
  }, [
    suggestQuery,
    canSuggest,
    fieldRef,
    mode,
    hierarchyCursor,
    hierarchyPathHash,
    hierarchyLevelsHash,
    pageKey,
    effectiveScope,
    effectiveFilterTargetChartId,
    biFiltersHash,
    sourceKind,
    paramValuesHash,
    sortOrder,
    projectId,
    limit,
  ]);

  const filteredSuggestions = useMemo(() => {
    const q = valueSearch.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, valueSearch]);

  return {
    valueSearch,
    setValueSearch,
    suggestQuery,
    setSuggestQuery,
    suggestLoading,
    suggestError,
    setSuggestError,
    suggestions,
    filteredSuggestions,
  };
}
