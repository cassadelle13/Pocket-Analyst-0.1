"use client";

import { Card, Title, AreaChart } from "@tremor/react";

interface ChartDataPoint {
  date: string;
  "Active Users": number;
  "New Users": number;
}

const chartData: ChartDataPoint[] = [
  { date: "Jan 1", "Active Users": 2890, "New Users": 400 },
  { date: "Jan 8", "Active Users": 3200, "New Users": 520 },
  { date: "Jan 15", "Active Users": 3100, "New Users": 480 },
  { date: "Jan 22", "Active Users": 3500, "New Users": 610 },
  { date: "Jan 29", "Active Users": 3800, "New Users": 720 },
  { date: "Feb 5", "Active Users": 4200, "New Users": 850 },
  { date: "Feb 12", "Active Users": 4100, "New Users": 790 },
];

interface AnalyticsChartProps {
  title?: string;
  data?: ChartDataPoint[];
}

export function AnalyticsChart({ title = "User Activity", data = chartData }: AnalyticsChartProps) {
  return (
    <Card>
      <Title>{title}</Title>
      <AreaChart
        className="h-72 mt-4"
        data={data}
        index="date"
        categories={["Active Users", "New Users"]}
        colors={["blue", "cyan"]}
        valueFormatter={(value) => `${value.toLocaleString()}`}
      />
    </Card>
  );
}
