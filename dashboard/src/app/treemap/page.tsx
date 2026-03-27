"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import { getDataLensTreemapConfig } from "../../lib/datalensChartConfigs";

export default function TreemapChartPage() {
  const chartId = "datalens-treemap-demo";
  
  const treemapConfig = getDataLensTreemapConfig({ showLabels: true });

  const option = {
    title: {
      text: "Treemap - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: "{b}: {c}",
    },
    series: [
      {
        type: "treemap",
        top: 80,
        bottom: 20,
        left: 20,
        right: 20,
        ...treemapConfig,
        data: [
          {
            name: "Category A",
            value: 1200,
            itemStyle: { color: "#3b82f6" },
            children: [
              { name: "A1", value: 500, itemStyle: { color: "#60a5fa" } },
              { name: "A2", value: 400, itemStyle: { color: "#93c5fd" } },
              { name: "A3", value: 300, itemStyle: { color: "#bfdbfe" } },
            ],
          },
          {
            name: "Category B",
            value: 1000,
            itemStyle: { color: "#8b5cf6" },
            children: [
              { name: "B1", value: 600, itemStyle: { color: "#a78bfa" } },
              { name: "B2", value: 400, itemStyle: { color: "#c4b5fd" } },
            ],
          },
          {
            name: "Category C",
            value: 800,
            itemStyle: { color: "#ec4899" },
            children: [
              { name: "C1", value: 300, itemStyle: { color: "#f472b6" } },
              { name: "C2", value: 300, itemStyle: { color: "#f9a8d4" } },
              { name: "C3", value: 200, itemStyle: { color: "#fbcfe8" } },
            ],
          },
        ],
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
              <h1 className="text-3xl font-bold text-white">DataLens: Treemap</h1>
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
