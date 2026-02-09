"use client";

import BaseChart from "./BaseChart";

type Props = {
  option: Record<string, unknown>;
  className?: string;
  height?: number;
  onReady?: (chart: unknown, echarts: unknown) => void;
};

export default function ComplexChart({ option, className, height, onReady }: Props) {
  return <BaseChart option={option} className={className} height={height} onReady={onReady} />;
}
