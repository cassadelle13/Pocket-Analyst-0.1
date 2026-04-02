"use client";

export function SlicerDateRangeMode({
  hasBinding,
  dateOp,
  dateFrom,
  dateTo,
  dateMode,
  relativeAmount,
  relativeUnit,
  onDateOpChange,
  onDateFromChange,
  onDateToChange,
  onDateModeChange,
  onRelativeAmountChange,
  onRelativeUnitChange,
  onClear,
  onApply,
}: {
  hasBinding: boolean;
  dateOp: "between" | "gte" | "lte";
  dateFrom: string;
  dateTo: string;
  dateMode: "absolute" | "relative";
  relativeAmount: number;
  relativeUnit: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
  onDateOpChange: (v: "between" | "gte" | "lte") => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onDateModeChange: (v: "absolute" | "relative") => void;
  onRelativeAmountChange: (v: number) => void;
  onRelativeUnitChange: (v: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year") => void;
  onClear: () => void;
  onApply: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
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
          <option value="gte">After (&gt;=)</option>
          <option value="lte">Before (&lt;=)</option>
        </select>
        <select
          value={dateMode}
          onChange={(e) => onDateModeChange(String(e.target.value) === "relative" ? "relative" : "absolute")}
          disabled={!hasBinding}
          className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
        >
          <option value="absolute">Absolute</option>
          <option value="relative">Relative date</option>
        </select>
      </div>
      {dateMode === "relative" ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={1}
            value={relativeAmount}
            onChange={(e) => onRelativeAmountChange(Math.max(1, Number(e.target.value || 1)))}
            className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none"
          />
          <select
            value={relativeUnit}
            onChange={(e) => {
              const unit = String(e.target.value ?? "");
              if (unit !== "minute" && unit !== "hour" && unit !== "day" && unit !== "week" && unit !== "month" && unit !== "quarter" && unit !== "year") return;
              onRelativeUnitChange(unit);
            }}
            className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none"
          >
            <option value="minute">minutes</option>
            <option value="hour">hours</option>
            <option value="day">days</option>
            <option value="week">weeks</option>
            <option value="month">months</option>
            <option value="quarter">quarters</option>
            <option value="year">years</option>
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            disabled={!hasBinding || dateOp === "lte"}
            className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
          />
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            disabled={!hasBinding || dateOp === "gte"}
            className="h-10 px-3 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 outline-none disabled:opacity-50"
          />
        </div>
      )}
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
