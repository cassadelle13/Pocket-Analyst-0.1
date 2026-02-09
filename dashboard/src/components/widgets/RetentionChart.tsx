"use client";

import { BarList } from "@tremor/react";

interface RetentionDataPoint {
  day: string;
  retention: number;
  benchmark: number;
}

const retentionData: RetentionDataPoint[] = [
  { day: "D1", retention: 45, benchmark: 50 },
  { day: "D3", retention: 32, benchmark: 35 },
  { day: "D7", retention: 24, benchmark: 28 },
  { day: "D14", retention: 18, benchmark: 20 },
  { day: "D30", retention: 12, benchmark: 15 },
];

interface RetentionChartProps {
  title?: string;
  data?: RetentionDataPoint[];
}

export function RetentionChart({ title = "Retention Curve", data = retentionData }: RetentionChartProps) {
  const barData = data.map((item) => ({
    name: item.day,
    value: item.retention,
  }));

  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Retention by cohort day</p>
        </div>
      </div>

      <BarList data={barData} />
    </div>
  );
}
