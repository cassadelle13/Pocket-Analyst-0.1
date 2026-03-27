"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { getPerformanceMonitor } from "../../lib/performance-monitor";
import { chartThemeTokens } from "@/lib/chartTheme";
import { useChartBus } from "@/context/ChartInteractionBus";
import { useChartSyncSettings } from "@/context/ChartSyncSettings";

type Datum = Record<string, any>;

type ForecastPoint = {
  ts: number;
  revenue_forecast?: number;
  users_forecast?: number;
  [key: string]: any;
};

type Props = {
  data: Datum[];
  xKey: string; // expects ms timestamp field (number)
  series: Array<{ key: string; name: string; stroke: string; scale?: string; forecastKey?: string }>;
  forecast?: ForecastPoint[];
  height?: number;
  onPointClick?: (payload: Record<string, unknown>) => void;
  chartId?: string;
  groupId?: string;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function UPlotTrendModule({ data, xKey, series, forecast, height = 360, onPointClick, chartId, groupId }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const bus = useChartBus();
  const { syncEnabled } = useChartSyncSettings();

  const dataRef = useRef(data);
  dataRef.current = data;
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const xKeyRef = useRef(xKey);
  xKeyRef.current = xKey;
  const syncEnabledRef = useRef(syncEnabled);
  syncEnabledRef.current = syncEnabled;

  const applyingRemoteRef = useRef(false);
  const lastHoverTsRef = useRef(0);
  const lastZoomTsRef = useRef(0);

  const [tip, setTip] = useState<{ show: boolean; x: number; y: number; html: string }>({ show: false, x: 0, y: 0, html: "" });

  const uData = useMemo(() => {
    // Combine historical and forecast data
    const historicalX = data.map((d) => toNum(d[xKey]));
    const forecastX = forecast?.map((f) => toNum(f.ts)) || [];
    const allX = [...historicalX, ...forecastX];

    const ys = series.map((s) => {
      const historicalY = data.map((d) => toNum(d[s.key]));
      
      // Add forecast values if available
      if (forecast && forecast.length > 0) {
        const forecastKey = s.forecastKey || `${s.key}_forecast`;
        const forecastY = forecast.map((f) => toNum(f[forecastKey]));
        
        // Pad historical with nulls for forecast period
        const paddedHistorical = [...historicalY, ...new Array(forecastY.length).fill(null)];
        
        // Pad forecast with nulls for historical period, then add forecast values
        const paddedForecast = [...new Array(historicalY.length).fill(null), ...forecastY];
        
        return { historical: paddedHistorical, forecast: paddedForecast };
      }
      
      return { historical: historicalY, forecast: [] };
    });

    // Create separate series for historical and forecast
    const historicalSeries = ys.map((y) => y.historical);
    const forecastSeries = ys.map((y) => y.forecast.length > 0 ? y.forecast : new Array(allX.length).fill(null));

    return [allX, ...historicalSeries, ...forecastSeries] as uPlot.AlignedData;
  }, [data, xKey, series, forecast]);

  const opts = useMemo<uPlot.Options>(() => {
    const scales: NonNullable<uPlot.Options["scales"]> = {
      x: { time: true },
      y: { auto: true },
    };

    // Create series for historical data (Actual)
    const historicalSeries: uPlot.Series[] = series.map((s, i) => ({
      label: `${s.name} (Actual)`,
      stroke: s.stroke || chartThemeTokens.colors.series[i % chartThemeTokens.colors.series.length],
      width: 2,
    }));

    // Create series for forecast data (dashed, semi-transparent)
    const forecastSeries: uPlot.Series[] = forecast && forecast.length > 0
      ? series.map((s, i) => ({
          label: `${s.name} (Forecast)`,
          stroke: s.stroke || chartThemeTokens.colors.series[i % chartThemeTokens.colors.series.length],
          width: 2,
          dash: [10, 5],
          alpha: 0.5,
        }))
      : [];

    const uSeries: uPlot.Series[] = [
      {},
      ...historicalSeries,
      ...forecastSeries,
    ];

    return {
      width: 100,
      height,
      cursor: { drag: { x: true, y: false } },
      scales,
      series: uSeries,
      legend: {
        show: true,
        live: false,
      },
      axes: [
        {
          stroke: chartThemeTokens.colors.axis,
          grid: { stroke: chartThemeTokens.colors.grid },
          values: (u, vals) => vals.map((v) => {
            const d = new Date(v as number);
            return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
          }),
        },
        {
          stroke: chartThemeTokens.colors.axis,
          grid: { stroke: chartThemeTokens.colors.grid },
          values: (u, vals) => vals.map((v) => {
            const n = Number(v);
            if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "M";
            if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "K";
            return String(Math.round(n));
          }),
        },
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx ?? -1;
            const dataNow = dataRef.current;
            const seriesNow = seriesRef.current;
            const xKeyNow = xKeyRef.current;
            if (idx < 0 || !dataNow[idx]) {
              setTip((t) => ({ ...t, show: false }));
              return;
            }
            const ts = toNum(dataNow[idx][xKeyNow]);
            const left = (u.cursor.left ?? 0) + 12; // slight offset
            const top = (u.cursor.top ?? 0) + 12;

            // Build simple tooltip HTML from original data
            const dt = new Date(ts).toLocaleString();
            const rows = seriesNow.map((s) => {
              const val = toNum(dataNow[idx][s.key]);
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${s.stroke}">●</span><span>${s.name}</span><b>${Number(val).toLocaleString()}</b></div>`;
            }).join("");
            const html = `<div style="min-width:220px"><div style="font-weight:700;margin-bottom:6px">${dt}</div>${rows}</div>`;

            setTip({ show: true, x: left, y: top, html });
            // Publish hover to bus (throttled, only when syncEnabled, and skip if applying remote)
            if (!applyingRemoteRef.current && syncEnabledRef.current) {
              const now = performance.now();
              if (now - lastHoverTsRef.current >= 40) {
                lastHoverTsRef.current = now;
                bus.publish({ source: "uplot", action: "hover", chartId, groupId, x: ts, meta: { idx } });
              }
            }
          }
        ],
        setScale: [
          (u, key) => {
            if (key !== "x") return;
            const rng = u.scales.x;
            const min = (rng as any).min as number;
            const max = (rng as any).max as number;
            if (Number.isFinite(min) && Number.isFinite(max) && syncEnabledRef.current) {
              const now = performance.now();
              if (now - lastZoomTsRef.current >= 120) {
                lastZoomTsRef.current = now;
                bus.publish({ source: "uplot", action: "zoom", chartId, groupId, x: [min, max] });
              }
            }
          }
        ],
      },
    };
  }, [height, series, bus, chartId, groupId]);

  // Store onPointClick in ref to avoid recreating event listeners
  const onPointClickRef = useRef(onPointClick);
  useEffect(() => {
    onPointClickRef.current = onPointClick;
  }, [onPointClick]);

  // Create plot once and attach listeners once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (plotRef.current) return;

    const monitor = getPerformanceMonitor();
    monitor.mark('UPlotTrendModule-init');

    const plot = new uPlot(opts, uData, host);
    plotRef.current = plot;

    const onResize = () => {
      const p = plotRef.current;
      if (!p) return;
      const w = host.clientWidth;
      p.setSize({ width: w, height });
    };
    onResize();
    window.addEventListener("resize", onResize);

    const onClick = (e: MouseEvent) => {
      const p = plotRef.current;
      if (!onPointClickRef.current || !p) return;
      const bbox = host.getBoundingClientRect();
      const xPos = e.clientX - bbox.left;
      const idx = p.posToIdx(xPos);
      const row = data[idx];
      if (row) {
        onPointClickRef.current({ ...(row ?? {}), __series: "Trend" });
        bus.publish({ source: "uplot", action: "click", chartId, groupId, x: row[xKey] as any, meta: { idx, row } });
      }
    };
    host.addEventListener("click", onClick);

    cleanupRef.current = () => {
      window.removeEventListener("resize", onResize);
      host.removeEventListener("click", onClick);
      try {
        plotRef.current?.destroy();
      } catch {}
      plotRef.current = null;
    };

    monitor.measure('UPlotTrendModule-init');

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [bus, chartId, data, groupId, height, opts, uData, xKey]);

  // Update plot data/size without recreating
  useEffect(() => {
    const host = hostRef.current;
    const p = plotRef.current;
    if (!host || !p) return;

    const monitor = getPerformanceMonitor();
    monitor.mark('UPlotTrendModule-update');
    try {
      p.setData(uData);
      p.setSize({ width: host.clientWidth, height });
    } catch {}
    monitor.measure('UPlotTrendModule-update');
  }, [uData, height]);

  // Subscribe to bus to apply interactions from peer uPlot charts in same group
  useEffect(() => {
    const unsub = bus.subscribe((evt) => {
      if (evt.groupId && groupId && evt.groupId !== groupId) return;
      if (evt.chartId && chartId && evt.chartId === chartId) return;
      const u = plotRef.current;
      if (!u) return;
      try {
        if (evt.source === 'uplot') {
          if (evt.action === 'zoom' && Array.isArray(evt.x)) {
            const [min, max] = evt.x as [number, number];
            u.setScale('x', { min, max });
          }
          if (evt.action === 'hover' && typeof evt.x === 'number') {
            const left = u.valToPos(evt.x as number, 'x', true);
            const idx = (u as any).posToIdx ? (u as any).posToIdx(left) : u.cursor.idx ?? 0;
            (u as any).setCursor({ left, top: u.cursor.top ?? 0, idx });
          }
        }
      } catch {}
    });
    return () => unsub();
  }, [bus, chartId, groupId]);

  return (
    <div className="relative overflow-hidden w-full" data-component="UPlotTrendModule">
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-80"
        style={{
          background:
            "radial-gradient(1200px 280px at 30% 10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(900px 240px at 70% 40%, rgba(59,130,246,0.14), transparent 55%)",
          filter: "blur(0.2px)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 18px rgba(16,185,129,0.12), 0 0 28px rgba(59,130,246,0.08)",
        }}
      />
      <div ref={hostRef} className="relative rounded-xl" />
      {tip.show && (
        <div
          className="absolute z-10 text-xs bg-slate-900/95 border border-white/10 text-slate-100 rounded-md px-3 py-2 shadow-xl"
          style={{ left: Math.max(8, tip.x), top: Math.max(8, tip.y), pointerEvents: "none" }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(UPlotTrendModule, (prevProps, nextProps) => {
  return (
    prevProps.data === nextProps.data &&
    prevProps.xKey === nextProps.xKey &&
    prevProps.series === nextProps.series &&
    prevProps.forecast === nextProps.forecast &&
    prevProps.height === nextProps.height &&
    prevProps.onPointClick === nextProps.onPointClick
  );
});
