"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, PropsWithChildren } from "react";

export type ChartSyncSettingsState = {
  syncEnabled: boolean;
  setSyncEnabled: (v: boolean) => void;
};

const ChartSyncSettingsContext = createContext<ChartSyncSettingsState | null>(null);

const STORAGE_KEY = "dashboard:chart-sync-enabled";

export function ChartSyncSettingsProvider({ children }: PropsWithChildren) {
  const [syncEnabled, setSyncEnabledState] = useState<boolean>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      return raw ? raw === "1" : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, syncEnabled ? "1" : "0");
    } catch {}
  }, [syncEnabled]);

  const setSyncEnabled = useCallback((v: boolean) => setSyncEnabledState(v), []);

  const value = useMemo(() => ({ syncEnabled, setSyncEnabled }), [syncEnabled, setSyncEnabled]);

  return (
    <ChartSyncSettingsContext.Provider value={value}>{children}</ChartSyncSettingsContext.Provider>
  );
}

export function useChartSyncSettings() {
  const ctx = useContext(ChartSyncSettingsContext);
  if (!ctx) throw new Error("useChartSyncSettings must be used within ChartSyncSettingsProvider");
  return ctx;
}
