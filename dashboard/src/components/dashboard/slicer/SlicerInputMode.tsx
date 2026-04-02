"use client";

import type { SlicerState } from "./types";

export function SlicerInputMode({
  hasBinding,
  textFilterOp,
  textFilterValue,
  onTextFilterOpChange,
  onTextFilterValueChange,
  onClear,
  onApply,
}: {
  hasBinding: boolean;
  textFilterOp: SlicerState["textFilterOp"];
  textFilterValue: string;
  onTextFilterOpChange: (v: SlicerState["textFilterOp"]) => void;
  onTextFilterValueChange: (v: string) => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-2 mt-2">
      <select
        value={textFilterOp}
        onChange={(e) => {
          const v = String(e.target.value ?? "");
          const ok = ["eq", "contains", "startswith", "icontains", "istartswith"].includes(v);
          if (!ok) return;
          onTextFilterOpChange(v as SlicerState["textFilterOp"]);
        }}
        disabled={!hasBinding}
        className="w-full h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
      >
        <option value="eq">Equals</option>
        <option value="contains">Contains (case-sensitive)</option>
        <option value="icontains">Contains (case-insensitive)</option>
        <option value="startswith">Starts with</option>
        <option value="istartswith">Starts with (case-insensitive)</option>
      </select>
      <input
        value={textFilterValue}
        onChange={(e) => onTextFilterValueChange(e.target.value)}
        placeholder={hasBinding ? "Filter value…" : "Bind a field first"}
        disabled={!hasBinding}
        className="w-full bg-slate-100 border border-slate-200 focus:border-emerald-400/60 outline-none rounded-xl px-3 py-2 text-sm text-slate-900 disabled:opacity-50"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={!hasBinding}
          className="h-9 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!hasBinding || !textFilterValue.trim()}
          className="h-9 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-xs text-emerald-800 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
