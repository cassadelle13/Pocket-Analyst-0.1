/**
 * Smart chart builder: maps DB table data + chartName → ECharts option.
 * Inspired by datalens-ui visualization configs but uses ECharts directly.
 */

import type { VizType } from "@/types/viz";

export type { VizType } from "@/types/viz";

export type MappedAggFn = "SUM" | "COUNT" | "COUNTD" | "AVG" | "MIN" | "MAX" | "LAST";

export type ColumnMapping = {
  xColumn?: string;
  yColumns?: Array<{ col: string; agg: MappedAggFn }>;
  y2Columns?: Array<{ col: string; agg: MappedAggFn }>;
  groupBy?: string;
  filters?: Array<{
    field?: string;
    operator?:
      | "eq"
      | "neq"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
      | "contains"
      | "icontains"
      | "notcontains"
      | "noticontains"
      | "startswith"
      | "istartswith"
      | "endswith"
      | "iendswith"
      | "in"
      | "not_in"
      | "between"
      | "not_between"
      | "isnull"
      | "isnotnull";
    value?: unknown;
    values?: unknown[];
  }>;
  orderBy?: Array<{ field?: string; dir?: "asc" | "desc" }>;
  showLabels?: boolean;
  stackMode?: "none" | "stacked" | "normalized";
  nullDisplay?: "as_zero" | "skip" | "interpolate";
  colorByMeasure?: boolean;
  tooltipColumns?: string[];
  detailsColumns?: string[];
  details2Columns?: string[];
  drilldownColumns?: string[];
};

type SqlFilter = {
  field?: string;
  operator?: string;
  value?: unknown;
  values?: unknown[];
};

type BiSqlFilter = {
  field?: string;
  op?: string;
  values?: unknown[];
  scope?: "report" | "page" | "visual";
  sourceChartId?: string;
  pageKey?: string;
};

export function injectTemplateVars(
  sql: string,
  dateRange?: { start?: unknown; end?: unknown }
): string {
  const toDateLiteral = (v: unknown, fallback?: string): string => {
    if (v == null || v === "") {
      return fallback ? `'${fallback}'` : "null";
    }
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) {
      return fallback ? `'${fallback}'` : "null";
    }
    return `'${d.toISOString().slice(0, 10)}'`;
  };

  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return String(sql ?? "")
    .replace(/\{\{interval_from\}\}/g, toDateLiteral(dateRange?.start, defaultStart))
    .replace(/\{\{interval_to\}\}/g, toDateLiteral(dateRange?.end, defaultEnd));
}

