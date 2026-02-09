// Centralized chart theme for ECharts and uPlot.
// Now supports overriding from CSS variables to stay in sync with global theme (DataLens-style mapping).

type ThemeTokens = {
  colors: {
    background: string;
    panelBgFrom: string;
    panelBgTo: string;
    axis: string;
    grid: string;
    splitLine: string;
    legend: string;
    label: string;
    tooltipBg: string;
    tooltipBorder: string;
    series: string[];
  };
  grid: { left: number; right: number; top: number; bottom: number };
};

const fallbackTokens: ThemeTokens = {
  colors: {
    background: 'transparent',
    panelBgFrom: 'rgba(255,255,255,0.10)',
    panelBgTo: 'rgba(255,255,255,0.05)',
    axis: 'rgba(148,163,184,0.55)', // slate-400 ~60%
    grid: 'rgba(16,185,129,0.08)', // emerald glow
    splitLine: 'rgba(31,41,55,0.55)', // slate-800
    legend: '#cbd5e1',
    label: '#94a3b8',
    tooltipBg: 'rgba(2,6,23,0.95)',
    tooltipBorder: 'rgba(255,255,255,0.10)',
    series: [
      '#10b981', // emerald
      '#3b82f6', // blue
      '#f59e0b', // amber
      '#a78bfa', // violet
      '#ef4444', // red
      '#22d3ee', // cyan
      '#f97316', // orange
    ],
  },
  grid: { left: 40, right: 40, top: 20, bottom: 24 },
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const root = document.documentElement;
  const val = getComputedStyle(root).getPropertyValue(name);
  return val?.trim() || fallback;
}

function buildTokensFromCss(): ThemeTokens {
  // Map DataLens-like tokens to our palette via CSS vars, preserving our default style when vars are absent.
  return {
    colors: {
      background: cssVar('--pa-chart-bg', fallbackTokens.colors.background),
      panelBgFrom: cssVar('--pa-panel-from', fallbackTokens.colors.panelBgFrom),
      panelBgTo: cssVar('--pa-panel-to', fallbackTokens.colors.panelBgTo),
      axis: cssVar('--pa-axis-color', fallbackTokens.colors.axis),
      grid: cssVar('--pa-grid-color', fallbackTokens.colors.grid),
      splitLine: cssVar('--pa-splitline-color', fallbackTokens.colors.splitLine),
      legend: cssVar('--pa-legend-color', fallbackTokens.colors.legend),
      label: cssVar('--pa-label-color', fallbackTokens.colors.label),
      tooltipBg: cssVar('--pa-tooltip-bg', fallbackTokens.colors.tooltipBg),
      tooltipBorder: cssVar('--pa-tooltip-border', fallbackTokens.colors.tooltipBorder),
      series: fallbackTokens.colors.series.map((c, idx) => cssVar(`--pa-series-${idx + 1}`, c)),
    },
    grid: fallbackTokens.grid,
  };
}

export function getChartThemeTokens(): ThemeTokens {
  return buildTokensFromCss();
}

// Backward-compatible named export (static snapshot at call time)
export const chartThemeTokens: ThemeTokens = getChartThemeTokens();

export type EChartsAny = Record<string, any>;

export function buildEChartsBase(option: EChartsAny, opts?: { lowGraphics?: boolean }): EChartsAny {
  const low = !!opts?.lowGraphics;
  const chartThemeTokens = getChartThemeTokens();

  const base: EChartsAny = {
    backgroundColor: chartThemeTokens.colors.background,
    animation: !low,
    textStyle: { color: chartThemeTokens.colors.label },
    grid: { containLabel: true, ...chartThemeTokens.grid },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartThemeTokens.colors.tooltipBg,
      borderColor: chartThemeTokens.colors.tooltipBorder,
      borderWidth: 1,
      padding: 10,
      axisPointer: { type: 'line', lineStyle: { color: chartThemeTokens.colors.splitLine } },
    },
    legend: { textStyle: { color: chartThemeTokens.colors.legend }, top: 0 },
    xAxis: {
      type: 'category',
      axisLine: { lineStyle: { color: chartThemeTokens.colors.splitLine } },
      axisLabel: { color: chartThemeTokens.colors.label },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: chartThemeTokens.colors.label },
      splitLine: { show: true, lineStyle: { color: chartThemeTokens.colors.grid } },
    },
    series: Array.isArray(option?.series)
      ? option.series.map((s: any, i: number) => ({
          smooth: s?.type === 'line' ? true : undefined,
          lineStyle: s?.type === 'line' ? { width: 2, color: s?.lineStyle?.color ?? chartThemeTokens.colors.series[i % chartThemeTokens.colors.series.length] } : undefined,
          itemStyle: s?.itemStyle ?? (s?.type === 'bar' ? { color: chartThemeTokens.colors.series[i % chartThemeTokens.colors.series.length] } : undefined),
          ...s,
        }))
      : option?.series,
  };

  // shallow merge with precedence to provided option values
  return deepMerge(base, option);
}

function isPlainObject(x: any) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

export function deepMerge<T extends Record<string, any>>(a: T, b: T): T {
  const out: any = Array.isArray(a) ? [...(a as any)] : { ...a };
  Object.keys(b || {}).forEach((k) => {
    const av = (a as any)[k];
    const bv = (b as any)[k];
    if (isPlainObject(av) && isPlainObject(bv)) out[k] = deepMerge(av, bv);
    else out[k] = bv;
  });
  return out as T;
}

export function formatNumberShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}
