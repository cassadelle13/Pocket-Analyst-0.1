"use client";

import React, {createContext, useContext, useMemo, type ReactNode} from "react";
import {getChartThemeTokens} from "@/lib/chartTheme";

export type ChartActionId =
  | "open-new-tab"
  | "open-as-table"
  | "export-png"
  | "export-csv"
  | "fullscreen"
  | "explain"
  | "ai-config";

export type ChartAction = {
  id: ChartActionId;
  label: string;
  isVisible?: (ctx: ChartActionContext) => boolean;
  onClick: (ctx: ChartActionContext) => void;
};

export type ChartActionContext = {
  chartId?: string;
  params?: Record<string, unknown>;
};

export type ChartEnvironment = {
  lang: string;
  themeTokens: ReturnType<typeof getChartThemeTokens>;
  actions: ChartAction[];
};

const defaultActions: ChartAction[] = [
  {
    id: "open-new-tab",
    label: "Открыть в новой вкладке",
    onClick: ({chartId}) => {
      if (!chartId) return;
      window.open(`/preview/${chartId}`, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "open-as-table",
    label: "Открыть как таблицу",
    onClick: ({chartId}) => {
      if (!chartId) return;
      window.open(`/preview/${chartId}?_chart_type=table`, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "export-png",
    label: "Экспорт PNG",
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'export-png', chartId } }));
    },
  },
  {
    id: "export-csv",
    label: "Экспорт CSV",
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'export-csv', chartId } }));
    },
  },
  {
    id: "fullscreen",
    label: "Полный экран",
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'fullscreen', chartId } }));
    },
  },
  {
    id: "explain",
    label: "Explain chart",
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'explain', chartId } }));
    },
  },
  {
    id: "ai-config",
    label: "AI-конфиг",
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'ai-config', chartId } }));
    },
  },
];

const ChartEnvironmentContext = createContext<ChartEnvironment | null>(null);

export function ChartEnvironmentProvider({children}: {children: ReactNode}) {
  const lang = typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  const themeTokens = useMemo(() => getChartThemeTokens(), []);

  const value = useMemo<ChartEnvironment>(
    () => ({lang, themeTokens, actions: defaultActions}),
    [lang, themeTokens]
  );

  return (
    <ChartEnvironmentContext.Provider value={value}>{children}</ChartEnvironmentContext.Provider>
  );
}

export function useChartEnvironment(): ChartEnvironment {
  const ctx = useContext(ChartEnvironmentContext);
  if (!ctx) {
    // Fallback: create on the fly to avoid null checks everywhere
    return {
      lang: typeof navigator !== "undefined" ? navigator.language || "en" : "en",
      themeTokens: getChartThemeTokens(),
      actions: defaultActions,
    };
  }
  return ctx;
}
