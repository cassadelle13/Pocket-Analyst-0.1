export type SqlDialect = "clickhouse" | "postgres" | "mssql";

export type WindowAggFn = "sum" | "avg" | "max" | "min" | "count";

export type WindowFrame = {
  frameStart?: number;
  frameEnd?: number;
};

export type WindowBuildParams = {
  dialect: SqlDialect;
  fn: WindowAggFn;
  measureExpr: string;
  partitionByExprs?: string[];
  orderByExpr?: string;
  frame?: WindowFrame;
};

function fnSql(dialect: SqlDialect, fn: WindowAggFn): string {
  const f = fn.toUpperCase();
  // ClickHouse supports standard window functions since 21+.
  // Keep SQL standard here; dialect-specific mapping can be added later.
  if (dialect === "clickhouse") return f;
  return f;
}

function renderOver(params: {
  partitionByExprs?: string[];
  orderByExpr?: string;
  frame?: WindowFrame;
}): string {
  const parts: string[] = [];
  const partitionBy = Array.isArray(params.partitionByExprs) ? params.partitionByExprs.filter(Boolean) : [];
  if (partitionBy.length) {
    parts.push(`PARTITION BY ${partitionBy.join(", ")}`);
  }
  const orderBy = String(params.orderByExpr ?? "").trim();
  if (orderBy) {
    parts.push(`ORDER BY ${orderBy}`);
  }

  const fs = params.frame?.frameStart;
  const fe = params.frame?.frameEnd;
  if (fs != null || fe != null) {
    const start = Math.max(0, Number.isFinite(Number(fs)) ? Number(fs) : 0);
    const end = Math.max(0, Number.isFinite(Number(fe)) ? Number(fe) : 0);
    parts.push(`ROWS BETWEEN ${start} PRECEDING AND ${end} FOLLOWING`);
  }

  return `OVER (${parts.join(" ")})`;
}

export function buildWindowAgg(params: WindowBuildParams): string {
  const fn = fnSql(params.dialect, params.fn);
  const over = renderOver({
    partitionByExprs: params.partitionByExprs,
    orderByExpr: params.orderByExpr,
    frame: params.frame,
  });
  return `${fn}(${params.measureExpr}) ${over}`;
}

export function buildRollingAvg(params: {
  dialect: SqlDialect;
  measureExpr: string;
  window: number;
  orderByExpr: string;
  partitionByExprs?: string[];
}): string {
  const w = Math.max(1, Math.min(10_000, Number(params.window) || 1));
  return buildWindowAgg({
    dialect: params.dialect,
    fn: "avg",
    measureExpr: params.measureExpr,
    partitionByExprs: params.partitionByExprs,
    orderByExpr: params.orderByExpr,
    frame: {
      frameStart: w - 1,
      frameEnd: 0,
    },
  });
}

export function wrapWithWindowLayer(params: {
  innerSql: string;
  windowExprs: Array<{ alias: string; sql: string }>;
}): string {
  const inner = String(params.innerSql ?? "").trim();
  const exprs = Array.isArray(params.windowExprs)
    ? params.windowExprs.filter((w) => String(w?.alias ?? "").trim() && String(w?.sql ?? "").trim())
    : [];
  if (!inner || exprs.length === 0) return inner;

  const rendered = exprs
    .map((w) => `${String(w.sql).trim()} as ${String(w.alias).trim()}`)
    .join(", ");

  return `SELECT *, ${rendered} FROM (${inner}) _win_inner`;
}
