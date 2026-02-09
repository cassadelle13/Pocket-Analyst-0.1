"use client";

import { useMemo } from "react";
import EChartsCanvas from "./EChartsCanvas";

type Datum = Record<string, any>;

type Props = {
  data: Datum[];
  index: string;
  valueKey: string;
  height?: number;
  color?: string;
  onBarClick?: (payload: Record<string, unknown>) => void;
  chartId?: string;
  groupId?: string;
};

export default function BarChartModule({ data, index, valueKey, height = 360, color = "#10b981", onBarClick, chartId, groupId }: Props) {
  const option = useMemo(() => {
    const x = data.map((d) => String(d[index] ?? ""));
    const y = data.map((d) => Number(d[valueKey] ?? 0));

    return {
      grid: { containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      toolbox: { show: true, right: 8, top: 0, itemSize: 14, feature: { dataZoom: { yAxisIndex: "none" }, restore: {} } },
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
        },
      ],
      xAxis: {
        type: "category",
        data: x,
        axisLabel: { rotate: 20 },
      },
      yAxis: {
        type: "value",
      },
      series: [
        {
          name: valueKey,
          type: "bar",
          data: y,
          barWidth: "60%",
          itemStyle: {
            color,
          },
          progressive: 1200,
          progressiveThreshold: 2000,
        },
      ],
      animation: true,
    };
  }, [data, index, valueKey, color]);

  return (
    <EChartsCanvas
      option={option}
      className="w-full"
      height={height}
      chartId={chartId}
      groupId={groupId}
      onReady={(chart: any) => {
        if (!onBarClick) return;
        chart.off("click");
        chart.on("click", (params: any) => {
          const row = data?.[params?.dataIndex];
          onBarClick({ ...(row ?? {}), __series: params?.seriesName });
        });
      }}
    />
  );
}
