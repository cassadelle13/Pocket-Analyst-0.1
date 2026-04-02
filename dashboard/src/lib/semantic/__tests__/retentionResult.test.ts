import { pivotResultFromWide } from "../retentionResult";
import { test } from "vitest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const out = pivotResultFromWide({
    columns: ["cohort_date", "cohort_size", "w1", "m2", "period_7", "p_14", "w1_percent"],
    rows: [["2026-01-01", 100, 60, 40, 20, 10, 0.6]],
  });

  assert(out.cohorts.length === 1, `[retention-result] expected one cohort, got ${out.cohorts.length}`);
  assert(Array.isArray(out.metricKeys) && out.metricKeys?.includes("w1") && out.metricKeys?.includes("p_14"), `[retention-result] expected metric keys to include w1 and p_14, got: ${JSON.stringify(out.metricKeys)}`);
  assert(out.periods.includes(1) && out.periods.includes(2) && out.periods.includes(7) && out.periods.includes(14), `[retention-result] expected parsed periods [1,2,7,14], got: ${JSON.stringify(out.periods)}`);

  // eslint-disable-next-line no-console
  console.log("retention result suite: OK");
}

test("retention result suite", () => {
  main();
});
