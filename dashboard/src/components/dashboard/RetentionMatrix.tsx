"use client";

import { useMemo, useState } from "react";
import BaseChart from "../charts/BaseChart";
import type { PivotResult } from "../../lib/semantic/retentionResult";

export type PivotViewMode = "heatmap" | "table" | "line";
export type CohortViewMode = PivotViewMode;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmtPct01(x: number): string {
  const v = clamp01(x) * 100;
  return `${v.toFixed(1)}%`;
}

function fmtPctAxis01(x: number): string {
  const v = clamp01(x) * 100;
  return `${v.toFixed(0)}%`;
}

function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "0";
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (Math.abs(x) >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return String(Math.round(x));
}

function formatPeriodLabel(raw: string): string {
  const name = String(raw ?? "").trim();
  if (!name) return "";

  const lowered = name.toLowerCase();
  const isPercent = lowered.endsWith("_percent") || lowered.endsWith("_pct") || lowered.endsWith("_rate");
  const normalized = lowered.replace(/_(percent|pct|rate)$/i, "");
  const m = /^(day_|week_|month_|quarter_|year_|period_|p)?(\d+)$|^([dwmqy])(\d+)$/.exec(normalized);
  if (!m) return name;

  const token = (m[1] ?? m[3] ?? "d").toLowerCase();
  const num = String(m[2] ?? m[4] ?? "");
  const prefix =
    token === "week_" || token === "w" ? "W" :
    token === "month_" || token === "m" ? "M" :
    token === "quarter_" || token === "q" ? "Q" :
    token === "year_" || token === "y" ? "Y" :
    "D";
  return `${prefix}${num}${isPercent ? " %" : ""}`;
}

