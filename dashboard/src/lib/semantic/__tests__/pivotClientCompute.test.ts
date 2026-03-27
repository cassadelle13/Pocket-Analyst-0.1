import { computePivotResultSync } from "../pivotClientCompute";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const columns = ["cohort_date", "activity_date", "user_id"];
  const rows: unknown[][] = [
    ["2026-01-01", "2026-01-01", "u1"],
    ["2026-01-01", "2026-01-02", "u1"],
    ["2026-01-01", "2026-01-02", "u2"],
    ["2026-01-02", "2026-01-02", "u3"],
  ];

  const out = computePivotResultSync({
    rows,
    columns,
    cohortField: "cohort_date",
    activityField: "activity_date",
    userField: "user_id",
    unit: "day",
    requestedPeriods: [0, 1],
    maxRows: 100,
  });

  assert(out.cohorts.length === 2, `[pivot-sync] expected 2 cohorts, got ${out.cohorts.length}`);
  assert(out.periods.length === 2 && out.periods[0] === 0 && out.periods[1] === 1, `[pivot-sync] periods mismatch: ${JSON.stringify(out.periods)}`);
  assert(Array.isArray(out.metricKeys) && out.metricKeys?.includes("d1_percent"), "[pivot-sync] metricKeys missing percent period");
  assert(Array.isArray(out.lineChartData.rows) && out.lineChartData.rows.length === 2, "[pivot-sync] missing lineChartData rows");

  // eslint-disable-next-line no-console
  console.log("pivot client compute suite: OK");
}

main();
