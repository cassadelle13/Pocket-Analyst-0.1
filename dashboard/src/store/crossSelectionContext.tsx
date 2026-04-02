"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DashboardEvent } from "@/lib/dashboardEvents";

export type CrossSelection = {
  sourceChartId: string;
  field: string;
  value: string;
  seriesName?: string;
} | null;

type CrossSelectionContextState = {
  crossSelection: CrossSelection;
  setCrossSelection: (next: Exclude<CrossSelection, null>) => void;
  clearCrossSelection: () => void;
};

const CrossSelectionContext = createContext<CrossSelectionContextState | null>(null);

export function CrossSelectionProvider({ children }: { children: React.ReactNode }) {
  const [crossSelection, setCrossSelectionState] = useState<CrossSelection>(null);

  const setCrossSelection = useCallback((next: Exclude<CrossSelection, null>) => {
    const sourceChartId = String(next?.sourceChartId ?? "").trim();
    const field = String(next?.field ?? "").trim();
    const value = String(next?.value ?? "");
    if (!sourceChartId || !field) return;
    const seriesName = String(next?.seriesName ?? "").trim();
    setCrossSelectionState({
      sourceChartId,
      field,
      value,
      ...(seriesName ? { seriesName } : {}),
    });
  }, []);

  const clearCrossSelection = useCallback(() => {
    setCrossSelectionState(null);
  }, []);

  useEffect(() => {
    const onProjectChanged = () => setCrossSelectionState(null);
    window.addEventListener(DashboardEvent.PROJECT_CHANGED, onProjectChanged as EventListener);
    return () => window.removeEventListener(DashboardEvent.PROJECT_CHANGED, onProjectChanged as EventListener);
  }, []);

  const value = useMemo<CrossSelectionContextState>(() => ({
    crossSelection,
    setCrossSelection,
    clearCrossSelection,
  }), [crossSelection, setCrossSelection, clearCrossSelection]);

  return (
    <CrossSelectionContext.Provider value={value}>
      {children}
    </CrossSelectionContext.Provider>
  );
}

export function useCrossSelection(): CrossSelectionContextState {
  const ctx = useContext(CrossSelectionContext);
  if (!ctx) throw new Error("useCrossSelection must be used within CrossSelectionProvider");
  return ctx;
}
