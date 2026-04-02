"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function FormatPanel({ children }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">Format</div>
      {children}
    </div>
  );
}
