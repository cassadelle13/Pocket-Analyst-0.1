import { describe, expect, it } from "vitest";
import { getScopedBiFiltersForChart } from "../../../components/dashboard/ChartPreview";
import { scopeBiFiltersForRequest } from "../planner";

const FILTERS = [
  { field: "m.region", op: "in" as const, values: ["EU"], scope: "report" as const, sourceChartId: "slicer-report" },
  { field: "m.city", op: "in" as const, values: ["Berlin"], scope: "visual" as const, sourceChartId: "chart-a" },
  { field: "m.country", op: "in" as const, values: ["DE"], scope: "page" as const, pageKey: "tab-1", sourceChartId: "slicer-page" },
];

function fieldsOf(xs: Array<{ field?: string }>) {
  return xs.map((f) => f.field).sort();
}

describe("BI filter scoping: client vs server", () => {
  it("agrees when chartId and pageKey are present", () => {
    const ctx = { chartId: "chart-a", pageKey: "tab-1" };
    const server = scopeBiFiltersForRequest({ version: 1, filters: FILTERS } as any, ctx);
    const client = getScopedBiFiltersForChart({ biFilters: FILTERS, ...ctx });
    expect(fieldsOf(server)).toEqual(fieldsOf(client));
    expect(server).toHaveLength(3);
  });

  it("documents C1: no context — server keeps all filters, client keeps only report", () => {
    const server = scopeBiFiltersForRequest({ version: 1, filters: FILTERS } as any, null);
    const client = getScopedBiFiltersForChart({ biFilters: FILTERS });
    expect(server).toHaveLength(3);
    expect(client.filter((f: any) => f.scope === "report")).toHaveLength(1);
    expect(fieldsOf(server)).not.toEqual(fieldsOf(client));
  });
});
