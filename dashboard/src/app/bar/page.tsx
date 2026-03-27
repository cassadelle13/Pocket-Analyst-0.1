"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import {
  getDataLensBarConfig,
  getDataLensLegendConfig,
  getDataLensTooltipConfig,
  getDataLensGridConfig,
} from "../../lib/datalensChartConfigs";

export default function BarChartPage() {
  const chartId = "datalens-bar-demo";
  
  const barConfig = getDataLensBarConfig({
    stacking: "normal",
    showDataLabels: false,
    barWidth: "60%",
  });

  const option = {
    title: {
      text: "Bar Chart - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      ...getDataLensTooltipConfig({ trigger: "axis" }),
      axisPointer: { type: "shadow" },
    },
    legend: {
      ...getDataLensLegendConfig({ orient: "horizontal", position: "top" }),
      data: ["Q1", "Q2", "Q3", "Q4"],
      top: 40,
    },
    grid: getDataLensGridConfig({ containLabel: true }),
    xAxis: {
      type: "category",
      data: ["Product A", "Product B", "Product C", "Product D", "Product E"],
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
        name: "Q1",
        type: "bar",
        data: [320, 302, 301, 334, 390],
        ...barConfig,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#3b82f6" },
              { offset: 1, color: "#1e40af" },
            ],
          },
        },
      },
      {
        name: "Q2",
        type: "bar",
        data: [220, 182, 191, 234, 290],
        ...barConfig,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#8b5cf6" },
              { offset: 1, color: "#6d28d9" },
            ],
          },
        },
      },
      {
        name: "Q3",
        type: "bar",
        data: [150, 212, 201, 154, 190],
        ...barConfig,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#ec4899" },
              { offset: 1, color: "#be185d" },
            ],
          },
        },
      },
      {
        name: "Q4",
        type: "bar",
        data: [98, 77, 101, 99, 40],
        ...barConfig,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#f59e0b" },
              { offset: 1, color: "#d97706" },
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
              <h1 className="text-3xl font-bold text-white">DataLens: Bar Chart</h1>
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
