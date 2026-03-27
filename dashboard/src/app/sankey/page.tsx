"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import { getDataLensSankeyConfig } from "../../lib/datalensChartConfigs";

export default function SankeyChartPage() {
  const chartId = "datalens-sankey-demo";
  
  const sankeyConfig = getDataLensSankeyConfig();

  const option = {
    title: {
      text: "Sankey Diagram - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#e2e8f0", fontSize: 12 },
    },
    series: [
      {
        type: "sankey",
        top: 80,
        bottom: 40,
        left: 40,
        right: 40,
        layout: "none",
        ...sankeyConfig,
        data: [
          { name: "Source A", itemStyle: { color: "#3b82f6" } },
          { name: "Source B", itemStyle: { color: "#8b5cf6" } },
          { name: "Source C", itemStyle: { color: "#ec4899" } },
          { name: "Target X", itemStyle: { color: "#10b981" } },
          { name: "Target Y", itemStyle: { color: "#f59e0b" } },
          { name: "Target Z", itemStyle: { color: "#06b6d4" } },
        ],
        links: [
          { source: "Source A", target: "Target X", value: 5 },
          { source: "Source A", target: "Target Y", value: 3 },
          { source: "Source B", target: "Target Y", value: 8 },
          { source: "Source B", target: "Target Z", value: 3 },
          { source: "Source C", target: "Target X", value: 4 },
          { source: "Source C", target: "Target Z", value: 7 },
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
              <h1 className="text-3xl font-bold text-white">DataLens: Sankey Diagram</h1>
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
