/**
 * Regression: scoped BI filters for semantic query / values (slicer scope report vs visual vs page).
 * Run: npx tsx src/lib/semantic/__tests__/scopeBiFiltersForRequest.test.ts
 */
import { scopeBiFiltersForRequest } from "../planner";
import { test } from "vitest";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

test("scopeBiFiltersForRequest regression suite", () => {
  const global = {
    version: 1,
    filters: [
      { field: "m1.region", op: "in" as const, values: ["EU"], scope: "report" as const, sourceChartId: "slicer-lib" },
      { field: "m1.country", op: "in" as const, values: ["DE"], scope: "visual" as const, sourceChartId: "chart-linked" },
      { field: "m1.city", op: "in" as const, values: ["Berlin"], scope: "page" as const, pageKey: "tab1", sourceChartId: "slicer-page" },
    ],
  };

  let r = scopeBiFiltersForRequest(global as any, { chartId: "chart-linked", pageKey: "tab1" });
  assert(r.length === 3, `expected 3 filters for linked chart + tab, got ${r.length}`);

  r = scopeBiFiltersForRequest(global as any, { chartId: "other", pageKey: "tab1" });
  assert(r.length === 2, `expected report+page for other chart, got ${r.length}`);
  assert(r.every((f: any) => f.scope !== "visual"), "visual should not apply to other chart");

  r = scopeBiFiltersForRequest(global as any, { chartId: "chart-linked", pageKey: "other" });
  assert(r.length === 2, `expected report+visual when pageKey mismatch, got ${r.length}`);

  r = scopeBiFiltersForRequest(global as any, null);
  assert(r.length === 3, "no context should include all filters");

  const dup = {
    version: 1,
    filters: [
      { field: "m1.a", op: "in" as const, values: ["1"], scope: "report" as const, sourceChartId: "s1" },
      { field: "m1.a", op: "in" as const, values: ["2"], scope: "report" as const, sourceChartId: "s2" },
    ],
  };
  r = scopeBiFiltersForRequest(dup as any, { chartId: "x", pageKey: "y" });
  assert(r.length === 2, "two report filters both apply");
});
