"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function FieldWellsPanel({ children }: Props) {
  return (
    <div className="border-t border-white/10 pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/5">
        <div className="text-[11px] font-medium text-slate-400">Build visual</div>
        <div className="text-[10px] text-slate-500 truncate">Drag from Data</div>
      </div>
      {children}
      <div className="pt-2 border-t border-white/5">
        <div className="text-[10px] text-slate-500 italic">
          Drag fields from the <span className="text-slate-400 not-italic font-medium">Data</span> pane.
        </div>
      </div>
    </div>
  );
}