function buildMappedSqlLegacy({
  tableKey,
  connectionType,
  vizType,
  mapping,
  biFilters,
  dateRange,
}: {
  tableKey: string;
  connectionType?: string;
  vizType: VizType;
  mapping: ColumnMapping;
  biFilters?: BiSqlFilter[];
  dateRange?: { start?: string; end?: string; timeDimColumn?: string };
}): string {
  const ct = String(connectionType ?? "").toLowerCase();
  const isMssql = ct.includes("mssql") || ct.includes("sqlserver");

  const limitClause = (n: number) => (isMssql ? "" : ` LIMIT ${n}`);
  const topPrefix = (n: number) => (isMssql ? `TOP ${n} ` : "");

  const x = String(mapping?.xColumn ?? "").trim();
  const groupBy = String(mapping?.groupBy ?? "").trim();
  const yCols = Array.isArray(mapping?.yColumns) ? mapping.yColumns : [];
  const y2Cols = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];

  const normalizeCols = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const res: string[] = [];
    for (const v of arr) {
      const s = String(v ?? "").trim();
      if (!s) continue;
      res.push(s);
    }
    return res;
  };

  const extraDimsRaw = [
    ...normalizeCols((mapping as any)?.tooltipColumns),
    ...normalizeCols((mapping as any)?.detailsColumns),
    ...normalizeCols((mapping as any)?.details2Columns),
    ...normalizeCols((mapping as any)?.drilldownColumns),
  ];
  const extraDims = Array.from(new Set(extraDimsRaw));

  const safeAgg = (a: string): MappedAggFn => {
    const u = a.toUpperCase();
    if (u === "SUM" || u === "COUNT" || u === "COUNTD" || u === "AVG" || u === "MIN" || u === "MAX" || u === "LAST") return u as MappedAggFn;
    return "SUM";
  };

  const aggExpr = (agg: MappedAggFn, col: string) => {
    if (agg === "COUNT") return `COUNT(${col})`;
    if (agg === "COUNTD") return `COUNT(DISTINCT ${col})`;
    if (agg === "AVG") return `AVG(${col})`;
    if (agg === "MIN") return `MIN(${col})`;
    if (agg === "MAX") return `MAX(${col})`;
    if (agg === "LAST") return `MAX(${col})`;
    return `SUM(${col})`;
  };

  const makeAggAlias = (col: string, prefix = "agg"): string => {
    const base = String(col ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `${prefix}_${base || "value"}`;
  };

  const quoteIdent = (id: string): string => {
    const s = String(id ?? "").trim();
    if (!s) return "";
    // allow dotted identifiers: schema.table or table.col
    const parts = s.split(".").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return "";
    if (isMssql) {
      return parts.map((p) => `[${p.replace(/]/g, "]]" )}]`).join(".");
    }
    return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
  };

  const sqlLiteral = (v: unknown): string => {
    if (v == null) return "NULL";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const renderLike = (field: string, pattern: string, opts?: { caseInsensitive?: boolean; negated?: boolean }) => {
    const ci = Boolean(opts?.caseInsensitive);
    const negated = Boolean(opts?.negated);
    if (isMssql) {
      const base = ci
        ? `LOWER(${field}) LIKE LOWER(${sqlLiteral(pattern)})`
        : `${field} LIKE ${sqlLiteral(pattern)}`;
      return negated ? `NOT (${base})` : base;
    }
    const op = ci ? "ILIKE" : "LIKE";
    const base = `${field} ${op} ${sqlLiteral(pattern)}`;
    return negated ? `NOT (${base})` : base;
  };

  const normalizeSqlFilter = (raw: SqlFilter | BiSqlFilter): { field: string; op: string; values: unknown[] } | null => {
    const field = quoteIdent(String((raw as any)?.field ?? "").trim());
    if (!field) return null;
    const opRaw = String((raw as any)?.operator ?? (raw as any)?.op ?? "eq").trim().toLowerCase();
    const op = opRaw === "nin" ? "not_in" : opRaw;
    const values = Array.isArray((raw as any)?.values)
      ? (raw as any).values
      : ((raw as any)?.value != null ? [(raw as any).value] : []);
    return { field, op, values };
  };

  const renderSqlFilterClause = (f: { field: string; op: string; values: unknown[] }): string => {
    const { field, op, values } = f;
    if (op === "eq") return `${field} = ${sqlLiteral(values[0])}`;
    if (op === "neq") return `${field} != ${sqlLiteral(values[0])}`;
    if (op === "gt") return `${field} > ${sqlLiteral(values[0])}`;
    if (op === "gte") return `${field} >= ${sqlLiteral(values[0])}`;
    if (op === "lt") return `${field} < ${sqlLiteral(values[0])}`;
    if (op === "lte") return `${field} <= ${sqlLiteral(values[0])}`;
    if (op === "contains") return renderLike(field, `%${String(values[0] ?? "")}%`, { caseInsensitive: true });
    if (op === "icontains") return renderLike(field, `%${String(values[0] ?? "")}%`, { caseInsensitive: true });
    if (op === "notcontains") return renderLike(field, `%${String(values[0] ?? "")}%`, { caseInsensitive: false, negated: true });
    if (op === "noticontains") return renderLike(field, `%${String(values[0] ?? "")}%`, { caseInsensitive: true, negated: true });
    if (op === "startswith") return renderLike(field, `${String(values[0] ?? "")}%`, { caseInsensitive: false });
    if (op === "istartswith") return renderLike(field, `${String(values[0] ?? "")}%`, { caseInsensitive: true });
    if (op === "endswith") return renderLike(field, `%${String(values[0] ?? "")}`, { caseInsensitive: false });
    if (op === "iendswith") return renderLike(field, `%${String(values[0] ?? "")}`, { caseInsensitive: true });
    if (op === "isnull") return `${field} IS NULL`;
    if (op === "isnotnull") return `${field} IS NOT NULL`;
    if (op === "in") {
      const vals = values.map((v: unknown) => sqlLiteral(v)).join(", ");
      return `${field} IN (${vals || "NULL"})`;
    }
    if (op === "not_in") {
      const vals = values.map((v: unknown) => sqlLiteral(v)).join(", ");
      return `${field} NOT IN (${vals || "NULL"})`;
    }
    if (op === "between") return `${field} BETWEEN ${sqlLiteral(values[0])} AND ${sqlLiteral(values[1])}`;
    if (op === "not_between") return `${field} NOT BETWEEN ${sqlLiteral(values[0])} AND ${sqlLiteral(values[1])}`;
    return "";
  };

  const whereFromMappingFilters = (() => {
    const filters = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
    const scopedBiFilters = Array.isArray(biFilters)
      ? biFilters.filter((f) => {
          const scope = String((f as any)?.scope ?? "visual").trim().toLowerCase();
          return scope === "report" || scope === "page" || scope === "visual";
        })
      : [];

    const dateRangeClauses: string[] = [];
    const drStart = String((dateRange as any)?.start ?? "").trim();
    const drEnd = String((dateRange as any)?.end ?? "").trim();
    const drField = quoteIdent(String((dateRange as any)?.timeDimColumn ?? "").trim());
    if (drField && (drStart || drEnd)) {
      if (drStart && drEnd) {
        dateRangeClauses.push(`${drField} BETWEEN ${sqlLiteral(drStart)} AND ${sqlLiteral(drEnd)}`);
      } else if (drStart) {
        dateRangeClauses.push(`${drField} >= ${sqlLiteral(drStart)}`);
      } else if (drEnd) {
        dateRangeClauses.push(`${drField} <= ${sqlLiteral(drEnd)}`);
      }
    }

    const clauses: string[] = [];
    for (const raw of [...filters, ...scopedBiFilters]) {
      const normalized = normalizeSqlFilter(raw as any);
      if (!normalized) continue;
      const clause = renderSqlFilterClause(normalized);
      if (!clause) continue;
      clauses.push(clause);
    }
    clauses.push(...dateRangeClauses);
    return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  })();

  if (vizType === "pivot") {
    const rowDim = String((mapping as any)?.detailsColumns?.[0] ?? mapping?.xColumn ?? "").trim();
    const colDim = String((mapping as any)?.details2Columns?.[0] ?? mapping?.groupBy ?? "").trim();
    const valCol = String((mapping as any)?.yColumns?.[0]?.col ?? "").trim();
    const valAgg = safeAgg(String((mapping as any)?.yColumns?.[0]?.agg ?? "SUM"));

    if (!rowDim || !colDim) {
      return `SELECT ${topPrefix(200)}* FROM ${tableKey}${whereFromMappingFilters}${limitClause(200)}`;
    }

    const rowQ = quoteIdent(rowDim);
    const colQ = quoteIdent(colDim);
    const valExpr = valCol ? `${aggExpr(valAgg, quoteIdent(valCol))}` : "COUNT(*)";
    return `SELECT ${topPrefix(500)}${rowQ} as pivot_row, ${colQ} as pivot_col, ${valExpr} as pivot_value FROM ${tableKey}${whereFromMappingFilters} GROUP BY ${rowQ}, ${colQ} ORDER BY ${rowQ}, ${colQ}${limitClause(500)}`;
  }

  if (vizType === "table") {
    const detailsColsRaw = normalizeCols((mapping as any)?.detailsColumns);
    const detailsCols = Array.from(new Set(detailsColsRaw));
    const measures = [
      ...yCols.filter((m) => m?.col).map((m) => ({ col: String(m.col), agg: safeAgg(String(m.agg)) })),
      ...y2Cols.filter((m: any) => m?.col).map((m: any) => ({ col: String(m.col), agg: safeAgg(String(m.agg)) })),
    ];

    if (detailsCols.length > 0 && measures.length > 0) {
      const groupCols = detailsCols.map(quoteIdent).filter(Boolean);
      const selectDims = groupCols.join(", ");
      const aggItems = measures.map((m) => ({
        alias: makeAggAlias(m.col, String(m.agg ?? "agg").toLowerCase()),
        expr: aggExpr(m.agg, quoteIdent(m.col)),
      }));
      const selectAggs = aggItems
        .map((item) => `${item.expr} as ${quoteIdent(item.alias)}`)
        .join(", ");
      if (selectDims && selectAggs) {
        const orderAlias = aggItems[0]?.alias ? quoteIdent(aggItems[0].alias) : quoteIdent(makeAggAlias(measures[0].col, String(measures[0].agg ?? "agg").toLowerCase()));
        return `SELECT ${topPrefix(100)}${selectDims}, ${selectAggs} FROM ${tableKey}${whereFromMappingFilters} GROUP BY ${groupCols.join(", ")} ORDER BY ${orderAlias} DESC${limitClause(100)}`;
      }
    }

    if (detailsCols.length > 0) {
      const selectList = detailsCols.map(quoteIdent).filter(Boolean).join(", ");
      if (selectList) {
        return `SELECT ${topPrefix(100)}${selectList} FROM ${tableKey}${whereFromMappingFilters}${limitClause(100)}`;
      }
    }
    return `SELECT ${topPrefix(100)}* FROM ${tableKey}${whereFromMappingFilters}${limitClause(100)}`;
  }

  if (vizType === "kpi") {
    const y0 = yCols[0]?.col ? String(yCols[0].col) : "";
    const agg0 = safeAgg(String(yCols[0]?.agg ?? "SUM"));
    if (!y0) return `SELECT ${topPrefix(1)}1 as value`;
    return `SELECT ${aggExpr(agg0, quoteIdent(y0))} as value FROM ${tableKey}${whereFromMappingFilters}`;
  }

  if (vizType === "scatter") {
    const x0 = String(yCols[0]?.col ?? "").trim();
    const y0 = String(yCols[1]?.col ?? "").trim();
    if (!x0 || !y0) return `SELECT ${topPrefix(200)}* FROM ${tableKey}${whereFromMappingFilters}${limitClause(200)}`;
    return `SELECT ${topPrefix(500)}${quoteIdent(x0)} as x, ${quoteIdent(y0)} as y FROM ${tableKey}${whereFromMappingFilters}${limitClause(500)}`;
  }

  if (vizType === "histogram") {
    if (!x) return `SELECT ${topPrefix(2000)}* FROM ${tableKey}${whereFromMappingFilters}${limitClause(2000)}`;
    return `SELECT ${topPrefix(2000)}${quoteIdent(x)} as v FROM ${tableKey}${whereFromMappingFilters}${limitClause(2000)}`;
  }

  const hasX = !!x;
  const measures = yCols.filter((m) => m?.col).map((m) => ({ col: String(m.col), agg: safeAgg(String(m.agg)) }));
  const measures2 = y2Cols.filter((m: any) => m?.col).map((m: any) => ({ col: String(m.col), agg: safeAgg(String(m.agg)) }));
  const allMeasures = [...measures, ...measures2];
  if (!hasX || measures.length === 0) {
    return `SELECT ${topPrefix(50)}* FROM ${tableKey}${whereFromMappingFilters}${limitClause(50)}`;
  }

  const groupCols = Array.from(new Set([x, ...(groupBy ? [groupBy] : []), ...extraDims].filter(Boolean)));
  const shouldDateTruncX = (vizType === "line" || vizType === "bar" || vizType === "area") && DATE_NAME_RE.test(x);
  const xExpr = shouldDateTruncX ? `DATE_TRUNC('day', ${quoteIdent(x)})` : quoteIdent(x);
  const xAlias = shouldDateTruncX ? "x_day" : x;
  const extraGroupCols = Array.from(new Set([...(groupBy ? [groupBy] : []), ...extraDims].filter(Boolean)));
  const extraGroupColsQ = extraGroupCols.map((c) => quoteIdent(c)).filter(Boolean);
  const selectDims = [`${xExpr} as ${quoteIdent(xAlias)}`, ...extraGroupColsQ].join(", ");
  const groupByExpr = [xExpr, ...extraGroupColsQ].join(", ");
  const aggItems = allMeasures.map((m) => ({
    alias: makeAggAlias(m.col, String(m.agg ?? "agg").toLowerCase()),
    expr: aggExpr(m.agg, quoteIdent(m.col)),
  }));
  const selectAggs = aggItems
    .map((m) => `${m.expr} as ${quoteIdent(m.alias)}`)
    .join(", ");

  if (vizType === "pie" || vizType === "donut" || vizType === "treemap") {
    const val = measures[0];
    const dims = groupCols.length > 0 ? groupCols : [x].filter(Boolean);
    const cat = groupBy || dims[0] || x;
    const sel = `${quoteIdent(cat)} as category, ${aggExpr(val.agg, quoteIdent(val.col))} as value`;
    const group = dims.length > 0 ? `GROUP BY ${dims.map((d) => quoteIdent(d)).join(", ")}` : "";
    return `SELECT ${topPrefix(200)}${sel} FROM ${tableKey}${whereFromMappingFilters} ${group} ORDER BY value DESC${limitClause(200)}`;
  }

  const select = `${selectDims}, ${selectAggs}`;
  const group = `GROUP BY ${groupByExpr}`;
  const mappingOrder = Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [];
  const orderParts = mappingOrder
    .map((o: any) => {
      const f = quoteIdent(String(o?.field ?? "").trim());
      if (!f) return "";
      const d = String(o?.dir ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
      return `${f} ${d}`;
    })
    .filter(Boolean);
  const order = orderParts.length
    ? `ORDER BY ${orderParts.join(", ")}`
    : (vizType === "bar" && allMeasures.length > 0
      ? `ORDER BY ${quoteIdent(aggItems[0]?.alias ?? makeAggAlias(allMeasures[0]!.col))} DESC`
      : `ORDER BY ${quoteIdent(xAlias)}`);
  const defaultLimit = (vizType === "line" || vizType === "area") ? 2000 : 500;
  return `SELECT ${topPrefix(defaultLimit)}${select} FROM ${tableKey}${whereFromMappingFilters} ${group} ${order}${limitClause(defaultLimit)}`;
}

export function resolveVizType(chartName: string): VizType {
  const n = chartName.toLowerCase();
  if (/\bline\b|line\s+chart|trend|multi.?line|rolling|period|cumulative|growth/.test(n)) return "line";
  if (/\barea\b|area\s+chart|stacked\s*area/.test(n)) return "area";
  if (/\bpie\b|pie\s+chart/.test(n)) return "pie";
  if (/\bdonut\b|donut\s+chart/.test(n)) return "donut";
  if (/\bscatter\b|scatter\s+chart|regression|correlation/.test(n)) return "scatter";
  if (/\btreemap\b|hierarchi/.test(n)) return "treemap";
  if (/\bhistogram\b|distribut|density|box\s*plot|outlier/.test(n)) return "histogram";
  if (/\bkpi\b|metric|bullet|conversion\s*rate|card/.test(n)) return "kpi";
  if (/\bpivot\b|pivot\s*table|matrix\s*table/.test(n)) return "pivot";
  if (/\btable\b|matrix|drill|filter\s*panel|field\s*list/.test(n)) return "table";
  if (/\bbar\b|\bcolumn\b|clustered\s+(bar|column)|stacked\s+(bar|column)|100%\s+stacked\s+(bar|column)|grouped|rank|top.?n|bottom.?n|side.?by|comparison|categorical|funnel/.test(n)) return "bar";
  if (/\bwaterfall\b|decompos|driver|cohort|retention|anomaly/.test(n)) return "line";
  return "auto";
}

// ── Column type detection ──
export type ColType = "date" | "number" | "string";

const DATE_NAME_RE = /date|time|timestamp|created|updated|period|day|month|year|dt$/i;
const ID_NAME_RE = /(^id$|_id$|id$)/i;

export function detectColType(rows: unknown[][], colIdx: number, colName: string): ColType {
  let numCount = 0;
  let dateCount = 0;
  let total = 0;
  for (const r of rows) {
    const v = (r as any)?.[colIdx];
    if (v == null || v === "") continue;
    total++;
    const s = String(v);
    if (!isNaN(Number(s)) && s.trim() !== "") { numCount++; continue; }
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) || /^\d{2}[-/]\d{2}[-/]\d{4}/.test(s)) { dateCount++; continue; }
    if (/^\d{10,13}$/.test(s)) { dateCount++; continue; }
    const parsed = Date.parse(s);
    if (!isNaN(parsed) && s.length > 6) { dateCount++; continue; }
  }
  if (total === 0) return "string";
  if (dateCount / total > 0.5) return "date";
  if (DATE_NAME_RE.test(colName) && numCount / total > 0.5) return "date";
  if (numCount / total > 0.6) return "number";
  return "string";
}

