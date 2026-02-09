"use client";

import BaseChart from "../../components/charts/BaseChart";

type Props = {
  option: Record<string, unknown>;
  className?: string;
  height?: number;
  onReady?: (api: unknown) => void;
  chartId?: string;
  groupId?: string;
};

export default function EChartsCanvas({ option, className, height = 360, onReady, chartId, groupId }: Props) {
  return (
    <BaseChart
      option={option}
      className={className}
      height={height}
      onReady={(chart) => onReady?.(chart)}
      chartId={chartId}
      groupId={groupId}
    />
  );
}
