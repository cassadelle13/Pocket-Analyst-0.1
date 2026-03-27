export type SqlDialect = "clickhouse" | "postgres";

export type RetentionUnit = "day" | "week" | "month";

export type RetentionQueryBuildParams = {
  dialect: SqlDialect;

  /** FROM target (already resolved/bound). Example: "events" */
  sourceTable: string;

  /** Alias for sourceTable. Example: "e" */
  sourceAlias: string;

  /** SQL expression that identifies a cohort entity (user_id / account_id / etc). Example: "e.user_id" */
  cohortByExpr: string;

  /** SQL expression representing event timestamp/date. Example: "e.timestamp" */
  eventDateExpr: string;

  /** SQL expression to count as cohort members / active users. Example: "e.user_id" */
  metricExpr: string;

  periods: number[];
  unit?: RetentionUnit;

  /** Raw condition (without WHERE). Must be produced by planner, not user string. */
  whereConditionSql?: string;

  /** Optional extra grouping keys for cohort sizes (e.g. platform). */
  cohortDimensionsSql?: string[];
};

export type RetentionWidePivotBuildParams = RetentionQueryBuildParams & {
  /** Prefix for wide columns. Example: "d" => d1,d7,d30 */
  periodColumnPrefix?: string;
};

function uniqExpr(dialect: SqlDialect, expr: string): string {
  return dialect === "clickhouse" ? `uniqExact(${expr})` : `COUNT(DISTINCT ${expr})`;
}

function numCast(dialect: SqlDialect, expr: string): string {
  return dialect === "clickhouse" ? `toFloat64(${expr})` : `(${expr})::double precision`;
}

function dateBucket(dialect: SqlDialect, unit: RetentionUnit, expr: string): string {
  if (dialect === "clickhouse") {
    if (unit === "day") return `toDate(${expr})`;
    if (unit === "week") return `toStartOfWeek(${expr})`;
    return `toStartOfMonth(${expr})`;
  }

  if (unit === "day") return `date_trunc('day', ${expr})`;
  if (unit === "week") return `date_trunc('week', ${expr})`;
  return `date_trunc('month', ${expr})`;
}

function dateDiff(dialect: SqlDialect, unit: RetentionUnit, leftDateExpr: string, rightDateExpr: string): string {
  if (dialect === "clickhouse") {
    return `dateDiff('${unit}', ${leftDateExpr}, ${rightDateExpr})`;
  }

  if (unit === "day") return `date_part('day', ${rightDateExpr} - ${leftDateExpr})`;
  if (unit === "week") return `floor(date_part('day', ${rightDateExpr} - ${leftDateExpr}) / 7)`;
  return `((date_part('year', ${rightDateExpr}) - date_part('year', ${leftDateExpr})) * 12 + (date_part('month', ${rightDateExpr}) - date_part('month', ${leftDateExpr})))`;
}

