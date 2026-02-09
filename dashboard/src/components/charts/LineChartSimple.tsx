"use client";

import { AreaChart } from "@tremor/react";

type Datum = Record<string, any>;

type Props = {
  data: Datum[];
  index: string;
  categories: string[];
  colors?: string[];
};

export function LineChartSimple({ data, index, categories, colors }: Props) {
  return (
    <AreaChart
      data={data}
      index={index}
      categories={categories}
      colors={colors}
      showLegend
      className="h-64"
      yAxisWidth={56}
    />
  );
}
