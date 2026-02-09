"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

type Point = { ts: number; value: number };

type Props = {
  points: Point[];
  color?: string;
  height?: number;
  className?: string;
};

export function InsightSparkline({ points, color = "#a3e635", height = 36, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  const series = useMemo(() => {
    const xs = points.map((p) => p.ts / 1000);
    const ys = points.map((p) => p.value);
    return [xs, ys] as [number[], number[]];
  }, [points]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: true }, y: { auto: true } },
      axes: [],
      series: [
        {},
        {
          stroke: color,
          width: 1.5,
        },
      ],
      padding: [0, 0, 0, 0],
    };

    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, series, el);

    const ro = new ResizeObserver(() => {
      const p = plotRef.current;
      if (!p) return;
      p.setSize({ width: el.clientWidth, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [series, color, height]);

  return <div ref={hostRef} className={className} />;
}
