"use client";

import { useEffect, useMemo, useState, memo } from "react";
import EChartsCanvas from "./EChartsCanvas";
import { getPerformanceMonitor } from "../../lib/performance-monitor";

type FunnelStep = {
  key?: string;
  name: string;
  value: number;
  conversionFromPrev: number | null;
  aiNote?: string;
};

type Props = {
  steps: FunnelStep[];
  height?: number;
  isDemoData?: boolean;
};

function CyberFunnelModule({ steps, height = 420, isDemoData = false }: Props) {
  const [pulsePhase, setPulsePhase] = useState(false);

  const hasAnyData = useMemo(() => steps.some((s) => s.value > 0), [steps]);

  useEffect(() => {
    const monitor = getPerformanceMonitor();
    monitor.mark('CyberFunnelModule-mount');
    
    const id = window.setInterval(() => setPulsePhase((p) => !p), 650);
    
    monitor.measure('CyberFunnelModule-mount');
    
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const option = useMemo(() => {
    const lime = "#a3e635";

    // Используем статичные цвета вместо pulsePhase для предотвращения постоянных обновлений
    const orangeA = "rgba(251,146,60,0.95)";
    const orangeB = "rgba(244,63,94,0.80)";

    const mkGood = () => ({
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: "rgba(163,230,53,0.95)" },
        { offset: 1, color: "rgba(163,230,53,0.05)" },
      ],
    });

    const mkBad = () => ({
      type: "linear",
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: orangeA },
        { offset: 1, color: orangeB },
      ],
    });

    const data = steps.map((s, idx) => {
      const conv = s.conversionFromPrev;
      const isBad = idx > 0 && conv !== null && conv < 0.1;
      return {
        name: s.name,
        value: s.value,
        itemStyle: {
          color: isBad ? mkBad() : mkGood(),
          borderWidth: 0,
          shadowBlur: 20,
          shadowColor: isBad ? "rgba(244,63,94,0.55)" : "rgba(163,230,53,0.45)",
        },
        label: {
          color: "rgba(226,232,240,0.92)",
          fontSize: 12,
          formatter: () => s.name,
        },
        tooltip: {
          formatter: () => {
            const pct = conv === null ? "—" : `${Math.round(conv * 1000) / 10}%`;
            const note = s.aiNote;
            return `
              <div style="padding:10px;">
                <div style="font-weight:700; margin-bottom:6px;">${s.name}</div>
                <div style="color: rgba(148,163,184,0.95); font-size: 12px;">Count: <b style=\"color:${lime}\">${Number(s.value).toLocaleString()}</b></div>
                <div style="color: rgba(148,163,184,0.95); font-size: 12px;">Conversion: ${pct}</div>
                <div style="margin-top:8px; color: rgba(226,232,240,0.92); font-size: 12px;">AI: ${note}</div>
              </div>
            `;
          },
        },
      };
    });

    const maxV = Math.max(...steps.map((s) => s.value), 1);
    const graphics = steps.map((s, idx) => {
      const conv = s.conversionFromPrev;
      const isBad = idx > 0 && conv !== null && conv < 0.1;
      const pct = conv === null ? "" : ` (${Math.round(conv * 1000) / 10}%)`;
      return {
        type: "text",
        left: "70%",
        top: 26 + idx * 82,
        style: {
          text: `${s.aiNote}${pct}`,
          fill: isBad ? "rgba(251,146,60,0.98)" : "rgba(226,232,240,0.86)",
          fontSize: 12,
          fontWeight: isBad ? 700 : 500,
          lineHeight: 16,
          width: 260,
          overflow: "break",
        },
      };
    });

    return {
      backgroundColor: "rgba(2,6,23,1)",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(2,6,23,0.92)",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        textStyle: { color: "rgba(226,232,240,0.92)" },
      },
      series: [
        {
          type: "funnel",
          left: "8%",
          top: 18,
          bottom: 12,
          width: "58%",
          min: 0,
          max: maxV,
          sort: "descending",
          gap: 2,
          label: {
            show: true,
            position: "inside",
          },
          labelLine: { show: false },
          itemStyle: { borderWidth: 0 },
          emphasis: {
            label: { fontSize: 13, fontWeight: 700 },
          },
          data,
        },
      ],
      graphic: graphics,
    };
  }, [steps]);

  return (
    <div className="relative" data-component="CyberFunnelModule">
      <div className="absolute left-3 top-3 z-10">
        {hasAnyData && !isDemoData ? (
          <span className="inline-flex items-center rounded-full border border-lime-400/20 bg-lime-400/10 px-2.5 py-1 text-xs font-semibold text-lime-300">
            Live Data
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-slate-400/20 bg-slate-400/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
            No data for this segment
          </span>
        )}
      </div>
      <div className="cyber-funnel-3d" style={{ height }}>
        <EChartsCanvas option={option} className="w-full" height={height} />
        <div className="cyber-funnel-energy" />
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(CyberFunnelModule, (prevProps, nextProps) => {
  return (
    prevProps.steps === nextProps.steps &&
    prevProps.height === nextProps.height &&
    prevProps.isDemoData === nextProps.isDemoData
  );
});
