"use client";

import React, {createContext, useContext, useMemo, type ReactNode} from "react";
import {getChartThemeTokens} from "@/lib/chartTheme";
import { useLanguage } from "../providers/LanguageProvider";

export type ChartActionId =
  | "open-new-tab"
  | "open-as-table"
  | "open-as-slicer"
  | "export-png"
  | "export-csv"
  | "fullscreen"
  | "explain"
  | "ai-config"
  | "manual-config"
  | "data-mapping"
  | "connect-db";

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

function buildDefaultActions(t: (translations: { ru: string; en: string }) => string): ChartAction[] {
  return [
  {
    id: "connect-db",
    label: t({ ru: "Подключить БД", en: "Connect DB" }),
    onClick: ({chartId}) => {
      window.dispatchEvent(
        new CustomEvent("dashboard:open-db-explorer", {
          detail: {
            chartId: chartId ?? null,
          },
        })
      );
    },
  },
  {
    id: "open-new-tab",
    label: t({ ru: "Открыть в новой вкладке", en: "Open in new tab" }),
    onClick: ({chartId}) => {
      if (!chartId) return;
      window.open(`/preview/${chartId}`, "_blank", "noopener,noreferrer");
    },
  },
  {
    id: "open-as-table",
    label: t({ ru: "Открыть как таблицу", en: "Open as table" }),
    onClick: ({chartId, params}) => {
      if (!chartId) return;
      window.dispatchEvent(
        new CustomEvent("dashboard:open-as-table", {
          detail: { chartId, params },
        })
      );
    },
  },
  {
    id: "open-as-slicer",
    label: t({ ru: "Открыть как slicer", en: "Open as slicer" }),
    onClick: ({chartId, params}) => {
      if (!chartId) return;
      window.dispatchEvent(
        new CustomEvent("dashboard:open-as-slicer", {
          detail: { chartId, params },
        })
      );
    },
  },
  {
    id: "export-png",
    label: t({ ru: "Экспорт PNG", en: "Export PNG" }),
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'export-png', chartId } }));
    },
  },
  {
    id: "export-csv",
    label: t({ ru: "Экспорт CSV", en: "Export CSV" }),
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:action', { detail: { actionId: 'export-csv', chartId } }));
    },
  },
  {
    id: "fullscreen",
    label: t({ ru: "Полный экран", en: "Fullscreen" }),
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
    label: t({ ru: "AI-конфиг", en: "AI config" }),
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:ai-config', { detail: { chartId } }));
    },
  },
  {
    id: "manual-config",
    label: t({ ru: "Ручная настройка", en: "Manual config" }),
    onClick: ({chartId}) => {
      window.dispatchEvent(new CustomEvent('chart:manual-config', { detail: { chartId } }));
    },
  },
  {
    id: "data-mapping",
    label: t({ ru: "Настроить данные", en: "Configure data" }),
    isVisible: () => false,
    onClick: ({chartId}) => {
      if (!chartId) return;
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId,
            patch: { __showColumnMapping: true },
          },
        })
      );
    },
  },
  ];
}

const ChartEnvironmentContext = createContext<ChartEnvironment | null>(null);

export function ChartEnvironmentProvider({children}: {children: ReactNode}) {
  const { t } = useLanguage();
  const lang = typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  const themeTokens = useMemo(() => getChartThemeTokens(), []);
  const actions = useMemo(() => buildDefaultActions(t), [t]);

  const value = useMemo<ChartEnvironment>(
    () => ({lang, themeTokens, actions}),
    [actions, lang, themeTokens]
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
      actions: buildDefaultActions((tx) => tx.en),
    };
  }
  return ctx;
}
