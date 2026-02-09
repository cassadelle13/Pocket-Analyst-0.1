"use client";

import { useEffect, useRef, memo } from "react";
import { getPerformanceMonitor } from "../../lib/performance-monitor";
import { buildEChartsBase } from "@/lib/chartTheme";
import { useGraphicsMode } from "@/context/GraphicsContext";
import { useChartBus } from "@/context/ChartInteractionBus";
import { useChartEnvironment } from "@/context/ChartEnvironment";
import type { ChartInteractionPayload } from "@/types/interaction";
import { useChartSyncSettings } from "@/context/ChartSyncSettings";

type Props = {
  option: Record<string, unknown>;
  className?: string;
  height?: number;
  onReady?: (chart: unknown, echarts: unknown) => void;
  chartId?: string;
  groupId?: string;
};

function BaseChart({ option, className, height = 360, onReady, chartId, groupId }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const echartsRef = useRef<any>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const bus = useChartBus();
  const listenersCleanupRef = useRef<(() => void) | null>(null);
  const busUnsubRef = useRef<(() => void) | null>(null);
  const lastHoverTsRef = useRef<number>(0);
  const lastZoomTsRef = useRef<number>(0);
  const { syncEnabled } = useChartSyncSettings();
  const applyingRemoteRef = useRef<boolean>(false);
  const { isLowGraphicsMode } = useGraphicsMode();
  const { themeTokens } = useChartEnvironment();
  const optionRef = useRef<Record<string, unknown>>(option);

  useEffect(() => {
    let disposed = false;
    const monitor = getPerformanceMonitor();

    (async () => {
      monitor.mark('BaseChart-init');
      const echarts = await import("echarts");

      if (disposed) return;
      if (!ref.current) return;

      echartsRef.current = echarts;

      // Dispose existing chart if any (prevent memory leak on hot reload)
      if (chartRef.current) {
        try {
          chartRef.current.dispose();
        } catch (e) {
          console.error('[BaseChart] Error disposing existing chart:', e);
        }
      }

      const chart = echarts.init(ref.current, undefined, {
        renderer: "canvas",
        devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
      });

      chartRef.current = chart;
      const themedOption = buildEChartsBase(option as any, { lowGraphics: isLowGraphicsMode });
      chart.setOption(themedOption, { notMerge: true, lazyUpdate: true });
      onReady?.(chart, echarts);

      // Attach common interaction listeners (click, legend, datazoom)
      const offFns: Array<() => void> = [];

      const publish = (partial: Omit<ChartInteractionPayload, "source">) => {
        if (!syncEnabled) return;
        bus.publish({ source: "echarts", chartId, groupId, ...partial });
      };

      // Click handler
      const onClick = (params: any) => {
        try {
          publish({
            action: "click",
            x: (params?.value && params.value[0]) ?? params?.name ?? params?.data?.name,
            y: (params?.value && params.value[1]) ?? params?.value ?? params?.data?.value,
            series: params?.seriesName,
            category: params?.name,
            meta: { params },
          });
        } catch {}
      };
      chart.on("click", onClick);
      offFns.push(() => chart.off("click", onClick));

      // Legend selection changed
      const onLegend = (params: any) => {
        try {
          publish({ action: "legend", series: params?.name, meta: { params } });
          // Persist selected map per chart
          if (chartId && params && params.selected) {
            try {
              window.localStorage.setItem(`dashboard:legend:${chartId}`, JSON.stringify(params.selected));
            } catch {}
          }
        } catch {}
      };
      chart.on("legendselectchanged", onLegend);
      offFns.push(() => chart.off("legendselectchanged", onLegend));

      // Data zoom (pinch/scroll/slider)
      const onZoom = (params: any) => {
        try {
          if (applyingRemoteRef.current) return;
          const now = performance.now();
          if (now - lastZoomTsRef.current < 120) return;
          lastZoomTsRef.current = now;
          // Pass raw ranges; consumers can map to domain values if needed
          publish({ action: "zoom", meta: { params } });
          // Persist zoom range per chart
          if (chartId && params) {
            try {
              const batch = (params as any)?.batch?.[0] ?? params;
              window.localStorage.setItem(`dashboard:zoom:${chartId}`, JSON.stringify({
                start: batch?.start,
                end: batch?.end,
                startValue: batch?.startValue,
                endValue: batch?.endValue,
              }));
            } catch {}
          }
        } catch {}
      };
      chart.on("datazoom", onZoom);
      offFns.push(() => chart.off("datazoom", onZoom));

      // Mouse over/out for tooltip sync
      const onMouseOver = (params: any) => {
        try {
          if (applyingRemoteRef.current) return;
          const now = performance.now();
          if (now - lastHoverTsRef.current < 40) return;
          lastHoverTsRef.current = now;
          publish({ action: "hover", meta: { params } });
        } catch {}
      };
      chart.on("mouseover", onMouseOver);
      offFns.push(() => chart.off("mouseover", onMouseOver));

      const onGlobalOut = () => {
        try {
          publish({ action: "hover", meta: { hide: true } });
        } catch {}
      };
      chart.on("globalout", onGlobalOut);
      offFns.push(() => chart.off("globalout", onGlobalOut));

      listenersCleanupRef.current = () => {
        for (const fn of offFns) {
          try { fn(); } catch {}
        }
      };

      // Subscribe to bus to APPLY interactions from peer charts in same group
      busUnsubRef.current = bus.subscribe((evt) => {
        try {
          if (!syncEnabled) return;
          if (evt.groupId && groupId && evt.groupId !== groupId) return;
          if (evt.chartId && chartId && evt.chartId === chartId) return; // ignore self

          // Sync zoom coming from ECharts charts
          if (evt.action === "zoom" && evt.source === "echarts") {
            const p = evt.meta?.params as any;
            const batch = p?.batch?.[0] ?? p;
            if (batch && (typeof batch.start !== 'undefined' || typeof batch.end !== 'undefined' || typeof batch.startValue !== 'undefined' || typeof batch.endValue !== 'undefined')) {
              try {
                applyingRemoteRef.current = true;
                chart.dispatchAction({
                  type: 'dataZoom',
                  start: batch.start,
                  end: batch.end,
                  startValue: batch.startValue,
                  endValue: batch.endValue,
                });
              } catch {}
              finally { applyingRemoteRef.current = false; }
            }
          }

          // Sync hover coming from ECharts charts
          if (evt.action === "hover" && evt.source === "echarts") {
            const p = evt.meta?.params as any;
            if (evt.meta?.hide) {
              try { applyingRemoteRef.current = true; chart.dispatchAction({ type: 'hideTip' }); } catch {}
              finally { applyingRemoteRef.current = false; }
            } else if (p && typeof p.seriesIndex === 'number' && typeof p.dataIndex === 'number') {
              try {
                applyingRemoteRef.current = true;
                chart.dispatchAction({ type: 'showTip', seriesIndex: p.seriesIndex, dataIndex: p.dataIndex });
              } catch {}
              finally { applyingRemoteRef.current = false; }
            }
          }
        } catch {}
      });

      // Restore persisted legend selection and zoom for this chart
      try {
        if (chartId) {
          const selRaw = window.localStorage.getItem(`dashboard:legend:${chartId}`);
          if (selRaw) {
            const selected = JSON.parse(selRaw) as Record<string, boolean>;
            const opt: any = chart.getOption?.();
            const seriesList: Array<{ name?: string }> = Array.isArray(opt?.series) ? opt.series : [];
            for (const s of seriesList) {
              const name = s?.name;
              if (!name) continue;
              const shouldShow = selected[name];
              try {
                chart.dispatchAction({ type: shouldShow ? 'legendSelect' : 'legendUnSelect', name });
              } catch {}
            }
          }

          const zoomRaw = window.localStorage.getItem(`dashboard:zoom:${chartId}`);
          if (zoomRaw) {
            const z = JSON.parse(zoomRaw) as { start?: number; end?: number; startValue?: any; endValue?: any };
            try {
              applyingRemoteRef.current = true;
              chart.dispatchAction({ type: 'dataZoom', start: z.start, end: z.end, startValue: z.startValue, endValue: z.endValue });
            } catch {}
            finally { applyingRemoteRef.current = false; }
          }
        }
      } catch {}

      // Use ResizeObserver instead of window resize for better performance
      const onResize = () => {
        if (!disposed && chartRef.current) {
          try {
            chartRef.current.resize();
          } catch (e) {
            console.error('[BaseChart] Error resizing chart:', e);
          }
        }
      };
      
      resizeHandlerRef.current = onResize;
      
      // Setup ResizeObserver for container resize
      if (ref.current && typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => {
          onResize();
        });
        resizeObserverRef.current.observe(ref.current);
      } else {
        // Fallback to window resize
        window.addEventListener("resize", onResize);
      }
      
      monitor.measure('BaseChart-init');
    })();

    return () => {
      disposed = true;
      
      // Disconnect ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      // Remove window resize listener
      if (resizeHandlerRef.current) {
        window.removeEventListener("resize", resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
      
      // Dispose chart instance with proper cleanup
      if (chartRef.current) {
        try {
          // Clear all event listeners
          chartRef.current.off();
          // Dispose chart
          chartRef.current.dispose();
        } catch (e) {
          console.error('[BaseChart] Error disposing chart:', e);
        }
        chartRef.current = null;
      }

      // Clean our attached listeners record
      if (listenersCleanupRef.current) {
        try { listenersCleanupRef.current(); } catch {}
        listenersCleanupRef.current = null;
      }

      // Unsubscribe from bus
      if (busUnsubRef.current) {
        try { busUnsubRef.current(); } catch {}
        busUnsubRef.current = null;
      }
      
      // Clear echarts reference
      echartsRef.current = null;
      
      // Clear DOM reference
      if (ref.current) {
        ref.current = null;
      }
    };
  }, []);

  useEffect(() => {
    optionRef.current = option;
    if (!chartRef.current) return;
    try {
      const themedOption = buildEChartsBase(option as any, { lowGraphics: isLowGraphicsMode });
      chartRef.current.setOption(themedOption, { notMerge: false, lazyUpdate: true });
    } catch (e) {
      console.error('[BaseChart] Error updating chart option:', e);
    }
  }, [option, themeTokens, isLowGraphicsMode]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { actionId?: string; chartId?: string } | undefined;
      if (!detail) return;
      if (detail.chartId && chartId && detail.chartId !== chartId) return; // ignore other charts
      const chart = chartRef.current;
      if (!chart) return;

      switch (detail.actionId) {
        case 'export-png': {
          try {
            const url = chart.getDataURL({ pixelRatio: 2, backgroundColor: 'transparent' });
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chartId || 'chart'}.png`;
            a.click();
          } catch (e) {
            console.error('[BaseChart] export-png failed', e);
          }
          break;
        }
        case 'export-csv': {
          try {
            const opt: any = chart.getOption?.();
            const xData: any[] = opt?.xAxis?.[0]?.data ?? [];
            const series: any[] = Array.isArray(opt?.series) ? opt.series : [];
            const header = ['category', ...series.map((s) => s?.name || 'series')];
            const rows = xData.map((x, idx) => [x, ...series.map((s) => Array.isArray(s?.data) ? s.data[idx] : '')]);
            const csv = [header, ...rows]
              .map((r) => r.map((v) => (v === undefined || v === null ? '' : String(v))).join(','))
              .join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chartId || 'chart'}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            console.error('[BaseChart] export-csv failed', e);
          }
          break;
        }
        case 'fullscreen': {
          try {
            const node = ref.current;
            if (!node) break;
            if (!document.fullscreenElement) {
              node.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          } catch (e) {
            console.error('[BaseChart] fullscreen failed', e);
          }
          break;
        }
        case 'explain': {
          try {
            window.dispatchEvent(new CustomEvent('chart:explain', { detail: { chartId, option: optionRef.current } }));
          } catch {}
          break;
        }
        case 'ai-config': {
          try {
            window.dispatchEvent(new CustomEvent('chart:ai-config', { detail: { chartId, option: optionRef.current } }));
          } catch {}
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('chart:action', handler as EventListener);
    return () => window.removeEventListener('chart:action', handler as EventListener);
  }, [chartId]);

  return <div ref={ref} className={className} style={{ height }} data-component="BaseChart" />;
}

// Memoize to prevent unnecessary re-renders
export default memo(BaseChart);
