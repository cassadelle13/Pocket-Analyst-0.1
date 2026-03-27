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

export default function ScatterChartPage() {
  const chartId = "datalens-scatter-demo";
  
  const scatterConfigA = getDataLensScatterConfig({
    symbolSize: 12,
    symbolType: "circle",
  });

  const scatterConfigB = getDataLensScatterConfig({
    symbolSize: 12,
    symbolType: "diamond",
  });

  const option = {
    title: {
      text: "Scatter Plot - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      ...getDataLensTooltipConfig({ trigger: "item" }),
      formatter: (params: any) => {
        return `${params.seriesName}<br/>X: ${params.value[0]}<br/>Y: ${params.value[1]}`;
      },
    },
    legend: {
      ...getDataLensLegendConfig({ orient: "horizontal", position: "top" }),
      data: ["Series A", "Series B"],
      top: 40,
    },
    grid: getDataLensGridConfig({ containLabel: true }),
    xAxis: {
      type: "value",
      name: "X Axis",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: { color: "#cbd5e1", fontSize: 12 },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
    },
    yAxis: {
      type: "value",
      name: "Y Axis",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: { color: "#cbd5e1", fontSize: 12 },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#334155", type: "dashed" } },
    },
    series: [
      {
        name: "Series A",
        type: "scatter",
        data: [
          [10.0, 8.04],
          [8.07, 6.95],
          [13.0, 7.58],
          [9.05, 8.81],
          [11.0, 8.33],
          [14.0, 7.66],
          [13.4, 6.81],
          [10.0, 6.33],
          [14.0, 8.96],
          [12.5, 6.82],
        ],
        ...scatterConfigA,
        itemStyle: { color: "#3b82f6" },
      },
      {
        name: "Series B",
        type: "scatter",
        data: [
          [10.0, 9.14],
          [8.07, 8.14],
          [13.0, 8.74],
          [9.05, 8.77],
          [11.0, 9.26],
          [14.0, 8.10],
          [6.4, 6.13],
          [4.0, 3.10],
          [12.0, 9.13],
          [7.0, 7.26],
        ],
        ...scatterConfigB,
        itemStyle: { color: "#8b5cf6" },
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
              <h1 className="text-3xl font-bold text-white">DataLens: Scatter Plot</h1>
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
