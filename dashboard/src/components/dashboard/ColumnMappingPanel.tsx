"use client";

import { useEffect, useMemo, useState } from "react";
import { SelectDropdown } from "../chart-config/SelectDropdown";
import { resolveVizType } from "./dbChartBuilder";
import { isVizType, type VizType } from "@/types/viz";
import {
  chartInferPhysicalKind,
  defaultAggForMeasureType,
} from "@/lib/chart/sqlTypePhysicalKind";

export type ColumnMeta = {
  name: string;
  type?: string;
  nullable?: boolean;
};

export type AggFn = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX" | "LAST";

export type ColumnMapping = {
  xColumn?: string;
  yColumns: Array<{ col: string; agg: AggFn }>;
  groupBy?: string;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function ColumnMappingPanel({
  chartName,
  columns,
  initialMapping,
  onApply,
  variant,
  vizTypeOverride,
}: {
  chartName: string;
  columns: ColumnMeta[];
  initialMapping: ColumnMapping | null;
  onApply: (mapping: ColumnMapping) => void;
  variant?: "fullscreen" | "card";
  vizTypeOverride?: VizType | null;
}) {
  const vizType: VizType = useMemo(() => {
    const forced = String(vizTypeOverride ?? "").trim().toLowerCase();
    if (isVizType(forced)) return forced;
    const resolved = resolveVizType(chartName);
    return isVizType(resolved) ? resolved : "auto";
  }, [chartName, vizTypeOverride]);
  const viz = String(vizType);

  const { dateCols, numCols, strCols, allCols } = useMemo(() => {
    const allCols = columns.map((c) => c.name).filter(Boolean);
    const dateCols = columns.filter((c) => chartInferPhysicalKind(c.type) === "date").map((c) => c.name);
    const numCols = columns.filter((c) => chartInferPhysicalKind(c.type) === "number").map((c) => c.name);
    const strCols = columns.filter((c) => chartInferPhysicalKind(c.type) === "string").map((c) => c.name);
    return { dateCols, numCols, strCols, allCols };
  }, [columns]);

  const needsX = viz !== "kpi" && viz !== "table" && viz !== "scatter";
  const needsY = viz !== "table" && viz !== "scatter" && viz !== "histogram";

  const xCandidates = useMemo(() => {
    if (viz === "line" || viz === "area") return uniq([...dateCols, ...strCols, ...numCols]);
    if (viz === "bar") return uniq([...strCols, ...dateCols, ...numCols]);
    if (viz === "pie" || viz === "donut" || viz === "treemap") return uniq([...strCols, ...dateCols, ...numCols]);
    if (viz === "histogram") return numCols;
    if (viz === "scatter") return numCols;
    return allCols;
  }, [viz, dateCols, strCols, numCols, allCols]);

  const yCandidates = useMemo(() => {
    if (viz === "scatter" || viz === "histogram") return numCols;
    return numCols.length > 0 ? numCols : allCols;
  }, [viz, numCols, allCols]);

  const groupCandidates = useMemo(() => {
    if (viz === "pie" || viz === "donut" || viz === "treemap") return [];
    if (viz === "scatter" || viz === "histogram" || viz === "kpi" || viz === "table") return [];
    return uniq([...strCols, ...dateCols]);
  }, [viz, strCols, dateCols]);

  const aggOptions: Array<{ value: AggFn; label: string }> = useMemo(() => {
    const base: Array<{ value: AggFn; label: string }> = [
      { value: "SUM", label: "SUM" },
      { value: "COUNT", label: "COUNT" },
      { value: "AVG", label: "AVG" },
      { value: "MIN", label: "MIN" },
      { value: "MAX", label: "MAX" },
    ];
    if (viz === "kpi") base.push({ value: "LAST", label: "LAST" });
    return base;
  }, [viz]);

  const defaultX = initialMapping?.xColumn || (xCandidates[0] ?? "");
  const defaultY = initialMapping?.yColumns?.length
    ? initialMapping.yColumns
    : yCandidates[0]
      ? [
          {
            col: yCandidates[0],
            agg: defaultAggForMeasureType(columns.find((c) => c.name === yCandidates[0])?.type) as AggFn,
          },
        ]
      : [];

  const [xColumn, setXColumn] = useState<string>(defaultX);
  const [groupBy, setGroupBy] = useState<string>(initialMapping?.groupBy ?? "");
  const [measures, setMeasures] = useState<Array<{ col: string; agg: AggFn }>>(defaultY);

  useEffect(() => {
    setXColumn(defaultX);
    setGroupBy(initialMapping?.groupBy ?? "");
    setMeasures(defaultY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartName, vizTypeOverride, initialMapping]);

  const canApply = useMemo(() => {
    if (viz === "table") return true;
    if (viz === "kpi") return measures.length >= 1 && !!measures[0]?.col;
    if (viz === "histogram") return !!xColumn;
    if (viz === "scatter") return measures.length >= 2 && !!measures[0]?.col && !!measures[1]?.col;
    if (needsX && !xColumn) return false;
    if (needsY && measures.filter((m) => m.col).length === 0) return false;
    return true;
  }, [viz, needsX, needsY, xColumn, measures]);

  const xOptions = useMemo(() => xCandidates.map((c) => ({ value: c, label: c })), [xCandidates]);
  const groupOptions = useMemo(
    () => [{ value: "", label: "(none)" }, ...groupCandidates.map((c) => ({ value: c, label: c }))],
    [groupCandidates]
  );
  const yOptions = useMemo(() => yCandidates.map((c) => ({ value: c, label: c })), [yCandidates]);

  const v = variant ?? "fullscreen";

  const card = (
    <div className="w-full max-w-[520px] rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl p-4">
      <div className="text-sm font-semibold text-white">Configure data mapping</div>
      <div className="text-xs text-slate-400 mt-1">{chartName}</div>

      <div className="mt-4 space-y-3">
        {needsX && (
          <SelectDropdown
            label={vizType === "histogram" ? "Value column" : "X Axis"}
            value={xColumn}
            onChange={setXColumn}
            options={xOptions}
            placeholder="Select column..."
          />
        )}

        {(viz === "scatter") && (
          <>
            <div className="text-xs font-medium text-slate-300">Scatter columns</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SelectDropdown
                label="X"
                value={measures[0]?.col ?? ""}
                onChange={(v) =>
                  setMeasures((prev) => [
                    { col: v, agg: defaultAggForMeasureType(columns.find((c) => c.name === v)?.type) as AggFn },
                    prev[1] ?? { col: "", agg: "SUM" as AggFn },
                  ])
                }
                options={yOptions}
                placeholder="Select numeric..."
              />
              <SelectDropdown
                label="Y"
                value={measures[1]?.col ?? ""}
                onChange={(v) =>
                  setMeasures((prev) => [
                    prev[0] ?? { col: "", agg: "SUM" as AggFn },
                    { col: v, agg: defaultAggForMeasureType(columns.find((c) => c.name === v)?.type) as AggFn },
                  ])
                }
                options={yOptions}
                placeholder="Select numeric..."
              />
            </div>
          </>
        )}

        {needsY && viz !== "scatter" && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-300">Y Values</div>
              <button
                type="button"
                onClick={() => setMeasures((prev) => [...prev, { col: "", agg: "SUM" }])}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {measures.map((m, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_140px_36px] gap-2 items-end">
                  <SelectDropdown
                    label={idx === 0 ? "Measure" : undefined}
                    value={m.col}
                    onChange={(v) =>
                      setMeasures((prev) =>
                        prev.map((p, i) =>
                          i === idx
                            ? {
                                ...p,
                                col: v,
                                agg: defaultAggForMeasureType(columns.find((c) => c.name === v)?.type) as AggFn,
                              }
                            : p
                        )
                      )
                    }
                    options={yOptions}
                    placeholder="Select numeric..."
                  />
                  <SelectDropdown
                    label={idx === 0 ? "Agg" : undefined}
                    value={m.agg}
                    onChange={(v) => setMeasures((prev) => prev.map((p, i) => i === idx ? { ...p, agg: v as AggFn } : p))}
                    options={aggOptions}
                  />
                  <button
                    type="button"
                    onClick={() => setMeasures((prev) => prev.filter((_, i) => i !== idx))}
                    className="h-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-200 text-sm"
                    title="Remove"
                    disabled={measures.length <= 1}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {groupCandidates.length > 0 && (
          <SelectDropdown
            label="Group by"
            value={groupBy}
            onChange={setGroupBy}
            options={groupOptions}
          />
        )}

        <div className="pt-3 flex items-center justify-end">
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              const mapping: ColumnMapping = {
                xColumn: xColumn || undefined,
                yColumns: measures.filter((m) => m.col),
                groupBy: groupBy || undefined,
              };
              onApply(mapping);
            }}
            className="px-4 py-2 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          Tip: pick a date column for line charts and a category column for bar/pie charts.
        </div>
      </div>
    </div>
  );

  return (
    v === "card"
      ? card
      : (
        <div className="w-full h-full p-3 bg-slate-950 flex items-center justify-center">
          {card}
        </div>
      )
  );
}
