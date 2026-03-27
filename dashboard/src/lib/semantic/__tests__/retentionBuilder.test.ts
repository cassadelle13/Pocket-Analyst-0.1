import { buildRetentionQuery, buildRetentionWidePivotQuery } from "../retentionBuilder";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const sqlWeekPg = buildRetentionQuery({
    dialect: "postgres",
    sourceTable: "analytics.events",
    sourceAlias: "e",
    cohortByExpr: "e.user_id",
    eventDateExpr: "e.event_time",
    metricExpr: "e.user_id",
    periods: [0, 1, 4],
    unit: "week",
  });
  assert(sqlWeekPg.includes("date_trunc('week', e.event_time)"), `[retention-builder] expected week bucket in postgres SQL, got: ${sqlWeekPg}`);
  assert(sqlWeekPg.includes("/ 7)"), `[retention-builder] expected week dateDiff in postgres SQL, got: ${sqlWeekPg}`);

  const sqlMonthCh = buildRetentionQuery({
    dialect: "clickhouse",
    sourceTable: "analytics.events",
    sourceAlias: "e",
    cohortByExpr: "e.user_id",
    eventDateExpr: "e.event_time",
    metricExpr: "e.user_id",
    periods: [0, 1, 3],
    unit: "month",
  });
  assert(sqlMonthCh.includes("toStartOfMonth(e.event_time)"), `[retention-builder] expected month bucket in clickhouse SQL, got: ${sqlMonthCh}`);
  assert(sqlMonthCh.includes("dateDiff('month'"), `[retention-builder] expected month dateDiff in clickhouse SQL, got: ${sqlMonthCh}`);

  const wideSql = buildRetentionWidePivotQuery({
    dialect: "postgres",
    sourceTable: "analytics.events",
    sourceAlias: "e",
    cohortByExpr: "e.user_id",
    eventDateExpr: "e.event_time",
    metricExpr: "e.user_id",
    periods: [0, 1, 7],
    unit: "week",
    periodColumnPrefix: "w",
  });
  assert(wideSql.includes("w7_percent"), `[retention-builder] expected wide percent column w7_percent, got: ${wideSql}`);

  // eslint-disable-next-line no-console
  console.log("retention builder suite: OK");
}

main();
