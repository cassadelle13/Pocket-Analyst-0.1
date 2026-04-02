"use client";

import { Search } from "lucide-react";
import type { MouseEvent } from "react";

export function SlicerTileMode({
  hasBinding,
  showSearch,
  valueSearch,
  onValueSearchChange,
  filteredSuggestions,
  suggestLoading,
  suggestError,
  selected,
  multiSelect,
  forceSelection,
  orientation,
  showSelectAll,
  onToggleValue,
  onSelectAllToggle,
  valuesFontSize,
}: {
  hasBinding: boolean;
  showSearch: boolean;
  valueSearch: string;
  onValueSearchChange: (v: string) => void;
  filteredSuggestions: string[];
  suggestLoading: boolean;
  suggestError: string | null;
  selected: Set<string>;
  multiSelect: boolean;
  forceSelection: boolean;
  orientation: "vertical" | "horizontal";
  showSelectAll: boolean;
  onToggleValue: (v: string, e?: MouseEvent) => void;
  onSelectAllToggle: () => void;
  valuesFontSize: number;
}) {
  return (
    <>
      {showSearch && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={valueSearch}
            onChange={(e) => onValueSearchChange(e.target.value)}
            placeholder={hasBinding ? "Search values..." : ""}
            disabled={!hasBinding}
            className="w-full bg-slate-100 border border-slate-200 focus:border-emerald-400/60 outline-none rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 disabled:opacity-50"
          />
        </div>
      )}
      {showSelectAll && multiSelect && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onSelectAllToggle}
            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition"
          >
            {filteredSuggestions.length > 0 && filteredSuggestions.every((v) => selected.has(v)) ? "Clear all" : "Select all"}
          </button>
        </div>
      )}
      {suggestError && <div className="mt-2 text-xs text-rose-500">{suggestError}</div>}
      {suggestLoading && <div className="mt-2 text-xs text-slate-500">Loading...</div>}
      {!suggestLoading && !suggestError && hasBinding && filteredSuggestions.length === 0 && (
        <div className="mt-2 text-xs text-slate-500 py-2">No values</div>
      )}
      <div className="mt-2 max-h-[260px] overflow-auto custom-scrollbar">
        <div className={orientation === "vertical" ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
          {filteredSuggestions.map((v, idx) => {
            const checked = selected.has(v);
            const blockUnselect = forceSelection && !multiSelect && checked && selected.size <= 1;
            return (
              <button
                key={`${idx}-${v}`}
                type="button"
                onClick={(e) => {
                  if (blockUnselect) return;
                  onToggleValue(v, e);
                }}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border ${checked ? "border-emerald-400/60 bg-emerald-100 text-emerald-900" : "border-slate-200 bg-white hover:bg-slate-100 text-slate-800"}`}
                style={{ fontSize: `${valuesFontSize}px` }}
                title={v}
              >
                <span className="truncate max-w-[240px]">{v}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
