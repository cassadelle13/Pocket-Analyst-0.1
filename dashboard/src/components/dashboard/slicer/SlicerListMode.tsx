"use client";

import { useRef, type MouseEvent } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

export function SlicerListMode({
  hasBinding,
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
  onPasteValues,
  valuesFontSize,
  valuesBackgroundColor,
}: {
  hasBinding: boolean;
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
  onPasteValues: (raw: string) => void;
  valuesFontSize: number;
  valuesBackgroundColor: string;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredSuggestions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => Math.max(36, valuesFontSize + 22),
    overscan: 8,
  });

  return (
    <>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={valueSearch}
          onChange={(e) => onValueSearchChange(e.target.value)}
          onPaste={(e) => {
            const raw = e.clipboardData?.getData("text/plain") ?? "";
            if (!raw.trim()) return;
            e.preventDefault();
            onPasteValues(raw);
          }}
          placeholder={hasBinding ? "Search values..." : ""}
          disabled={!hasBinding}
          className="w-full bg-slate-100 border border-slate-200 focus:border-emerald-400/60 outline-none rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 disabled:opacity-50"
        />
      </div>
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
      {suggestLoading && <div className="mt-2 text-xs text-slate-500">Loading…</div>}
      {!suggestLoading && !suggestError && hasBinding && filteredSuggestions.length === 0 && (
        <div className="mt-2 text-xs text-slate-500 py-2">No values</div>
      )}
      {orientation === "horizontal" ? (
        <div className="mt-2 max-h-[260px] overflow-auto custom-scrollbar">
          <div className="flex flex-wrap gap-2">
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
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
                  style={{
                    backgroundColor: checked ? valuesBackgroundColor : undefined,
                    fontSize: `${valuesFontSize}px`,
                  }}
                  title={v}
                >
                  <span className="truncate max-w-[220px]">{v}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div ref={parentRef} className="mt-2 max-h-[260px] overflow-auto custom-scrollbar">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const v = filteredSuggestions[virtualRow.index];
              if (!v) return null;
              const checked = selected.has(v);
              const blockUnselect = forceSelection && !multiSelect && checked && selected.size <= 1;
              return (
                <button
                  key={`${virtualRow.index}-${v}`}
                  type="button"
                  onClick={(e) => {
                    if (blockUnselect) return;
                    onToggleValue(v, e);
                  }}
                  className="absolute left-0 top-0 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left text-slate-900"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    backgroundColor: checked ? valuesBackgroundColor : undefined,
                    fontSize: `${valuesFontSize}px`,
                  }}
                  title={v}
                >
                  <div className="min-w-0">
                    <div className="truncate">{v}</div>
                  </div>
                  {multiSelect ? (
                    <div className={`w-4 h-4 rounded border shrink-0 ${checked ? "bg-emerald-100 border-emerald-500" : "bg-white border-slate-300"}`} />
                  ) : (
                    <div className={`w-4 h-4 rounded-full border shrink-0 ${checked ? "bg-emerald-100 border-emerald-500" : "bg-white border-slate-300"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
