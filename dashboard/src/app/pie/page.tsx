"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import {
  getDataLensPieConfig,
  getDataLensLegendConfig,
  getDataLensTooltipConfig,
} from "../../lib/datalensChartConfigs";

export default function PieChartPage() {
  const chartId = "datalens-pie-demo";
  
  const pieConfig = getDataLensPieConfig({
    isDonut: false,
    showDataLabels: true,
    showPercentage: true,
  });

  const option = {
    title: {
      text: "Pie Chart - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      ...getDataLensTooltipConfig({ trigger: "item" }),
      formatter: "{b}: {c} ({d}%)",
    },
    legend: {
      ...getDataLensLegendConfig({ orient: "horizontal", position: "bottom" }),
      bottom: 20,
    },
    series: [
      {
        name: "Market Share",
        type: "pie",
        ...pieConfig,
        data: [
          { value: 1048, name: "Product A", itemStyle: { color: "#3b82f6" } },
          { value: 735, name: "Product B", itemStyle: { color: "#8b5cf6" } },
          { value: 580, name: "Product C", itemStyle: { color: "#ec4899" } },
          { value: 484, name: "Product D", itemStyle: { color: "#f59e0b" } },
          { value: 300, name: "Product E", itemStyle: { color: "#10b981" } },
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
              <h1 className="text-3xl font-bold text-white">DataLens: Pie Chart</h1>
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
