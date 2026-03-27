"use client";

import { RequireRole } from "../../components/auth";
import BaseChart from "../../components/charts/BaseChart";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";
import { getDataLensHeatmapConfig } from "../../lib/datalensChartConfigs";

export default function HeatmapChartPage() {
  const chartId = "datalens-heatmap-demo";
  
  const hours = ["12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p"];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const data = days.flatMap((day, i) =>
    hours.map((hour, j) => [j, i, Math.floor(Math.random() * 100)])
  );

  const heatmapConfig = getDataLensHeatmapConfig({
    min: 0,
    max: 100,
    colorRange: ["#1e3a8a", "#3b82f6", "#60a5fa", "#93c5fd", "#dbeafe"],
  });

  const option = {
    title: {
      text: "Heatmap - DataLens Style",
      left: "center",
      top: 10,
      textStyle: { color: "#e2e8f0", fontSize: 16, fontWeight: 500 },
    },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: (params: any) => {
        return `${days[params.value[1]]}<br/>${hours[params.value[0]]}: ${params.value[2]}`;
      },
    },
    grid: {
      height: "55%",
      top: "15%",
      left: "10%",
      right: "5%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: hours,
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(15, 23, 42, 0.1)", "rgba(15, 23, 42, 0.2)"],
        },
      },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: days,
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(15, 23, 42, 0.1)", "rgba(15, 23, 42, 0.2)"],
        },
      },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      axisTick: { show: false },
    },
    visualMap: heatmapConfig.visualMap,
    series: [
      {
        name: "Activity",
        type: "heatmap",
        data: data,
        label: {
          show: false,
        },
        ...heatmapConfig.emphasis,
        itemStyle: {
          borderColor: "#1e293b",
          borderWidth: 1,
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
              <h1 className="text-3xl font-bold text-white">DataLens: Heatmap</h1>
              <ChartActionsMenu chartId={chartId} />
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <BaseChart option={option} height={600} chartId={chartId} />
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
