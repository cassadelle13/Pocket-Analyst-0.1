import { describe, expect, it } from "vitest";
import { reconcileFiltersForChart, type BiFilter } from "../biFiltersContext";

describe("reconcileFiltersForChart", () => {
  it("keeps multiple visual filters for same chart on different fields", () => {
    const prev: BiFilter[] = [
      { field: "m.city", op: "in", values: ["Berlin"], scope: "visual", sourceChartId: "chart-a" },
      { field: "m.country", op: "in", values: ["DE"], scope: "visual", sourceChartId: "chart-a" },
      { field: "m.region", op: "in", values: ["EU"], scope: "visual", sourceChartId: "chart-b" },
    ];
    const next: BiFilter[] = [
      { field: "m.city", op: "in", values: ["Paris"], scope: "visual", sourceChartId: "chart-a" },
    ];

    const out = reconcileFiltersForChart("chart-a", prev, next);
    expect(out).toHaveLength(3);
    expect(out.find((f) => f.field === "m.city" && f.sourceChartId === "chart-a")?.values).toEqual(["Paris"]);
    expect(out.find((f) => f.field === "m.country" && f.sourceChartId === "chart-a")).toBeTruthy();
    expect(out.find((f) => f.field === "m.region" && f.sourceChartId === "chart-b")).toBeTruthy();
  });
});
