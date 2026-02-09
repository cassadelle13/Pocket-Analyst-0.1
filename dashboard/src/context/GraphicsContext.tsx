/**
 * Graphics Mode Context
 * Manages Low Graphics Mode for emergency fallback
 */

"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react";
import { getSentinel } from "../lib/sentinel";
import type { FrontendError } from "../lib/sentinel";

interface GraphicsContextType {
  isLowGraphicsMode: boolean;
  enableLowGraphicsMode: () => void;
  disableLowGraphicsMode: () => void;
  toggleGraphicsMode: () => void;
}

const GraphicsContext = createContext<GraphicsContextType | undefined>(undefined);

export function GraphicsProvider({ children }: { children: ReactNode }) {
  const [isLowGraphicsMode, setIsLowGraphicsMode] = useState(false);

  useEffect(() => {
    // Check localStorage for saved preference
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pocketanalyst_low_graphics");
      if (stored === "true") {
        setIsLowGraphicsMode(true);
      }
    }

    // Listen for critical errors from Sentinel
    const sentinel = getSentinel();
    const unsubscribe = sentinel.onError((error: FrontendError) => {
      // Auto-enable Low Graphics Mode on critical errors in Analytics
      if (
        error.severity === 'critical' &&
        error.type === 'react_error' &&
        error.url?.includes('/analytics')
      ) {
        console.warn('[GraphicsContext] Critical error detected, enabling Low Graphics Mode');
        setIsLowGraphicsMode(true);
        localStorage.setItem("pocketanalyst_low_graphics", "true");
      }
    });

    return unsubscribe;
  }, []);

  const enableLowGraphicsMode = useCallback(() => {
    setIsLowGraphicsMode(true);
    localStorage.setItem("pocketanalyst_low_graphics", "true");
  }, []);

  const disableLowGraphicsMode = useCallback(() => {
    setIsLowGraphicsMode(false);
    localStorage.setItem("pocketanalyst_low_graphics", "false");
  }, []);

  const toggleGraphicsMode = useCallback(() => {
    setIsLowGraphicsMode((prev) => {
      const next = !prev;
      localStorage.setItem("pocketanalyst_low_graphics", String(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isLowGraphicsMode, enableLowGraphicsMode, disableLowGraphicsMode, toggleGraphicsMode }),
    [isLowGraphicsMode, enableLowGraphicsMode, disableLowGraphicsMode, toggleGraphicsMode]
  );

  return (
    <GraphicsContext.Provider value={value}>
      {children}
    </GraphicsContext.Provider>
  );
}

export function useGraphicsMode() {
  const context = useContext(GraphicsContext);
  if (context === undefined) {
    throw new Error("useGraphicsMode must be used within a GraphicsProvider");
  }
  return context;
}
