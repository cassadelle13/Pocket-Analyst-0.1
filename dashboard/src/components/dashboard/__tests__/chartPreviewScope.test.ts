import { describe, expect, it } from "vitest";
import { getScopedBiFiltersForChart } from "../ChartPreview";

describe("getScopedBiFiltersForChart", () => {
  const filters = [
    { field: "m.region", op: "in", values: ["EU"], scope: "report", sourceChartId: "slicer-report" },
    { field: "m.city", op: "in", values: ["Berlin"], scope: "visual", sourceChartId: "chart-a" },
    { field: "m.country", op: "in", values: ["DE"], scope: "page", pageKey: "tab-1", sourceChartId: "slicer-page" },
  ];

  it("applies report filters to all charts", () => {
    const out = getScopedBiFiltersForChart({ biFilters: filters, chartId: "chart-z", pageKey: "tab-1" });
    expect(out.some((f: any) => f.scope === "report")).toBe(true);
  });

  it("applies visual filters only to linked chart", () => {
    const target = getScopedBiFiltersForChart({ biFilters: filters, chartId: "chart-a", pageKey: "tab-1" });
    const other = getScopedBiFiltersForChart({ biFilters: filters, chartId: "chart-b", pageKey: "tab-1" });
    expect(target.some((f: any) => f.field === "m.city")).toBe(true);
    expect(other.some((f: any) => f.field === "m.city")).toBe(false);
  });
});
