/**
 * Adapters: transform raw dbTableData (columns + rows) into formats
 * expected by each existing chart component (UPlotTrendModule, BarChartModule,
 * BaseChart options, KPI cards, etc.).
 *
 * Re-uses detectColType / pickAxes from dbChartBuilder.ts for column analysis.
 */

import { detectColType, pickAxes, type ColType, type AxisMapping } from "./dbChartBuilder";

type MappingLike = {
  xColumn?: string;
  groupBy?: string;
  yColumns?: Array<{ col?: string }>;
};

// ── Helpers ──

function cellNum(r: unknown[], idx: number): number {
  const v = (r as any)?.[idx];
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function cellStr(r: unknown[], idx: number): string {
  const v = (r as any)?.[idx];
  return v == null ? "" : String(v);
}

function parseTs(s: string): number {
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return s.length >= 13 ? n : n * 1000;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function findColIndex(cols: string[], refOrName: unknown): number {
  const raw = String(refOrName ?? "").trim();
  if (!raw) return -1;
  const name = raw.includes(".") ? raw.split(".").slice(1).join(".") : raw;
  if (!name) return -1;
  const exact = cols.findIndex((c) => String(c).trim() === name);
  if (exact >= 0) return exact;
  const lower = name.toLowerCase();
  return cols.findIndex((c) => String(c).trim().toLowerCase() === lower);
}

function resolveAxesFromMapping(cols: string[], mapping?: MappingLike | null): AxisMapping | null {
  if (!mapping || typeof mapping !== "object") return null;
  const xIdx = (() => {
    const byX = findColIndex(cols, mapping.xColumn);
    if (byX >= 0) return byX;
    return findColIndex(cols, mapping.groupBy);
  })();
  const yIndices = Array.from(
    new Set(
      (Array.isArray(mapping.yColumns) ? mapping.yColumns : [])
        .map((y) => findColIndex(cols, y?.col))
        .filter((i) => i >= 0)
    )
  );
  if (xIdx < 0 && yIndices.length === 0) return null;
  return {
    xIdx,
    yIndices,
    y2Indices: [],
    numIndices: yIndices,
    strIndices: xIdx >= 0 ? [xIdx] : [],
    xIsDate: false,
  };
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

/** Analyze columns once — cached per call site */
export function analyzeColumns(cols: string[], rows: unknown[][]) {
  const colTypes = cols.map((c, i) => detectColType(rows, i, c));
  const axes = pickAxes(cols, colTypes);
  return { colTypes, axes };
}

// ── Time Series: for UPlotTrendModule ──
// Returns array of { ts: number, [seriesKey]: number } objects
export interface TimeSeriesPoint {
  ts: number;
  [key: string]: number;
}

export function toTimeSeries(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping,
  mapping?: MappingLike | null
): { data: TimeSeriesPoint[]; seriesKeys: { key: string; name: string }[] } | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const mappedAxes = resolveAxesFromMapping(cols, mapping);
  const ax = mappedAxes ?? axes ?? pickAxes(cols, ct);

  if (ax.yIndices.length === 0) return null;

  const seriesKeys = ax.yIndices.map(i => ({ key: `y${i}`, name: cols[i] }));

  const data: TimeSeriesPoint[] = rows.map(r => {
    const xVal = ax.xIdx >= 0 ? cellStr(r, ax.xIdx) : "";
    let ts: number;
    if (ax.xIsDate) {
      ts = parseTs(xVal);
    } else {
      // Use row index as pseudo-timestamp for non-date X
      ts = 0; // will be set below
    }
    const point: TimeSeriesPoint = { ts };
    for (const sk of seriesKeys) {
      const idx = ax.yIndices[seriesKeys.indexOf(sk)];
      point[sk.key] = cellNum(r, idx);
    }
    return point;
  });

  // If X is not date, generate sequential timestamps
  if (!ax.xIsDate) {
    const now = Date.now();
    data.forEach((p, i) => {
      p.ts = now - (data.length - 1 - i) * 3600_000;
    });
  }

  // Sort by ts
  data.sort((a, b) => a.ts - b.ts);

  return { data, seriesKeys };
}

// ── Categorical: for BarChartModule ──
export function toCategorical(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): { category: string; value: number }[] | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  const catIdx = ax.strIndices[0] ?? (ax.xIdx >= 0 ? ax.xIdx : -1);
  const valIdx = ax.numIndices[0] ?? ax.yIndices[0] ?? -1;
  if (catIdx < 0 || valIdx < 0) return null;

  // Aggregate by category
  const agg = new Map<string, number>();
  for (const r of rows) {
    const cat = cellStr(r, catIdx) || "(empty)";
    agg.set(cat, (agg.get(cat) ?? 0) + cellNum(r, valIdx));
  }

  return Array.from(agg.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
}

// ── Pie/Donut: for BaseChart pie series ──
export function toPieData(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping,
  mapping?: MappingLike | null
): { name: string; value: number }[] | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const mappedAxes = resolveAxesFromMapping(cols, mapping);
  const ax = mappedAxes ?? axes ?? pickAxes(cols, ct);

  const catIdx = ax.strIndices[0] ?? (ax.xIdx >= 0 ? ax.xIdx : -1);
  const valIdx = ax.numIndices[0] ?? ax.yIndices[0] ?? -1;
  if (valIdx < 0) return null;

  const agg = new Map<string, number>();
  for (const r of rows) {
    const cat = (catIdx >= 0 ? cellStr(r, catIdx) : `Row ${agg.size + 1}`) || "(empty)";
    agg.set(cat, (agg.get(cat) ?? 0) + cellNum(r, valIdx));
  }

  let data = Array.from(agg.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Group small slices into "Other" if >12 categories
  if (data.length > 12) {
    const top = data.slice(0, 11);
    const rest = data.slice(11).reduce((s, d) => s + d.value, 0);
    data = [...top, { name: "Other", value: rest }];
  }

  return data;
}

// ── ECharts XY: for BaseChart line/bar/area options ──
export interface EChartsXY {
  xLabels: string[];
  series: { name: string; data: number[] }[];
}

export function toEChartsXY(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping,
  mapping?: MappingLike | null
): EChartsXY | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const mappedAxes = resolveAxesFromMapping(cols, mapping);
  const ax = mappedAxes ?? axes ?? pickAxes(cols, ct);

  if (ax.yIndices.length === 0) return null;

  const xLabels = rows.map((r, idx) => {
    const s = ax.xIdx >= 0 ? cellStr(r, ax.xIdx) : `Row ${idx + 1}`;
    if (ax.xIsDate) {
      const d = new Date(parseTs(s));
      if (!isNaN(d.getTime())) return d.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
    }
    return s.length > 20 ? s.slice(0, 20) + "\u2026" : s;
  });

  const series = ax.yIndices.map(yIdx => ({
    name: cols[yIdx],
    data: rows.map(r => cellNum(r, yIdx)),
  }));

  return { xLabels, series };
}

// ── KPI: for KPI card / Metrics cards ──
export interface KpiResult {
  value: string;
  delta: string;
  isNeg: boolean;
  label: string;
}

export function toKpiValue(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): KpiResult | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  const valIdx = ax.numIndices[0] ?? -1;
  if (valIdx < 0 || rows.length === 0) return null;

  const values = rows.map(r => cellNum(r, valIdx));
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;

  // Compute delta: compare last half vs first half
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
  const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
  const deltaPct = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst * 100) : 0;

  return {
    value: fmtNum(sum),
    delta: `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`,
    isNeg: deltaPct < 0,
    label: cols[valIdx],
  };
}

