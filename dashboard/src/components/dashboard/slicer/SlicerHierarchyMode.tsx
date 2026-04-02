"use client";

import { Search } from "lucide-react";

export function SlicerHierarchyMode({
  hasBinding,
  valueSearch,
  onValueSearchChange,
  hierarchyPath,
  hierarchyCursor,
  restrictToLeafNodes,
  filteredSuggestions,
  suggestLoading,
  suggestError,
  onApplyLevelValue,
  onGoBack,
}: {
  hasBinding: boolean;
  valueSearch: string;
  onValueSearchChange: (v: string) => void;
  hierarchyPath: string[];
  hierarchyCursor: string;
  restrictToLeafNodes: boolean;
  filteredSuggestions: string[];
  suggestLoading: boolean;
  suggestError: string | null;
  onApplyLevelValue: (v: string) => void;
  onGoBack: () => void;
}) {
  return (
    <>
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
      {suggestError && <div className="mt-2 text-xs text-rose-500">{suggestError}</div>}
      {suggestLoading && <div className="mt-2 text-xs text-slate-500">Loading...</div>}
      {!suggestLoading && !suggestError && hasBinding && filteredSuggestions.length === 0 && (
        <div className="mt-2 text-xs text-slate-500 py-2">No values</div>
      )}
      <div className="mt-2 max-h-[260px] overflow-auto custom-scrollbar">
        {hierarchyPath.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-500 truncate max-w-full">{hierarchyPath.join(" → ")}</span>
            <button
              type="button"
              onClick={onGoBack}
              className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Back
            </button>
          </div>
        )}
        {hierarchyCursor && (
          <div className="mb-1 text-[10px] text-slate-500 font-mono truncate" title={hierarchyCursor}>
            Level: {hierarchyCursor}
          </div>
        )}
        <div className="space-y-1">
          {filteredSuggestions.map((v, idx) => (
            <button
              key={`${idx}-${v}`}
              type="button"
              onClick={() => onApplyLevelValue(v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-left"
              title={v}
            >
              <div className="min-w-0">
                <div className="text-xs text-slate-800 truncate">{v}</div>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">
                {restrictToLeafNodes ? "pick" : "→"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