export function CohortAnalysisChart(props: {
  title?: string;
  result: PivotResult;
  defaultViewMode?: PivotViewMode;
  height: number;
  theme: "dark" | "light";
}) {
  const [viewMode, setViewMode] = useState<PivotViewMode>(props.defaultViewMode ?? "heatmap");

  const normalized = props.result;

  const metricHeaders = useMemo(() => {
    if (Array.isArray(normalized.metricKeys) && normalized.metricKeys.length) return normalized.metricKeys;
    return normalized.periods.map((p) => `D${p}`);
  }, [normalized.metricKeys, normalized.periods]);

  const metricHeaderLabels = useMemo(() => metricHeaders.map((h) => formatPeriodLabel(h)), [metricHeaders]);

  const isPercentMetric = (name: string): boolean => {
    const n = String(name ?? "").toLowerCase();
    return n.endsWith("_percent") || n === "retention_rate" || n.endsWith("_rate");
  };

  const allPercentMetrics = useMemo(() => {
    if (metricHeaders.length === 0) return false;
    return metricHeaders.every((h) => isPercentMetric(h));
  }, [metricHeaders]);

  const heatmapRange = useMemo(() => {
    const vals: number[] = [];
    for (const row of normalized.values ?? []) {
      for (const raw of row ?? []) {
        const v = Number(raw);
        if (!Number.isFinite(v)) continue;
        vals.push(v);
      }
    }
    if (!vals.length) return { min: 0, max: allPercentMetrics ? 1 : 1 };
    if (allPercentMetrics) {
      const max = Math.max(...vals);
      return { min: 0, max: Math.max(0.1, Math.min(1, max)) };
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return { min: 0, max: Math.max(1, max) };
    return { min, max };
  }, [normalized.values, allPercentMetrics]);

  const heatmapOption = useMemo(() => {
    if (viewMode !== "heatmap") return null;

    const cohorts = normalized.cohorts;
    const periods = normalized.periods;

    const data: Array<[number, number, number]> = [];
    for (let y = 0; y < cohorts.length; y++) {
      for (let x = 0; x < periods.length; x++) {
        const v = Number((normalized.values?.[y] as any)?.[x] ?? 0);
        data.push([x, y, Number.isFinite(v) ? v : 0]);
      }
    }

    const isPct = allPercentMetrics;

    return {
      backgroundColor: props.theme === "dark" ? "transparent" : "#fff",
      grid: { left: 90, right: 20, top: 36, bottom: 28, containLabel: false },
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const x = p?.data?.[0] ?? 0;
          const y = p?.data?.[1] ?? 0;
          const v = p?.data?.[2] ?? 0;
          const cohort = cohorts[y] ?? "";
          const cohortSize = Number((normalized.cohortSizes?.[y] ?? 0) as any);
          const label = metricHeaderLabels[x] ?? metricHeaders[x] ?? `D${periods[x] ?? ""}`;
          const valStr = isPct ? fmtPct01(Number(v)) : fmtNum(Number(v));
          const sizeStr = fmtNum(cohortSize);
          return `${cohort}<br/>Size: <b>${sizeStr}</b><br/>${label}: <b>${valStr}</b>`;
        },
      },
      xAxis: {
        type: "category",
        data: metricHeaderLabels,
        axisLabel: { color: props.theme === "dark" ? "#cbd5e1" : "#111", fontSize: 11 },
        axisLine: { lineStyle: { color: props.theme === "dark" ? "#334155" : "#e2e8f0" } },
      },
      yAxis: {
        type: "category",
        data: cohorts,
        axisLabel: {
          color: props.theme === "dark" ? "#cbd5e1" : "#111",
          fontSize: 11,
          formatter: (_value: string, idx: number) => {
            const cohort = cohorts[idx] ?? "";
            const size = Number((normalized.cohortSizes?.[idx] ?? 0) as any);
            return `${cohort} (${fmtNum(size)})`;
          },
        },
        axisLine: { lineStyle: { color: props.theme === "dark" ? "#334155" : "#e2e8f0" } },
      },
      visualMap: {
        min: heatmapRange.min,
        max: heatmapRange.max,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        formatter: (v: any) => (isPct ? fmtPctAxis01(Number(v)) : fmtNum(Number(v))),
        textStyle: { color: props.theme === "dark" ? "#94a3b8" : "#334155" },
        inRange: isPct
          ? { color: ["#0f172a", "#1d4ed8", "#3b82f6", "#93c5fd"] }
          : { color: ["#0b1220", "#0f766e", "#22c55e", "#bbf7d0"] },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: {
            show: cohorts.length <= 14 && periods.length <= 14,
            color: props.theme === "dark" ? "#e2e8f0" : "#0f172a",
            fontSize: 10,
            formatter: (p: any) => {
              const v = Number(p?.data?.[2] ?? 0);
              return isPct ? fmtPctAxis01(v) : fmtNum(v);
            },
          },
          emphasis: {
            itemStyle: {
              borderColor: "rgba(255,255,255,0.7)",
              borderWidth: 1,
              shadowBlur: 12,
              shadowColor: "rgba(0,0,0,0.4)",
            },
          },
        },
      ],
    } as any;
  }, [viewMode, normalized, props.theme, metricHeaders, metricHeaderLabels, allPercentMetrics]);

  const lineOption = useMemo(() => {
    if (viewMode !== "line") return null;
    const x = normalized.cohorts;
    const series = metricHeaders.map((k, seriesIdx) => {
      const data = normalized.values.map((row) => {
        const v = Number((row as any)?.[seriesIdx] ?? 0);
        return Number.isFinite(v) ? v : 0;
      });
      return {
        type: "line",
        name: metricHeaderLabels[seriesIdx] ?? k,
        data,
        smooth: true,
        showSymbol: false,
      };
    });

    return {
      backgroundColor: props.theme === "dark" ? "transparent" : "#fff",
      tooltip: {
        trigger: "axis",
        formatter: (items: any) => {
          const it = Array.isArray(items) ? items : [];
          const idx = Number(it?.[0]?.dataIndex ?? 0);
          const header = x[idx] ?? "";
          const cohortSize = Number((normalized.cohortSizes?.[idx] ?? 0) as any);
          const lines = it.map((p: any) => {
            const name = String(p?.seriesName ?? "");
            const val = Number(p?.data ?? 0);
            const vStr = isPercentMetric(name) ? fmtPct01(val) : fmtNum(val);
            return `${name}: <b>${vStr}</b>`;
          });
          return [header, `Size: <b>${fmtNum(cohortSize)}</b>`, ...lines].join("<br/>");
        },
      },
      legend: {
        top: 0,
        textStyle: { color: props.theme === "dark" ? "#cbd5e1" : "#111", fontSize: 10 },
        type: "scroll",
      },
      grid: { left: 40, right: 20, top: 28, bottom: 28, containLabel: true },
      xAxis: {
        type: "category",
        data: x,
        axisLabel: { color: props.theme === "dark" ? "#cbd5e1" : "#111", fontSize: 11 },
        axisLine: { lineStyle: { color: props.theme === "dark" ? "#334155" : "#e2e8f0" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: props.theme === "dark" ? "#cbd5e1" : "#111",
          formatter: (v: any) => (allPercentMetrics ? fmtPctAxis01(Number(v)) : fmtNum(Number(v))),
        },
        splitLine: { lineStyle: { color: props.theme === "dark" ? "#1f2937" : "#e2e8f0" } },
      },
      series,
    } as any;
  }, [viewMode, normalized, props.theme, metricHeaders, metricHeaderLabels, allPercentMetrics]);

  return (
    <div className="w-full h-full p-2 bg-slate-950/0">
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="text-sm font-semibold text-slate-200 truncate">{props.title ?? "Cohort Pivot"}</div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode("heatmap")}
              className={`px-3 py-1.5 text-xs ${viewMode === "heatmap" ? "bg-white/15 text-emerald-300" : "bg-white/5 text-slate-300"}`}
            >
              Heatmap
            </button>
            <button
              type="button"
              onClick={() => setViewMode("line")}
              className={`px-3 py-1.5 text-xs ${viewMode === "line" ? "bg-white/15 text-emerald-300" : "bg-white/5 text-slate-300"}`}
            >
              Line
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-xs ${viewMode === "table" ? "bg-white/15 text-emerald-300" : "bg-white/5 text-slate-300"}`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {viewMode === "heatmap" && heatmapOption && (
        <div className="w-full" style={{ height: Math.max(160, props.height - 44) }}>
          <BaseChart option={heatmapOption} height={Math.max(160, props.height - 44)} />
        </div>
      )}

      {viewMode === "line" && lineOption && (
        <div className="w-full" style={{ height: Math.max(160, props.height - 44) }}>
          <BaseChart option={lineOption} height={Math.max(160, props.height - 44)} />
        </div>
      )}

      {viewMode === "table" && (
        <div className="w-full overflow-auto custom-scrollbar" style={{ maxHeight: Math.max(160, props.height - 44) }}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-white/5">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">Cohort</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">Size</th>
                {metricHeaders.map((h, idx) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-300 whitespace-nowrap">{metricHeaderLabels[idx] ?? h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.cohorts.map((c, rowIdx) => (
                <tr key={c} className={rowIdx % 2 === 0 ? "bg-white/[0.02]" : ""}>
                  <td className="px-3 py-2 text-slate-200 whitespace-nowrap">{c}</td>
                  <td className="px-3 py-2 text-slate-200 whitespace-nowrap">{fmtNum(Number((normalized.cohortSizes?.[rowIdx] ?? 0) as any))}</td>
                  {metricHeaders.map((h, colIdx) => {
                    const v = Number((normalized.values?.[rowIdx] as any)?.[colIdx] ?? 0);
                    const text = isPercentMetric(h) ? fmtPct01(v) : fmtNum(v);
                    return (
                      <td key={`${c}:${h}`} className="px-3 py-2 text-slate-200 whitespace-nowrap" title={text}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
