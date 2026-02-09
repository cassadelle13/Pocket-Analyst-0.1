"use client";

import { createContext, useContext, useMemo, useRef, PropsWithChildren } from "react";
import type { ChartInteractionPayload, ChartEventListener } from "@/types/interaction";

type Bus = {
  publish: (evt: ChartInteractionPayload) => void;
  subscribe: (listener: ChartEventListener) => () => void;
};

const ChartInteractionBusContext = createContext<Bus | null>(null);

export function ChartInteractionProvider({ children }: PropsWithChildren) {
  const listenersRef = useRef(new Set<ChartEventListener>());

  const bus = useMemo<Bus>(() => ({
    publish: (evt) => {
      const ls = Array.from(listenersRef.current);
      for (const l of ls) {
        try { l(evt); } catch {}
      }
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
  }), []);

  return (
    <ChartInteractionBusContext.Provider value={bus}>
      {children}
    </ChartInteractionBusContext.Provider>
  );
}

export function useChartBus() {
  const ctx = useContext(ChartInteractionBusContext);
  if (!ctx) throw new Error("useChartBus must be used within ChartInteractionProvider");
  return ctx;
}
