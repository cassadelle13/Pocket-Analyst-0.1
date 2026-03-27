"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import {
  getDataLensLineConfig,
  getDataLensLegendConfig,
  getDataLensTooltipConfig,
  getDataLensGridConfig,
} from "../../lib/datalensChartConfigs";

export default function LineChartPage() {
  const chartId = "datalens-line-demo";
  
  const lineConfig = getDataLensLineConfig({
    smooth: true,
    connectNulls: false,
    showDataLabels: false,
  });

  const option = {
    title: {
      text: "Line Chart - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: getDataLensTooltipConfig({ trigger: "axis" }),
    legend: {
      ...getDataLensLegendConfig({ orient: "horizontal", position: "top" }),
      data: ["Sales", "Revenue", "Profit"],
      top: 40,
    },
    grid: getDataLensGridConfig({ containLabel: true }),
    xAxis: {
      type: "category",
      data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      axisLine: { lineStyle: { color: "#475569" } },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
    },
    series: [
      {
        name: "Sales",
        type: "line",
        data: [120, 200, 150, 80, 70, 110, 130],
        ...lineConfig,
        itemStyle: { color: "#3b82f6" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59, 130, 246, 0.3)" },
              { offset: 1, color: "rgba(59, 130, 246, 0.05)" },
            ],
          },
        },
      },
      {
        name: "Revenue",
        type: "line",
        data: [220, 182, 191, 234, 290, 330, 310],
        ...lineConfig,
        itemStyle: { color: "#8b5cf6" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(139, 92, 246, 0.3)" },
              { offset: 1, color: "rgba(139, 92, 246, 0.05)" },
            ],
          },
        },
      },
      {
        name: "Profit",
        type: "line",
        data: [100, 120, 140, 154, 220, 220, 180],
        ...lineConfig,
        itemStyle: { color: "#10b981" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16, 185, 129, 0.3)" },
              { offset: 1, color: "rgba(16, 185, 129, 0.05)" },
            ],
          },
        },
      },
    ],
  };

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
      <div className="relative min-h-screen bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
        </div>
        <div className="relative p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-white">DataLens: Line Chart</h1>
              <ChartActionsMenu chartId={chartId} />
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <BaseChart option={option} height={500} chartId={chartId} />
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
