"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { VisualInteractionMode, VisualInteractionsMap } from "@/lib/visualInteractions";
import { DashboardEvent } from "@/lib/dashboardEvents";

type VisualInteractionsContextState = {
  editInteractionsMode: boolean;
  setEditInteractionsMode: (next: boolean | ((prev: boolean) => boolean)) => void;
  interactionSourceChartId: string | null;
  visualInteractions: VisualInteractionsMap;
  setVisualInteractions: (next: VisualInteractionsMap) => void;
  setInteractionMode: (sourceChartId: string, targetChartId: string, mode: VisualInteractionMode) => void;
  getInteractionMode: (sourceChartId: string, targetChartId: string) => VisualInteractionMode | null;
};

const VisualInteractionsContext = createContext<VisualInteractionsContextState | null>(null);

export function VisualInteractionsProvider({ children }: { children: React.ReactNode }) {
  const [editInteractionsMode, setEditInteractionsMode] = useState(false);
  const [interactionSourceChartId, setInteractionSourceChartId] = useState<string | null>(null);
  const [visualInteractions, setVisualInteractions] = useState<VisualInteractionsMap>({});

  useEffect(() => {
    const onActiveChart = (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "").trim();
      setInteractionSourceChartId(chartId || null);
    };
    window.addEventListener("dashboard:active-chart-id", onActiveChart as EventListener);
    return () => window.removeEventListener("dashboard:active-chart-id", onActiveChart as EventListener);
  }, []);

  useEffect(() => {
    const onProjectChanged = () => {
      setVisualInteractions({});
      setInteractionSourceChartId(null);
      setEditInteractionsMode(false);
    };
    window.addEventListener(DashboardEvent.PROJECT_CHANGED, onProjectChanged as EventListener);
    return () => window.removeEventListener(DashboardEvent.PROJECT_CHANGED, onProjectChanged as EventListener);
  }, []);

  const setInteractionMode = useCallback((sourceChartId: string, targetChartId: string, mode: VisualInteractionMode) => {
    const src = String(sourceChartId ?? "").trim();
    const dst = String(targetChartId ?? "").trim();
    if (!src || !dst || src === dst) return;
    if (mode !== "filter" && mode !== "highlight" && mode !== "none") return;
    setVisualInteractions((prev) => {
      const next: VisualInteractionsMap = { ...(prev ?? {}) };
      const sourceBucket: Record<string, VisualInteractionMode> = { ...((next as any)[src] ?? {}) };
      sourceBucket[dst] = mode;
      next[src] = sourceBucket;
      return next;
    });
  }, []);

  const getInteractionMode = useCallback((sourceChartId: string, targetChartId: string): VisualInteractionMode | null => {
    const src = String(sourceChartId ?? "").trim();
    const dst = String(targetChartId ?? "").trim();
    if (!src || !dst) return null;
    const val = String((visualInteractions as any)?.[src]?.[dst] ?? "").trim().toLowerCase();
    if (val === "filter" || val === "highlight" || val === "none") return val as VisualInteractionMode;
    return null;
  }, [visualInteractions]);

  const value = useMemo<VisualInteractionsContextState>(() => ({
    editInteractionsMode,
    setEditInteractionsMode,
    interactionSourceChartId,
    visualInteractions,
    setVisualInteractions,
    setInteractionMode,
    getInteractionMode,
  }), [editInteractionsMode, interactionSourceChartId, visualInteractions, setInteractionMode, getInteractionMode]);

  return (
    <VisualInteractionsContext.Provider value={value}>
      {children}
    </VisualInteractionsContext.Provider>
  );
}

export function useVisualInteractions(): VisualInteractionsContextState {
  const ctx = useContext(VisualInteractionsContext);
  if (!ctx) throw new Error("useVisualInteractions must be used within VisualInteractionsProvider");
  return ctx;
}
