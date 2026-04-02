"use client";

import { X } from "lucide-react";
import type React from "react";

export function SlicerFieldBinding({
  mode,
  fieldRef,
  hierarchyLevels,
  isDropOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClearField,
  onClearLevels,
}: {
  mode: "list" | "dropdown" | "tile" | "dateRange" | "range" | "hierarchy" | "input";
  fieldRef: string;
  hierarchyLevels: string[];
  isDropOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClearField: () => void;
  onClearLevels: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`mt-2 rounded-xl border px-3 py-2 transition ${
        isDropOver
          ? "border-emerald-300 bg-emerald-50"
          : "border-slate-200 bg-slate-50"
      }`}
      title={mode === "hierarchy" ? "Drag fields to add hierarchy levels (drill order)" : "Drag a field from Fields panel"}
    >
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        {mode === "hierarchy" ? "Hierarchy levels" : "Field"}
      </div>
      <div className="mt-1">
        {mode === "hierarchy" ? (
          <div className="space-y-2">
            {hierarchyLevels.length === 0 ? (
              <div className="text-[11px] text-slate-500 py-1">{isDropOver ? "Drop here" : "Drag fields here (first = top level)"}</div>
            ) : (
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700">
                {hierarchyLevels.map((lev, i) => (
                  <li key={`${i}-${lev}`} className="truncate font-mono">{lev}</li>
                ))}
              </ol>
            )}
            {hierarchyLevels.length > 0 && (
              <button
                type="button"
                onClick={onClearLevels}
                className="text-[10px] text-rose-600 hover:text-rose-700 underline"
              >
                Clear levels
              </button>
            )}
          </div>
        ) : fieldRef ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-900 truncate">
              {fieldRef}
            </div>
            <button
              type="button"
              onClick={onClearField}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
              title="Clear field"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 py-1">{isDropOver ? "Drop here" : "Drag field here"}</div>
        )}
      </div>
    </div>
  );
}