// ── Scatter: for scatter BaseChart ──
export function toScatterPoints(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): { points: [number, number][]; xName: string; yName: string } | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  if (ax.numIndices.length < 2) return null;
  const xi = ax.numIndices[0];
  const yi = ax.numIndices[1];

  const points: [number, number][] = rows.map(r => [cellNum(r, xi), cellNum(r, yi)]);
  return { points, xName: cols[xi], yName: cols[yi] };
}

// ── Treemap: for treemap BaseChart ──
export function toTreemapData(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): { name: string; value: number }[] | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  const catIdx = ax.strIndices[0] ?? (ax.xIdx >= 0 ? ax.xIdx : -1);
  const valIdx = ax.numIndices[0] ?? -1;
  if (catIdx < 0 || valIdx < 0) return null;

  const agg = new Map<string, number>();
  for (const r of rows) {
    const cat = cellStr(r, catIdx) || "(empty)";
    agg.set(cat, (agg.get(cat) ?? 0) + Math.abs(cellNum(r, valIdx)));
  }

  return Array.from(agg.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 30);
}

// ── Heatmap: for correlation matrix ──
export function toHeatmapData(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): { vars: string[]; data: [number, number, number][] } | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  if (ax.numIndices.length < 2) return null;

  // Use numeric columns as variables
  const numCols = ax.numIndices.slice(0, 6);
  const vars = numCols.map(i => cols[i]);

  // Compute simple correlation-like values from data
  const colValues = numCols.map(ci => rows.map(r => cellNum(r, ci)));
  const data: [number, number, number][] = [];

  for (let i = 0; i < vars.length; i++) {
    for (let j = 0; j < vars.length; j++) {
      if (i === j) {
        data.push([i, j, 1]);
      } else {
        // Simple Pearson correlation
        const xs = colValues[i];
        const ys = colValues[j];
        const n = xs.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = ys.reduce((a, b) => a + b, 0) / n;
        let num = 0, dx = 0, dy = 0;
        for (let k = 0; k < n; k++) {
          num += (xs[k] - mx) * (ys[k] - my);
          dx += (xs[k] - mx) ** 2;
          dy += (ys[k] - my) ** 2;
        }
        const denom = Math.sqrt(dx * dy);
        const corr = denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
        data.push([i, j, corr]);
      }
    }
  }

  return { vars, data };
}

// ── Table: direct passthrough ──
export function toTableRows(
  cols: string[],
  rows: unknown[][]
): { headers: string[]; rows: unknown[][] } {
  return { headers: cols, rows };
}

// ── Histogram bins ──
export function toHistogramBins(
  cols: string[],
  rows: unknown[][],
  colTypes?: ColType[],
  axes?: AxisMapping
): { labels: string[]; counts: number[]; colName: string } | null {
  const ct = colTypes ?? cols.map((c, i) => detectColType(rows, i, c));
  const ax = axes ?? pickAxes(cols, ct);

  const valIdx = ax.numIndices[0] ?? -1;
  if (valIdx < 0) return null;

  const values = rows.map(r => cellNum(r, valIdx)).filter(v => isFinite(v));
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const binWidth = (max - min) / binCount || 1;

  const bins = Array.from({ length: binCount }, (_, i) => ({
    lo: min + i * binWidth,
    hi: min + (i + 1) * binWidth,
    count: 0,
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
    bins[idx].count++;
  }

  return {
    labels: bins.map(b => `${fmtNum(b.lo)}-${fmtNum(b.hi)}`),
    counts: bins.map(b => b.count),
    colName: cols[valIdx],
  };
}
