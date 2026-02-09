"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react";

interface DemoContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pocketanalyst_demo_mode");
      if (stored !== null) {
        setIsDemoMode(stored === "true");
      }
    }
  }, []);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const next = !prev;
      localStorage.setItem("pocketanalyst_demo_mode", String(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isDemoMode, toggleDemoMode }),
    [isDemoMode, toggleDemoMode]
  );

  return (
    <DemoContext.Provider value={value}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoContext);
  if (context === undefined) {
    throw new Error("useDemoMode must be used within a DemoProvider");
  }
  return context;
}
