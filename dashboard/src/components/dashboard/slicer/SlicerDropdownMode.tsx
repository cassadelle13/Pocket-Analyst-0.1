"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { MouseEvent } from "react";

export function SlicerDropdownMode({
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
  showSelectAll,
  onToggleValue,
  onSingleSelect,
  onSelectAllToggle,
  onPasteValues,
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
  showSelectAll: boolean;
  onToggleValue: (v: string, e?: MouseEvent) => void;
  onSingleSelect: (v: string) => void;
  onSelectAllToggle: () => void;
  onPasteValues: (raw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedValues = useMemo(() => Array.from(selected), [selected]);
  const triggerLabel = !selectedValues.length
    ? "Select value"
    : (!multiSelect ? selectedValues[0] : `${selectedValues.length} selected`);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: globalThis.MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      setOpen(false);
    };
    const onDocKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onDocKeyDown);
    return () => {
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  return (
    <div className="space-y-2" ref={rootRef}>
      <button
        type="button"
        disabled={!hasBinding}
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50 flex items-center justify-between"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-500" />
      </button>
      {open && (
        <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2 shadow-lg">
          {showSearch && (
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
          )}
          {showSelectAll && multiSelect && (
            <button
              type="button"
              onClick={onSelectAllToggle}
              className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition"
            >
              {filteredSuggestions.length > 0 && filteredSuggestions.every((v) => selected.has(v)) ? "Clear all" : "Select all"}
            </button>
          )}
          {suggestError && <div className="text-xs text-rose-500">{suggestError}</div>}
          {suggestLoading && <div className="text-xs text-slate-500">Loading...</div>}
          {!suggestLoading && !suggestError && hasBinding && filteredSuggestions.length === 0 && (
            <div className="text-xs text-slate-500 py-1">No values</div>
          )}
          <div className="max-h-[200px] overflow-auto custom-scrollbar space-y-1">
            {filteredSuggestions.map((v, idx) => {
              const checked = selected.has(v);
              return (
                <button
                  key={`${idx}-${v}`}
                  type="button"
                  onClick={(e) => {
                    if (multiSelect) onToggleValue(v, e);
                    else {
                      if (forceSelection && checked && selectedValues.length <= 1) return;
                      onSingleSelect(v);
                      setOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-left"
                  title={v}
                >
                  <span className="truncate text-xs text-slate-900">{v}</span>
                  {checked && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
