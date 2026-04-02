"use client";

export function SlicerNumericRangeMode({
  hasBinding,
  dateOp,
  dateFrom,
  dateTo,
  onDateOpChange,
  onDateFromChange,
  onDateToChange,
  onClear,
  onApply,
}: {
  hasBinding: boolean;
  dateOp: "between" | "gte" | "lte";
  dateFrom: string;
  dateTo: string;
  onDateOpChange: (v: "between" | "gte" | "lte") => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-2">
      <select
        value={dateOp}
        onChange={(e) => {
          const next = String(e.target.value);
          if (next !== "between" && next !== "gte" && next !== "lte") return;
          onDateOpChange(next);
        }}
        disabled={!hasBinding}
        className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
      >
        <option value="between">Between</option>
        <option value="gte">Greater or equal</option>
        <option value="lte">Less or equal</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          disabled={!hasBinding || dateOp === "lte"}
          className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
        />
        <input
          type="number"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          disabled={!hasBinding || dateOp === "gte"}
          className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
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
          disabled={!hasBinding}
          className="h-9 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-xs text-emerald-800 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