export function buildRetentionQuery(params: RetentionQueryBuildParams): string {
  const dialect = params.dialect;
  const unit: RetentionUnit = params.unit ?? "day";
  const periods = Array.from(new Set((params.periods ?? []).map((p) => Number(p)).filter((p) => Number.isFinite(p) && p >= 0))).sort((a, b) => a - b);
  if (periods.length === 0) {
    throw new Error("Retention periods must be a non-empty array");
  }

  const where = String(params.whereConditionSql ?? "").trim();
  const whereSql = where ? `WHERE ${where}` : "";

  const cohortDims = Array.isArray(params.cohortDimensionsSql) ? params.cohortDimensionsSql.filter(Boolean) : [];
  const cohortDimsSelect = cohortDims.length ? `, ${cohortDims.join(", ")}` : "";
  const cohortDimsGroup = cohortDims.length ? `, ${cohortDims.join(", ")}` : "";
  const cohortDimsJoin = cohortDims.length
    ? cohortDims.map((d, i) => `a.cohort_dim_${i} = s.cohort_dim_${i}`).join(" AND ")
    : "1=1";

  const bucketEventDate = dateBucket(dialect, unit, params.eventDateExpr);

  const sql = `
WITH
  cohorts AS (
    SELECT
      ${params.cohortByExpr} AS cohort_id,
      min(${bucketEventDate}) AS cohort_date
      ${cohortDimsSelect}
    FROM ${params.sourceTable} ${params.sourceAlias}
    ${whereSql}
    GROUP BY cohort_id${cohortDimsGroup}
  ),
  activity AS (
    SELECT
      c.cohort_date AS cohort_date,
      ${cohortDims.length ? cohortDims.map((d, i) => `${d} AS cohort_dim_${i}`).join(", ") + "," : ""}
      ${dateDiff(dialect, unit, "c.cohort_date", bucketEventDate)} AS period,
      ${uniqExpr(dialect, params.metricExpr)} AS active_users
    FROM ${params.sourceTable} ${params.sourceAlias}
    INNER JOIN cohorts c ON ${params.cohortByExpr} = c.cohort_id
    ${whereSql}
    GROUP BY cohort_date${cohortDims.length ? ", " + cohortDims.map((_d, i) => `cohort_dim_${i}`).join(", ") : ""}, period
  ),
  cohort_sizes AS (
    SELECT
      cohort_date
      ${cohortDims.length ? ", " + cohortDims.map((d, i) => `${d} AS cohort_dim_${i}`).join(", ") : ""},
      ${dialect === "clickhouse" ? "count()" : "COUNT(*)"}  AS cohort_size
    FROM cohorts
    GROUP BY cohort_date${cohortDims.length ? ", " + cohortDims.map((_d, i) => `cohort_dim_${i}`).join(", ") : ""}
  )
SELECT
  a.cohort_date AS cohort_date,
  a.period AS period,
  a.active_users AS active_users,
  s.cohort_size AS cohort_size,
  CASE
    WHEN s.cohort_size = 0 THEN 0
    ELSE ${numCast(dialect, "a.active_users")} / ${numCast(dialect, "s.cohort_size")}
  END AS retention_rate
FROM activity a
INNER JOIN cohort_sizes s
  ON a.cohort_date = s.cohort_date AND ${cohortDimsJoin}
WHERE a.period IN (${periods.join(", ")})
ORDER BY a.cohort_date DESC, a.period ASC
  `.trim();

  return sql;
}

function wideCol(prefix: string, period: number): string {
  const p = Math.trunc(Number(period));
  if (!Number.isFinite(p) || p < 0) throw new Error(`Invalid retention period: ${period}`);
  return `${prefix}${p}`;
}

export function buildRetentionWidePivotQuery(params: RetentionWidePivotBuildParams): string {
  const dialect = params.dialect;
  const unit: RetentionUnit = params.unit ?? "day";
  const periods = Array.from(new Set((params.periods ?? []).map((p) => Number(p)).filter((p) => Number.isFinite(p) && p >= 0))).sort((a, b) => a - b);
  if (periods.length === 0) {
    throw new Error("Retention periods must be a non-empty array");
  }

  const prefix = String(params.periodColumnPrefix ?? "d").trim() || "d";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(prefix)) {
    throw new Error(`Invalid periodColumnPrefix: ${prefix}`);
  }

  const longSql = buildRetentionQuery(params);

  const colsAbs = periods.map((p) => {
    const col = wideCol(prefix, p);
    if (dialect === "clickhouse") {
      // maxIf works because for each cohort_date+period we have at most one row.
      return `maxIf(active_users, period = ${Math.trunc(p)}) as ${col}`;
    }
    return `max(CASE WHEN period = ${Math.trunc(p)} THEN active_users ELSE NULL END) as ${col}`;
  });

  const colsPct = periods.map((p) => {
    const col = `${wideCol(prefix, p)}_percent`;
    if (dialect === "clickhouse") {
      return `maxIf(retention_rate, period = ${Math.trunc(p)}) as ${col}`;
    }
    return `max(CASE WHEN period = ${Math.trunc(p)} THEN retention_rate ELSE NULL END) as ${col}`;
  });

  const pivotSql = `
SELECT
  cohort_date,
  max(cohort_size) as cohort_size,
  ${[...colsAbs, ...colsPct].join(",\n  ")}
FROM (
  ${longSql}
) t
GROUP BY cohort_date
ORDER BY cohort_date DESC
  `.trim();

  return pivotSql;
}

// Pivot-first aliases (DataLens-aligned terminology).
export const buildCohortPivotQuery = buildRetentionQuery;
export const buildWidePivotQuery = buildRetentionWidePivotQuery;
