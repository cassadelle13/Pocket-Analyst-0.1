"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import {
  getDataLensScatterConfig,
  getDataLensLegendConfig,
  getDataLensTooltipConfig,
  getDataLensGridConfig,
} from "../../lib/datalensChartConfigs";

export default function BubbleChartPage() {
  const chartId = "datalens-bubble-demo";
  
  const bubbleConfig = getDataLensScatterConfig({
    symbolSize: (data: any) => Math.sqrt(data[2]) * 2.5,
    symbolType: "circle",
  });

  const option = {
    title: {
      text: "Bubble Chart - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      ...getDataLensTooltipConfig({ trigger: "item" }),
      formatter: (params: any) => {
        return `${params.seriesName}<br/>X: ${params.value[0]}<br/>Y: ${params.value[1]}<br/>Size: ${params.value[2]}`;
      },
    },
    legend: {
      ...getDataLensLegendConfig({ orient: "horizontal", position: "top" }),
      data: ["Category A", "Category B", "Category C"],
      top: 40,
    },
    grid: getDataLensGridConfig({ containLabel: true }),
    xAxis: {
      type: "value",
      name: "Height (cm)",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: "#cbd5e1", fontSize: 12 },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
    },
    yAxis: {
      type: "value",
      name: "Weight (kg)",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: { color: "#cbd5e1", fontSize: 12 },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
    },
    series: [
      {
        name: "Category A",
        type: "scatter",
        data: [
          [161.2, 51.6, 120],
          [167.5, 59.0, 110],
          [159.5, 49.2, 90],
          [157.0, 63.0, 150],
        ],
        ...bubbleConfig,
        itemStyle: {
          color: "rgba(59, 130, 246, 0.7)",
          borderColor: "#3b82f6",
          borderWidth: 2,
        },
      },
      {
        name: "Category B",
        type: "scatter",
        data: [
          [174.0, 65.6, 140],
          [175.3, 71.8, 160],
          [193.5, 80.7, 180],
          [186.5, 72.6, 130],
        ],
        ...bubbleConfig,
        itemStyle: {
          color: "rgba(139, 92, 246, 0.7)",
          borderColor: "#8b5cf6",
          borderWidth: 2,
        },
      },
      {
        name: "Category C",
        type: "scatter",
        data: [
          [184.0, 86.4, 200],
          [177.8, 74.8, 170],
          [180.0, 76.0, 155],
          [188.0, 84.1, 190],
        ],
        ...bubbleConfig,
        itemStyle: {
          color: "rgba(236, 72, 153, 0.7)",
          borderColor: "#ec4899",
          borderWidth: 2,
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
              <h1 className="text-3xl font-bold text-white">DataLens: Bubble Chart</h1>
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
