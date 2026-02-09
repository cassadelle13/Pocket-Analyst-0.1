"use client";

import { BarList } from "@tremor/react";

type Datum = Record<string, any>;

type Props = {
  data: Datum[];
  index: string;
  valueKey: string;
};

export function BarChartSimple({ data, index, valueKey }: Props) {
  const items = (data ?? []).map((row) => ({
    name: String(row?.[index] ?? ""),
    value: Number(row?.[valueKey] ?? 0),
  }));

  return <BarList data={items} />;
}
