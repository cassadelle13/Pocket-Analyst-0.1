"use client";

import { useMemo } from "react";
import EChartsCanvas from "./EChartsCanvas";
import { cyberMidnight } from "./cyberTheme";

type Datum = Record<string, any>;

type Props = {
  data: Datum[];
  index: string;
  series: Array<{ key: string; name: string; color?: string; yAxisIndex?: number }>;
  height?: number;
  onPointClick?: (payload: Record<string, unknown>) => void;
};

export default function TrendChartModule({ data, index, series, height = 360, onPointClick }: Props) {
  const option = useMemo(() => {
    const x = data.map((d) => String(d[index] ?? ""));

    return {
      backgroundColor: cyberMidnight.backgroundColor,
      grid: { left: 16, right: 16, top: 24, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: "rgba(2,6,23,0.92)",
        borderColor: cyberMidnight.gridColor,
        borderWidth: 1,
        textStyle: { color: cyberMidnight.textColor },
      },
      toolbox: {
        show: true,
        right: 8,
        top: 0,
        itemSize: 14,
        iconStyle: {
          borderColor: "rgba(203,213,225,0.65)",
        },
        feature: {
          dataZoom: { yAxisIndex: "none" },
          restore: {},
        },
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 18,
          bottom: 0,
          borderColor: cyberMidnight.gridColor,
          backgroundColor: "rgba(2,6,23,0.35)",
          fillerColor: "rgba(16,185,129,0.12)",
          handleStyle: {
            color: "rgba(148,163,184,0.75)",
            borderColor: cyberMidnight.gridColor,
          },
          textStyle: { color: "rgba(148,163,184,0.85)" },
        },
      ],
      xAxis: {
        type: "category",
        data: x,
        boundaryGap: false,
        axisLine: { lineStyle: { color: cyberMidnight.gridColor } },
        axisLabel: { color: "rgba(148,163,184,0.9)", fontSize: 11 },
      },
      yAxis: [
        {
          type: "value",
          axisLine: { lineStyle: { color: cyberMidnight.gridColor } },
          axisLabel: { color: "rgba(148,163,184,0.9)", fontSize: 11 },
          splitLine: { lineStyle: { color: cyberMidnight.gridColor } },
        },
        {
          type: "value",
          axisLine: { lineStyle: { color: cyberMidnight.gridColor } },
          axisLabel: { color: "rgba(148,163,184,0.9)", fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        data: data.map((d) => Number(d[s.key] ?? 0)),
        yAxisIndex: s.yAxisIndex ?? 0,
        showSymbol: false,
        smooth: true,
        lineStyle: {
          width: 2,
          color: s.color ?? cyberMidnight.primary,
          shadowColor: (s.color ?? cyberMidnight.primary) === cyberMidnight.secondary ? cyberMidnight.glowSecondary : cyberMidnight.glowPrimary,
          shadowBlur: 12,
        },
        areaStyle: {
          opacity: 0.12,
          color: s.color ?? cyberMidnight.primary,
        },
        progressive: 1200,
        progressiveThreshold: 2000,
      })),
      legend: {
        top: 0,
        textStyle: { color: "rgba(203,213,225,0.9)" },
        icon: "roundRect",
      },
      animation: true,
      animationDuration: 900,
      animationEasing: "cubicOut",
    };
  }, [data, index, series]);

  return (
    <EChartsCanvas
      option={option}
      className="w-full"
      height={height}
      onReady={(chart: any) => {
        if (!onPointClick) return;
        chart.off("click");
        chart.on("click", (params: any) => {
          const row = data?.[params?.dataIndex];
          onPointClick({ ...(row ?? {}), __series: params?.seriesName });
        });
      }}
    />
  );
}
