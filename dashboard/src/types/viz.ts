export const VIZ_TYPES = [
  "line",
  "area",
  "bar",
  "column",
  "pie",
  "donut",
  "scatter",
  "table",
  "pivot",
  "kpi",
  "funnel",
  "waterfall",
  "treemap",
  "histogram",
  "cohort",
  "slicer",
  "auto",
] as const;

export type VizType = (typeof VIZ_TYPES)[number];

export function isVizType(value: unknown): value is VizType {
  const v = String(value ?? "").trim().toLowerCase();
  return (VIZ_TYPES as readonly string[]).includes(v);
}
