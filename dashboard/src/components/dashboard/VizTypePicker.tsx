"use client";

import type { VizType } from "@/types/viz";

type PickerItem = {
  id: string;
  label: string;
  icon: string;
};

const VIZ_ITEMS: PickerItem[] = [
  { id: "line", label: "Line", icon: "📈" },
  { id: "area", label: "Area", icon: "🟩" },
  { id: "bar", label: "Bar", icon: "📊" },
  { id: "column", label: "Column", icon: "📶" },
  { id: "pie", label: "Pie", icon: "🥧" },
  { id: "donut", label: "Donut", icon: "🍩" },
  { id: "scatter", label: "Scatter", icon: "🔵" },
  { id: "table", label: "Table", icon: "📋" },
  { id: "pivot", label: "Pivot", icon: "🧩" },
  { id: "kpi", label: "KPI", icon: "🏷️" },
  { id: "funnel", label: "Funnel", icon: "🔻" },
  { id: "waterfall", label: "Waterfall", icon: "🪜" },
  { id: "treemap", label: "Treemap", icon: "🟫" },
  { id: "histogram", label: "Histogram", icon: "📉" },
  { id: "cohort", label: "Cohort", icon: "🧠" },
  { id: "slicer", label: "Slicer", icon: "🎚️" },
];

const SUPPORTED = new Set(["line", "area", "bar", "column", "pie", "donut", "scatter", "table", "pivot", "kpi", "histogram", "slicer", "funnel", "waterfall", "treemap", "cohort"]);

type Props = {
  activeChartId: string | null;
  canEdit: boolean;
  vizType: VizType;
  onSelect: (v: VizType) => void;
};

export function VizTypePicker({ activeChartId, canEdit, vizType, onSelect }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-slate-500">Visualizations</div>
        <div className="text-[11px] text-slate-400 truncate">{activeChartId ? `Chart ${activeChartId}` : "No chart selected"}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {VIZ_ITEMS.map(({ id, label, icon }) => {
          const supported = SUPPORTED.has(id);
          const selected = vizType === (id as VizType);
          return (
            <button
              key={id}
              type="button"
              disabled={!canEdit || !supported}
              onClick={() => supported && onSelect(id as VizType)}
              className={`px-2 py-2 rounded-xl border text-[11px] font-semibold transition ${
                selected
                  ? "bg-white/15 border-white/25 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              } ${!supported ? "opacity-45 cursor-not-allowed" : ""}`}
              title={supported ? label : `${label} (coming soon)`}
            >
              <div className="text-base leading-none">{icon}</div>
              <div className="mt-1">{label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
