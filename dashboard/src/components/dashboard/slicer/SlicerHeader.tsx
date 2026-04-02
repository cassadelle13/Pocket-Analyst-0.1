"use client";

import { ArrowDownAZ, ArrowUpAZ, Eraser } from "lucide-react";

export function SlicerHeader({
  title,
  scopeLabel,
  hasSelection,
  sortOrder,
  onToggleSort,
  onClearSelection,
}: {
  title: string;
  scopeLabel: string;
  hasSelection: boolean;
  sortOrder: "asc" | "desc";
  onToggleSort: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        <div className="text-[11px] text-slate-500 truncate">{scopeLabel}</div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSort}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
          title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
        >
          {sortOrder === "asc" ? <ArrowUpAZ className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
        </button>
        {hasSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
            title="Clear selection"
          >
            <Eraser className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
