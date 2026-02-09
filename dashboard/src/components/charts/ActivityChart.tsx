"use client";

import { AreaChart } from "@tremor/react";

interface ActivityChartProps {
  data: Array<{ time: string; events: number; users: number }>;
}

export function ActivityChart({ data }: ActivityChartProps) {
  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-4">
      <AreaChart
        data={data}
        index="time"
        categories={["events", "users"]}
        colors={["#F97316", "#3B82F6"]}
        valueFormatter={(value) => Number(value).toLocaleString()}
        className="h-64"
        yAxisWidth={60}
      />
    </div>
  );
}
