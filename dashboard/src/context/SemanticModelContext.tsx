"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";
import type { SemanticModelV1 } from "../lib/semantic/types";

type SemanticModelContextValue = {
  semanticModelV1: SemanticModelV1 | null;
  setSemanticModelV1: (model: SemanticModelV1 | null) => void;
};

const SemanticModelContext = createContext<SemanticModelContextValue | null>(null);

export function SemanticModelProvider({ children }: { children: ReactNode }) {
  const [semanticModelV1, setSemanticModelV1] = useState<SemanticModelV1 | null>(null);

  return (
    <SemanticModelContext.Provider value={{ semanticModelV1, setSemanticModelV1 }}>
      {children}
    </SemanticModelContext.Provider>
  );
}

export function useSemanticModel(): SemanticModelContextValue {
  const ctx = useContext(SemanticModelContext);
  if (!ctx) {
    throw new Error("useSemanticModel must be used within SemanticModelProvider");
  }
  return ctx;
}
