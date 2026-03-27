import { compilePivotQueryRaw } from "../retentionCompiler";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const compiledLong = compilePivotQueryRaw({
    query: {
      sourceTable: "analytics.events",
      sourceAlias: "e",
      cohortByExpr: "e.user_id",
      eventDateExpr: "e.event_time",
      metricExpr: "e.user_id",
      whereConditionSql: "e.event_name = 'session'",
      periods: [0, 1, 7, 30],
      unit: "day",
      pivotMode: "auto",
    },
    dialectHint: "postgres",
    connectionId: "conn1",
    connectionType: "postgres",
  });

  assert(compiledLong.connectionId === "conn1", "[raw-retention] connection id mismatch");
  assert(compiledLong.sql.includes("FROM analytics.events e"), "[raw-retention] source table alias not used");
  assert(compiledLong.sql.includes("WHERE e.event_name = 'session'"), "[raw-retention] where condition not applied");
  assert(compiledLong.sql.includes("WHERE a.period IN (0, 1, 7, 30)"), "[raw-retention] periods filter missing");

  const compiledWide = compilePivotQueryRaw({
    query: {
      sourceTable: "analytics.events",
      cohortByExpr: "e.user_id",
      eventDateExpr: "e.event_time",
      metricExpr: "e.user_id",
      periods: [0, 7],
      unit: "week",
      pivotMode: "sql",
    },
    dialectHint: "clickhouse",
    connectionId: "conn2",
    connectionType: "clickhouse",
  });

  assert(compiledWide.sql.includes("GROUP BY cohort_date"), "[raw-retention] wide pivot query not generated");
  assert(compiledWide.sql.includes("as d0"), "[raw-retention] expected wide period column d0");
  assert(compiledWide.sql.includes("as d7"), "[raw-retention] expected wide period column d7");

  // eslint-disable-next-line no-console
  console.log("retention raw compiler suite: OK");
}

main();