// ── Helpers ──
const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function fmtDate(s: string): string {
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("ru-RU", { month: "short", day: "numeric", year: "2-digit" });
  if (/^\d{10,13}$/.test(s)) {
    const ts = s.length >= 13 ? Number(s) : Number(s) * 1000;
    const d2 = new Date(ts);
    if (!isNaN(d2.getTime())) return d2.toLocaleDateString("ru-RU", { month: "short", day: "numeric", year: "2-digit" });
  }
  return s.length > 18 ? s.slice(0, 18) + "\u2026" : s;
}

function cellNum(r: unknown[], idx: number): number {
  const v = (r as any)?.[idx];
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function cellStr(r: unknown[], idx: number): string {
  const v = (r as any)?.[idx];
  return v == null ? "" : String(v);
}

// ── Axis mapping ──
export interface AxisMapping {
  xIdx: number;
  xIsDate: boolean;
  yIndices: number[];
  y2Indices: number[];
  strIndices: number[];
  numIndices: number[];
}

export function pickAxes(cols: string[], colTypes: ColType[], opts?: { mapping?: ColumnMapping | null }): AxisMapping {
  const dateIndices = colTypes.map((t, i) => t === "date" ? i : -1).filter(i => i >= 0);
  const strIndices = colTypes.map((t, i) => t === "string" ? i : -1).filter(i => i >= 0);
  const numIndices = colTypes.map((t, i) => t === "number" ? i : -1).filter(i => i >= 0);
  const nonIdNumIndices = numIndices.filter((i) => !ID_NAME_RE.test(String(cols[i] ?? "").trim()));
  const numericForY = nonIdNumIndices.length > 0 ? nonIdNumIndices : numIndices;

  let xIdx = dateIndices[0] ?? strIndices[0] ?? -1;
  let xIsDate = dateIndices.length > 0 && xIdx === dateIndices[0];

  // All-numeric fallback: use first column as X (category/ID)
  if (xIdx < 0 && numIndices.length >= 2) {
    xIdx = numIndices[0];
    xIsDate = false;
  }

  const y2Cols = Array.isArray((opts?.mapping as any)?.y2Columns)
    ? ((opts?.mapping as any).y2Columns as Array<{ col?: string }>).map((m) => String(m?.col ?? "").trim()).filter(Boolean)
    : [];
  const y2Set = new Set(y2Cols);

  const y2Indices = numericForY
    .filter((i) => i !== xIdx)
    .filter((i) => y2Set.has(String(cols[i] ?? "")))
    .slice(0, 6);
  const yIndices = numericForY
    .filter((i) => i !== xIdx)
    .filter((i) => !y2Indices.includes(i))
    .slice(0, 6);

  return { xIdx, xIsDate, yIndices, y2Indices, strIndices, numIndices };
}

// ── Main builder ──
export interface BuildChartInput {
  vizType: VizType;
  cols: string[];
  colTypes: ColType[];
  rows: unknown[][];
  axes: AxisMapping;
  mapping?: ColumnMapping | null;
}

export interface BuildChartResult {
  option: Record<string, unknown> | null;
  /** If non-null, render a KPI card instead of a chart */
  kpi: { label: string; value: string; sub?: string } | null;
}

export function buildDbChartOption(input: BuildChartInput): BuildChartResult {
  const { vizType, cols, colTypes, rows, axes, mapping } = input;
  const { xIdx, xIsDate, yIndices, y2Indices, strIndices, numIndices } = axes;

  // X labels builder
  const xLabels = rows.map(r => {
    if (xIdx < 0) return "";
    const s = cellStr(r, xIdx);
    return xIsDate ? fmtDate(s) : (s.length > 22 ? s.slice(0, 22) + "\u2026" : s);
  });

  // Shared option parts
  const baseGrid = { left: 48, right: 16, top: yIndices.length > 1 ? 32 : 12, bottom: 32, containLabel: true };
  const baseXAxis: any = {
    type: "category", data: xLabels,
    axisLabel: { fontSize: 10, color: "#94a3b8", rotate: xLabels.length > 15 ? 35 : 0 },
    axisLine: { lineStyle: { color: "#334155" } },
  };
  const baseYAxis: any = {
    type: "value",
    axisLabel: { fontSize: 10, color: "#94a3b8", formatter: (v: number) => fmtNum(v) },
    splitLine: { lineStyle: { color: "#1e293b" } },
    axisLine: { show: false },
  };
  const baseLegend = yIndices.length > 1
    ? { top: 0, textStyle: { color: "#cbd5e1", fontSize: 11 }, itemWidth: 12, itemHeight: 8 }
    : undefined;
  const baseTooltip: any = {
    trigger: "axis", confine: true,
    backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#334155",
    textStyle: { color: "#e2e8f0", fontSize: 12 },
  };

  const wrap = (opt: Record<string, unknown>): BuildChartResult => ({
    option: { backgroundColor: "transparent", color: PALETTE, ...opt },
    kpi: null,
  });

  const labelsEnabled = Boolean((mapping as any)?.showLabels);
  const stackMode = String((mapping as any)?.stackMode ?? "none").toLowerCase();
  const nullDisplay = String((mapping as any)?.nullDisplay ?? "as_zero").toLowerCase();
  const isStacked = stackMode === "stacked" || stackMode === "normalized";
  const allSeriesIndices = [...yIndices, ...y2Indices];
  const normalizedRowTotals = stackMode === "normalized"
    ? rows.map((r) => {
        const total = allSeriesIndices.reduce((sum, idx) => sum + Math.max(0, cellNum(r, idx)), 0);
        return total > 0 ? total : 0;
      })
    : [];

  const readSeriesValue = (row: unknown[], idx: number): number | null => {
    const raw = (row as any)?.[idx];
    if (raw == null || raw === "") {
      if (nullDisplay === "skip" || nullDisplay === "interpolate") return null;
      return 0;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      if (nullDisplay === "skip" || nullDisplay === "interpolate") return null;
      return 0;
    }
    return n;
  };

  const groupByRef = String((mapping as any)?.groupBy ?? "").trim();
  const groupByIdx = groupByRef ? cols.indexOf(groupByRef) : -1;
  const groupedSeries = (() => {
    if (!groupByRef || groupByIdx < 0 || xIdx < 0 || yIndices.length === 0) return null;
    const xValues: string[] = [];
    const ensureX = (label: string) => {
      if (!xValues.includes(label)) xValues.push(label);
    };
    const grouped = new Map<string, Map<string, number>>();
    const yIdx = yIndices[0] as number;
    for (const r of rows) {
      const g = cellStr(r, groupByIdx) || "(empty)";
      const xlRaw = cellStr(r, xIdx);
      const xl = xIsDate ? fmtDate(xlRaw) : (xlRaw.length > 22 ? xlRaw.slice(0, 22) + "\u2026" : xlRaw);
      ensureX(xl);
      const rowMap = grouped.get(g) ?? new Map<string, number>();
      const n = Number((r as any)?.[yIdx] ?? 0);
      rowMap.set(xl, (rowMap.get(xl) ?? 0) + (Number.isFinite(n) ? n : 0));
      grouped.set(g, rowMap);
    }
    return {
      xValues,
      series: Array.from(grouped.entries()).map(([name, points]) => ({
        name,
        data: xValues.map((xv) => points.get(xv) ?? 0),
      })),
    };
  })();

  // ── LINE ──
  if (vizType === "line" || (vizType === "auto" && xIsDate && yIndices.length > 0)) {
    if (xIdx < 0 || yIndices.length === 0) return { option: null, kpi: null };
    if (groupedSeries && groupedSeries.series.length > 0) {
      return wrap({
        tooltip: baseTooltip,
        legend: { top: 0, textStyle: { color: "#cbd5e1", fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        grid: baseGrid,
        xAxis: { ...baseXAxis, data: groupedSeries.xValues },
        yAxis: baseYAxis,
        series: groupedSeries.series.map((s) => ({
          name: s.name,
          type: "line",
          data: s.data,
          smooth: true,
          showSymbol: groupedSeries.xValues.length < 30,
          symbolSize: 4,
          lineStyle: { width: 2 },
          ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
        })),
      });
    }
    const hasY2 = y2Indices.length > 0;
    const yAxis = hasY2
      ? [
          baseYAxis,
          { ...baseYAxis, position: "right", splitLine: { show: false } },
        ]
      : baseYAxis;
    const ySeries = yIndices.map((yIdx) => ({
      name: cols[yIdx], type: "line",
      data: rows.map((r, rowIdx) => {
        const raw = readSeriesValue(r, yIdx);
        if (stackMode !== "normalized") return raw;
        const total = normalizedRowTotals[rowIdx] ?? 0;
        if (raw == null) return null;
        return total > 0 ? (raw / total) * 100 : 0;
      }),
      smooth: true, showSymbol: rows.length < 30, symbolSize: 4,
      lineStyle: { width: 2 },
      ...(nullDisplay === "interpolate" ? { connectNulls: true } : {}),
      ...(hasY2 ? { yAxisIndex: 0 } : {}),
      ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
    }));
    const y2Series = y2Indices.map((yIdx) => ({
      name: cols[yIdx], type: "line",
      data: rows.map((r, rowIdx) => {
        const raw = readSeriesValue(r, yIdx);
        if (stackMode !== "normalized") return raw;
        const total = normalizedRowTotals[rowIdx] ?? 0;
        if (raw == null) return null;
        return total > 0 ? (raw / total) * 100 : 0;
      }),
      smooth: true, showSymbol: rows.length < 30, symbolSize: 4,
      lineStyle: { width: 2, type: "dashed" },
      yAxisIndex: 1,
      ...(nullDisplay === "interpolate" ? { connectNulls: true } : {}),
      ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
    }));
    return wrap({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: baseXAxis,
      yAxis: stackMode === "normalized"
        ? { ...baseYAxis, max: 100, axisLabel: { fontSize: 10, color: "#94a3b8", formatter: (v: number) => `${Math.round(v)}%` } }
        : yAxis,
      series: [...ySeries, ...y2Series],
    });
  }

  // ── AREA ──
  if (vizType === "area") {
    if (xIdx < 0 || yIndices.length === 0) return { option: null, kpi: null };
    if (groupedSeries && groupedSeries.series.length > 0) {
      return wrap({
        tooltip: baseTooltip,
        legend: { top: 0, textStyle: { color: "#cbd5e1", fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        grid: baseGrid,
        xAxis: { ...baseXAxis, data: groupedSeries.xValues },
        yAxis: baseYAxis,
        series: groupedSeries.series.map((s) => ({
          name: s.name,
          type: "line",
          data: s.data,
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.25 },
          lineStyle: { width: 1.5 },
          ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
        })),
      });
    }
    return wrap({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: baseXAxis,
      yAxis: stackMode === "normalized"
        ? { ...baseYAxis, max: 100, axisLabel: { fontSize: 10, color: "#94a3b8", formatter: (v: number) => `${Math.round(v)}%` } }
        : baseYAxis,
      series: yIndices.map(yIdx => ({
        name: cols[yIdx], type: "line",
        data: rows.map((r, rowIdx) => {
          const raw = readSeriesValue(r, yIdx);
          if (stackMode !== "normalized") return raw;
          const total = normalizedRowTotals[rowIdx] ?? 0;
          if (raw == null) return null;
          return total > 0 ? (raw / total) * 100 : 0;
        }),
        smooth: true, showSymbol: false,
        areaStyle: { opacity: 0.25 },
        stack: isStacked && yIndices.length > 1 ? "total" : undefined,
        lineStyle: { width: 1.5 },
        ...(nullDisplay === "interpolate" ? { connectNulls: true } : {}),
        ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
      })),
    });
  }

  // ── BAR ──
  if (vizType === "bar" || (vizType === "auto" && !xIsDate && xIdx >= 0 && yIndices.length > 0)) {
    if (groupedSeries && groupedSeries.series.length > 0) {
      return wrap({
        tooltip: baseTooltip,
        legend: { top: 0, textStyle: { color: "#cbd5e1", fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
        grid: baseGrid,
        xAxis: { ...baseXAxis, data: groupedSeries.xValues },
        yAxis: baseYAxis,
        series: groupedSeries.series.map((s) => ({
          name: s.name,
          type: "bar",
          data: s.data,
          barMaxWidth: 32,
          itemStyle: { borderRadius: [6, 6, 0, 0] },
          ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
        })),
      });
    }
    const hasY2 = y2Indices.length > 0;
    const yAxis = hasY2
      ? [
          baseYAxis,
          { ...baseYAxis, position: "right", splitLine: { show: false } },
        ]
      : baseYAxis;
    const ySeries = yIndices.map((yIdx) => ({
      name: cols[yIdx], type: "bar",
      data: rows.map((r, rowIdx) => {
        const raw = readSeriesValue(r, yIdx);
        if (stackMode !== "normalized") return raw;
        const total = normalizedRowTotals[rowIdx] ?? 0;
        if (raw == null) return null;
        return total > 0 ? (raw / total) * 100 : 0;
      }),
      barMaxWidth: 32, itemStyle: { borderRadius: [6, 6, 0, 0] },
      ...(isStacked ? { stack: "total" } : {}),
      ...(hasY2 ? { yAxisIndex: 0 } : {}),
      ...(nullDisplay === "interpolate" ? { connectNulls: true } : {}),
      ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
    }));
    const y2Series = y2Indices.map((yIdx) => ({
      name: cols[yIdx], type: "bar",
      data: rows.map((r, rowIdx) => {
        const raw = readSeriesValue(r, yIdx);
        if (stackMode !== "normalized") return raw;
        const total = normalizedRowTotals[rowIdx] ?? 0;
        if (raw == null) return null;
        return total > 0 ? (raw / total) * 100 : 0;
      }),
      barMaxWidth: 32, itemStyle: { borderRadius: [6, 6, 0, 0] },
      yAxisIndex: 1,
      ...(nullDisplay === "interpolate" ? { connectNulls: true } : {}),
      ...(labelsEnabled ? { label: { show: true, position: "top", formatter: (p: any) => fmtNum(Number(p?.value ?? 0)) } } : {}),
    }));
    return wrap({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: baseXAxis,
      yAxis: stackMode === "normalized"
        ? { ...baseYAxis, max: 100, axisLabel: { fontSize: 10, color: "#94a3b8", formatter: (v: number) => `${Math.round(v)}%` } }
        : yAxis,
      series: [...ySeries, ...y2Series],
    });
  }

  // ── PIE ──
  if (vizType === "pie" || vizType === "donut") {
    const catIdx = strIndices[0] ?? xIdx;
    const valIdx = numIndices[0] ?? -1;
    if (catIdx < 0 || valIdx < 0) return { option: null, kpi: null };

    // Aggregate by category
    const agg = new Map<string, number>();
    for (const r of rows) {
      const cat = cellStr(r, catIdx) || "(empty)";
      agg.set(cat, (agg.get(cat) ?? 0) + cellNum(r, valIdx));
    }
    let pieData = Array.from(agg.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Group small slices into "Other" if >12 categories
    if (pieData.length > 12) {
      const top = pieData.slice(0, 11);
      const rest = pieData.slice(11).reduce((s, d) => s + d.value, 0);
      pieData = [...top, { name: "Other", value: rest }];
    }

    const radius: [string, string] = vizType === "donut" ? ["42%", "72%"] : ["0%", "72%"];
    return wrap({
      tooltip: { trigger: "item", confine: true, backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#334155", textStyle: { color: "#e2e8f0" }, formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#cbd5e1", fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
      series: [{
        type: "pie", radius, center: ["50%", "45%"],
        data: pieData,
        label: { show: pieData.length <= 8, color: "#cbd5e1", fontSize: 10 },
        labelLine: { lineStyle: { color: "#475569" } },
        emphasis: { itemStyle: { shadowBlur: 20, shadowColor: "rgba(0,0,0,0.5)" } },
      }],
    });
  }

  // ── SCATTER ──
  if (vizType === "scatter") {
    if (numIndices.length < 2) return { option: null, kpi: null };
    const xi = numIndices[0];
    const yi = numIndices[1];
    return wrap({
      tooltip: { trigger: "item", confine: true, backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#334155", textStyle: { color: "#e2e8f0" } },
      grid: baseGrid,
      xAxis: { type: "value", name: cols[xi], nameTextStyle: { color: "#94a3b8", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#94a3b8" }, splitLine: { lineStyle: { color: "#1e293b" } } },
      yAxis: { type: "value", name: cols[yi], nameTextStyle: { color: "#94a3b8", fontSize: 10 }, axisLabel: { fontSize: 10, color: "#94a3b8" }, splitLine: { lineStyle: { color: "#1e293b" } } },
      series: [{
        type: "scatter", symbolSize: 8,
        data: rows.map(r => [cellNum(r, xi), cellNum(r, yi)]),
        itemStyle: { opacity: 0.7 },
      }],
    });
  }

  // ── TREEMAP ──
  if (vizType === "treemap") {
    const catIdx = strIndices[0] ?? xIdx;
    const valIdx = numIndices[0] ?? -1;
    if (catIdx < 0 || valIdx < 0) return { option: null, kpi: null };
    const agg = new Map<string, number>();
    for (const r of rows) {
      const cat = cellStr(r, catIdx) || "(empty)";
      agg.set(cat, (agg.get(cat) ?? 0) + Math.abs(cellNum(r, valIdx)));
    }
    const treeData = Array.from(agg.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);
    return wrap({
      tooltip: { confine: true, backgroundColor: "rgba(15,23,42,0.95)", borderColor: "#334155", textStyle: { color: "#e2e8f0" } },
      series: [{
        type: "treemap", data: treeData, roam: false,
        label: { show: true, color: "#fff", fontSize: 11 },
        breadcrumb: { show: false },
        itemStyle: { borderColor: "#0f172a", borderWidth: 2, gapWidth: 2 },
        levels: [{ colorSaturation: [0.3, 0.7], itemStyle: { borderColorSaturation: 0.5 } }],
      }],
    });
  }

  // ── HISTOGRAM ──
  if (vizType === "histogram") {
    const valIdx = numIndices[0] ?? -1;
    if (valIdx < 0) return { option: null, kpi: null };
    const values = rows.map(r => cellNum(r, valIdx)).filter(v => isFinite(v));
    if (values.length === 0) return { option: null, kpi: null };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const binWidth = (max - min) / binCount || 1;
    const bins = Array.from({ length: binCount }, (_, i) => ({ lo: min + i * binWidth, hi: min + (i + 1) * binWidth, count: 0 }));
    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
      bins[idx].count++;
    }
    return wrap({
      tooltip: { ...baseTooltip, trigger: "axis" },
      grid: baseGrid,
      xAxis: { type: "category", data: bins.map(b => fmtNum(b.lo)), axisLabel: { fontSize: 10, color: "#94a3b8", rotate: 30 }, axisLine: { lineStyle: { color: "#334155" } } },
      yAxis: baseYAxis,
      series: [{ name: cols[valIdx], type: "bar", data: bins.map(b => b.count), barWidth: "90%", itemStyle: { borderRadius: [4, 4, 0, 0] } }],
    });
  }

  // ── KPI ──
  if (vizType === "kpi") {
    const valIdx = numIndices[0] ?? -1;
    if (valIdx < 0) return { option: null, kpi: { label: cols[0] ?? "Value", value: "N/A" } };
    const sum = rows.reduce((s, r) => s + cellNum(r, valIdx), 0);
    const avg = rows.length > 0 ? sum / rows.length : 0;
    return {
      option: null,
      kpi: {
        label: cols[valIdx],
        value: fmtNum(sum),
        sub: `avg ${fmtNum(avg)} \u00b7 ${rows.length} rows`,
      },
    };
  }

  // ── TABLE ──
  if (vizType === "table") {
    return { option: null, kpi: null };
  }

  // ── AUTO fallback: try bar if we have X + Y, else null ──
  if (xIdx >= 0 && yIndices.length > 0) {
    return wrap({
      tooltip: baseTooltip, legend: baseLegend, grid: baseGrid,
      xAxis: baseXAxis, yAxis: baseYAxis,
      series: yIndices.map(yIdx => ({
        name: cols[yIdx], type: "bar",
        data: rows.map(r => cellNum(r, yIdx)),
        barMaxWidth: 32, itemStyle: { borderRadius: [6, 6, 0, 0] },
      })),
    });
  }

  return { option: null, kpi: null };
}
