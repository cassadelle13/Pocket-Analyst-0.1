"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, PropsWithChildren } from "react";

export type ClickBehavior = 'drilldown' | 'filter' | 'both';

export type ClickBehaviorMap = Record<string, ClickBehavior>;

type ChartClickBehaviorState = {
  behavior: ClickBehaviorMap;
  defaultBehavior: ClickBehavior;
  getBehavior: (chartId?: string) => ClickBehavior;
  setBehavior: (chartId: string, behavior: ClickBehavior) => void;
  setDefaultBehavior: (behavior: ClickBehavior) => void;
};

const ChartClickBehaviorContext = createContext<ChartClickBehaviorState | null>(null);

const STORAGE_KEY = "dashboard:chart-click-behavior";

const DEFAULT_BEHAVIOR: ClickBehavior = 'drilldown';

export function ChartClickBehaviorProvider({ children }: PropsWithChildren) {
  const [behavior, setBehaviorState] = useState<ClickBehaviorMap>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return {} as ClickBehaviorMap;
      const parsed = JSON.parse(raw);
      return parsed?.map ?? (parsed as ClickBehaviorMap) ?? {};
    } catch {
      return {} as ClickBehaviorMap;
    }
  });
  const [defaultBehavior, setDefaultBehavior] = useState<ClickBehavior>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return DEFAULT_BEHAVIOR;
      const parsed = JSON.parse(raw);
      return (parsed?.default as ClickBehavior) ?? DEFAULT_BEHAVIOR;
    } catch {
      return DEFAULT_BEHAVIOR;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ default: defaultBehavior, map: behavior }));
    } catch {}
  }, [behavior, defaultBehavior]);

  const getBehavior = useCallback((chartId?: string) => {
    if (!chartId) return defaultBehavior;
    return behavior[chartId] ?? defaultBehavior;
  }, [behavior, defaultBehavior]);

  const setBehavior = useCallback((chartId: string, b: ClickBehavior) => {
    setBehaviorState(prev => ({ ...prev, [chartId]: b }));
  }, []);

  const value = useMemo(() => ({ behavior, defaultBehavior, getBehavior, setBehavior, setDefaultBehavior }), [behavior, defaultBehavior, getBehavior, setBehavior, setDefaultBehavior]);

  return (
    <ChartClickBehaviorContext.Provider value={value}>{children}</ChartClickBehaviorContext.Provider>
  );
}

export function useChartClickBehavior() {
  const ctx = useContext(ChartClickBehaviorContext);
  if (!ctx) throw new Error('useChartClickBehavior must be used within ChartClickBehaviorProvider');
  return ctx;
}
