import { sqlStringLiteral } from "../propertyFilterUtils";
import type { GlobalFilterContextV1, LogicalFilter, LogicalQuery, SemanticModelV1 } from "./types";
import type { CalculatedFieldDef } from "./types";
import { normalizeAggFn } from "./fieldClassifier";
import { buildRollingAvg, buildWindowAgg, wrapWithWindowLayer } from "./windowBuilder";
import { getFormulaFunctionByName } from "./formulaRegistry";
import type { SqlDialect, SemanticFieldType } from "./types";

type CompiledQuery = {
  sql: string;
  connectionId: string;
  connectionType?: string;
  debug?: {
    mergedFilters: LogicalFilter[];
    filterPlacement?: {
      where: LogicalFilter[];
      having: LogicalFilter[];
    };
    pagination?: {
      limit: number;
      offset: number;
    };
  };
};

type FieldValueType = SemanticFieldType | "unknown";

export function scopeBiFiltersForRequest(
  global: GlobalFilterContextV1 | null | undefined,
  requestContext?: { chartId?: string; pageKey?: string } | null
): any[] {
  if (!global || typeof global !== "object") return [];
  const raw = Array.isArray((global as any).filters) ? (global as any).filters : [];
  const ctxChartId = String(requestContext?.chartId ?? "").trim();
  const ctxPageKey = String(requestContext?.pageKey ?? "").trim();

  // Back-compat mode: if no context provided, include all global filters (old behavior).
  if (!ctxChartId && !ctxPageKey) {
    return raw;
  }

  return raw.filter((f: any) => {
    const sc = (f?.scope === "report" || f?.scope === "page" || f?.scope === "visual") ? f.scope : "visual";
    if (sc === "report") return true;
    if (sc === "page") return !!ctxPageKey && String(f?.pageKey ?? "") === ctxPageKey;
    // visual
    return !!ctxChartId && String(f?.sourceChartId ?? "") === ctxChartId;
  });
}

function safeIdent(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("Empty identifier");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) {
    throw new Error(`Unsafe identifier: ${s}`);
  }
  return s;
}

function splitRef(ref: string): { model: string; field: string } {
  const s = String(ref ?? "").trim();
  const idx = s.indexOf(".");
  if (idx <= 0 || idx === s.length - 1) throw new Error(`Invalid ref: ${s}`);
  return { model: s.slice(0, idx), field: s.slice(idx + 1) };
}

function isAliasSafeExpr(expr: string, modelName: string): boolean {
  const s = String(expr ?? "").trim();
  if (!s) return false;
  if (s.includes("{{alias}}")) return true;
  // Legacy-safe: explicit model prefix inside expression.
  if (s.includes(`${modelName}.`)) return true;
  return false;
}

function extractRefsFromSql(sql: string): string[] {
  const s = String(sql ?? "");
  const res: string[] = [];
  const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    res.push(`${m[1]}.${m[2]}`);
  }
  return res;
}

type JoinEdge = {
  fromModel: string;
  toModel: string;
  joinModel: string;
  joinName: string;
};

function buildJoinEdges(semanticModel: SemanticModelV1): JoinEdge[] {
  const edges: JoinEdge[] = [];
  const models = (semanticModel as any)?.models;
  if (!models || typeof models !== "object") return edges;

  for (const [fromModel, m] of Object.entries(models as any)) {
    const joins = (m as any)?.joins;
    if (!joins || typeof joins !== "object") continue;
    for (const [joinName, j] of Object.entries(joins as any)) {
      const toModel = String((j as any)?.toModel ?? "").trim();
      if (!toModel) continue;
      const active = (j as any)?.active;
      // Power BI-like: inactive relationships exist but are not used for automatic query paths.
      if (active === false) continue;
      const joinModel = String(fromModel);
      const jn = String(joinName);
      edges.push({ fromModel: joinModel, toModel, joinModel, joinName: jn });

      // Power BI-like: bidirectional cross-filtering. We need path-finding to work both ways.
      // Important: the join definition still lives in `joinModel.joins[joinName]`.
      const dir = String((j as any)?.direction ?? "single").trim();
      if (dir === "both") {
        edges.push({ fromModel: toModel, toModel: joinModel, joinModel, joinName: jn });
      }
    }
  }

  return edges;
}

function findJoinPath(
  edges: JoinEdge[],
  from: string,
  to: string
): JoinEdge[] | null {
  if (from === to) return [];
  const q: string[] = [from];
  const prev = new Map<string, { via: JoinEdge; prevModel: string }>();
  const dist = new Map<string, number>();
  dist.set(from, 0);
  const numShortestPaths = new Map<string, number>();
  numShortestPaths.set(from, 1);
  let ambiguous = false;
  const visited = new Set<string>([from]);

  while (q.length) {
    const cur = q.shift() as string;
    const curDist = dist.get(cur) ?? 0;
    for (const e of edges) {
      if (e.fromModel !== cur) continue;

      const next = e.toModel;
      const seenDist = dist.get(next);
      const candidateDist = curDist + 1;
      if (seenDist == null) {
        dist.set(next, candidateDist);
        numShortestPaths.set(next, numShortestPaths.get(cur) ?? 1);
        prev.set(next, { via: e, prevModel: cur });
        visited.add(next);
        q.push(next);
        continue;
      }

      // Another shortest path to the same node.
      if (seenDist === candidateDist) {
        const prevCount = numShortestPaths.get(next) ?? 1;
        numShortestPaths.set(next, prevCount + (numShortestPaths.get(cur) ?? 1));
        if (next === to) ambiguous = true;
      }
    }
  }

  if (!visited.has(to)) return null;
  if (ambiguous) {
    throw new Error(`Ambiguous join path from ${from} to ${to}. Add/adjust relationships (active/direction) to make the path unique.`);
  }

  const path: JoinEdge[] = [];
  let m = to;
  while (m !== from) {
    const p = prev.get(m);
    if (!p) break;
    path.push(p.via);
    m = p.prevModel;
  }
  path.reverse();
  return path;
}

function isLogicalOp(op: unknown): op is LogicalFilter["op"] {
  return (
    op === "eq" ||
    op === "neq" ||
    op === "in" ||
    op === "not_in" ||
    op === "between" ||
    op === "not_between" ||
    op === "gt" ||
    op === "gte" ||
    op === "lt" ||
    op === "lte" ||
    op === "contains" ||
    op === "icontains" ||
    op === "notcontains" ||
    op === "noticontains" ||
    op === "startswith" ||
    op === "istartswith" ||
    op === "endswith" ||
    op === "iendswith" ||
    op === "isnull" ||
    op === "isnotnull"
  );
}

function normalizeFilters(filters: Array<LogicalFilter | any> | undefined | null): LogicalFilter[] {
  if (!Array.isArray(filters)) return [];
  return filters
    .map((f) => ({
      field: String(f?.field ?? "").trim(),
      op: f?.op,
      values: Array.isArray(f?.values) ? f.values : (f?.values != null ? [f.values] : []),
    }))
    .filter((f) => !!f.field && isLogicalOp(f.op))
    .map((f) => ({ field: f.field, op: f.op, values: f.values }));
}

function mergeGlobalFiltersForRequest(
  global: GlobalFilterContextV1 | null | undefined,
  requestContext?: { chartId?: string; pageKey?: string } | null
): LogicalFilter[] {
  if (!global || typeof global !== "object") return [];
  const raw = scopeBiFiltersForRequest(global, requestContext);
  const ctxChartId = String(requestContext?.chartId ?? "").trim();
  const ctxPageKey = String(requestContext?.pageKey ?? "").trim();

  // Back-compat mode: if no context provided, include all global filters (old behavior).
  if (!ctxChartId && !ctxPageKey) {
    return normalizeFilters(raw);
  }

  return normalizeFilters(raw);
}

export function mergeFilters(
  local: LogicalFilter[] | undefined,
  global: GlobalFilterContextV1 | null | undefined,
  requestContext?: { chartId?: string; pageKey?: string } | null
): LogicalFilter[] {
  const a = normalizeFilters(local);
  const b = mergeGlobalFiltersForRequest(global, requestContext);
  return [...b, ...a];
}

export function renderWhere(
  filters: LogicalFilter[],
  fieldSqlByRef: (ref: string) => string,
  dialect: SqlDialect,
  valueTypeByRef?: (ref: string) => FieldValueType
): string {
  const clauses: string[] = [];

  const toLiteral = (value: unknown, type: FieldValueType): string => {
    if (value == null) return "NULL";
    if (type === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) return String(n);
    }
    if (type === "boolean") {
      const b = typeof value === "boolean" ? value : String(value).trim().toLowerCase();
      const isTrue = b === true || b === "true" || b === "1" || b === "yes";
      if (dialect === "mssql") return isTrue ? "1" : "0";
      return isTrue ? "true" : "false";
    }
    if (type === "time") {
      if (dialect === "clickhouse") return `toDateTime(${sqlStringLiteral(String(value))})`;
      if (dialect === "mssql") return `CAST(${sqlStringLiteral(String(value))} AS DATETIME2)`;
      return `CAST(${sqlStringLiteral(String(value))} AS TIMESTAMP)`;
    }
    return sqlStringLiteral(String(value));
  };

  const renderLike = (fieldSql: string, pattern: string, insensitive: boolean): string => {
    if (dialect === "clickhouse") {
      if (insensitive) return `lowerUTF8(toString(${fieldSql})) LIKE lowerUTF8(${sqlStringLiteral(pattern)})`;
      return `toString(${fieldSql}) LIKE ${sqlStringLiteral(pattern)}`;
    }
    if (dialect === "mssql") {
      if (insensitive) return `LOWER(CAST(${fieldSql} AS NVARCHAR(MAX))) LIKE LOWER(${sqlStringLiteral(pattern)})`;
      return `CAST(${fieldSql} AS NVARCHAR(MAX)) LIKE ${sqlStringLiteral(pattern)}`;
    }
    if (insensitive) return `${fieldSql} ILIKE ${sqlStringLiteral(pattern)}`;
    return `${fieldSql} LIKE ${sqlStringLiteral(pattern)}`;
  };

  for (const f of filters) {
    const op = String(f.op);
    const values = Array.isArray(f.values) ? f.values : [];
    const fieldSql = fieldSqlByRef(f.field);
    const valueType = valueTypeByRef ? valueTypeByRef(f.field) : "unknown";

    if (op === "eq") {
      clauses.push(`${fieldSql} = ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "neq") {
      clauses.push(`${fieldSql} != ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "gt") {
      clauses.push(`${fieldSql} > ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "gte") {
      clauses.push(`${fieldSql} >= ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "lt") {
      clauses.push(`${fieldSql} < ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "lte") {
      clauses.push(`${fieldSql} <= ${toLiteral(values[0], valueType)}`);
      continue;
    }
    if (op === "contains") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `%${v}%`, true));
      continue;
    }
    if (op === "icontains") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `%${v}%`, true));
      continue;
    }
    if (op === "notcontains") {
      const v = String(values[0] ?? "");
      clauses.push(`NOT (${renderLike(fieldSql, `%${v}%`, true)})`);
      continue;
    }
    if (op === "noticontains") {
      const v = String(values[0] ?? "");
      clauses.push(`NOT (${renderLike(fieldSql, `%${v}%`, true)})`);
      continue;
    }
    if (op === "startswith") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `${v}%`, false));
      continue;
    }
    if (op === "istartswith") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `${v}%`, true));
      continue;
    }
    if (op === "endswith") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `%${v}`, false));
      continue;
    }
    if (op === "iendswith") {
      const v = String(values[0] ?? "");
      clauses.push(renderLike(fieldSql, `%${v}`, true));
      continue;
    }
    if (op === "isnull") {
      clauses.push(`${fieldSql} IS NULL`);
      continue;
    }
    if (op === "isnotnull") {
      clauses.push(`${fieldSql} IS NOT NULL`);
      continue;
    }
    if (op === "in") {
      const lits = values.map((v) => toLiteral(v, valueType)).join(", ");
      clauses.push(`${fieldSql} IN (${lits || "NULL"})`);
      continue;
    }
    if (op === "not_in") {
      const lits = values.map((v) => toLiteral(v, valueType)).join(", ");
      clauses.push(`${fieldSql} NOT IN (${lits || "NULL"})`);
      continue;
    }
    if (op === "between") {
      clauses.push(`${fieldSql} BETWEEN ${toLiteral(values[0], valueType)} AND ${toLiteral(values[1], valueType)}`);
      continue;
    }
    if (op === "not_between") {
      clauses.push(`${fieldSql} NOT BETWEEN ${toLiteral(values[0], valueType)} AND ${toLiteral(values[1], valueType)}`);
      continue;
    }

    throw new Error(`Unsupported filter op: ${op}`);
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function renderFilterCondition(
  filters: LogicalFilter[],
  fieldSqlByRef: (ref: string) => string,
  dialect: SqlDialect,
  valueTypeByRef?: (ref: string) => FieldValueType
): string {
  const where = renderWhere(filters, fieldSqlByRef, dialect, valueTypeByRef);
  const trimmed = String(where ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.toUpperCase().startsWith("WHERE ")) {
    return trimmed.slice("WHERE ".length);
  }
  return trimmed;
}

function wrapAggWithCondition(
  type: string,
  expr: string,
  condSql: string,
  dialect: SqlDialect
): string {
  const cond = String(condSql ?? "").trim();
  if (!cond) return aggExpr(type, expr);

  if (dialect === "clickhouse") {
    if (type === "sum") return `sumIf(${expr}, ${cond})`;
    if (type === "count") return `countIf(${cond})`;
    if (type === "countDistinct") return `uniqExactIf(${expr}, ${cond})`;
    if (type === "avg") return `avgIf(${expr}, ${cond})`;
    if (type === "min") return `minIf(${expr}, ${cond})`;
    if (type === "max") return `maxIf(${expr}, ${cond})`;
    return aggExpr(type, `if(${cond}, ${expr}, NULL)`);
  }

  if (type === "sum") return `SUM(CASE WHEN ${cond} THEN ${expr} ELSE 0 END)`;
  if (type === "count") return `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`;
  if (type === "countDistinct") return `COUNT(DISTINCT CASE WHEN ${cond} THEN ${expr} ELSE NULL END)`;
  if (type === "avg") return `AVG(CASE WHEN ${cond} THEN ${expr} ELSE NULL END)`;
  if (type === "min") return `MIN(CASE WHEN ${cond} THEN ${expr} ELSE NULL END)`;
  if (type === "max") return `MAX(CASE WHEN ${cond} THEN ${expr} ELSE NULL END)`;
  return aggExpr(type, `CASE WHEN ${cond} THEN ${expr} ELSE NULL END`);
}

export type CalcToken =
  | { type: "number"; value: string; start: number; end: number }
  | { type: "string"; value: string; start: number; end: number }
  | { type: "ident"; value: string; start: number; end: number }
  | { type: "param"; value: string; start: number; end: number }
  | { type: "op"; value: "+" | "-" | "*" | "/"; start: number; end: number }
  | { type: "comma"; start: number; end: number }
  | { type: "lparen"; start: number; end: number }
  | { type: "rparen"; start: number; end: number }
  | { type: "error"; value: string; start: number; end: number };

function isIdentStart(ch: string): boolean {
  return /^[a-zA-Z_]$/.test(ch);
}

function isIdentChar(ch: string): boolean {
  return /^[a-zA-Z0-9_]$/.test(ch);
}

export function tokenizeCalcExpr(inputRaw: string): CalcToken[] {
  const input = String(inputRaw ?? "");
  const tokens: CalcToken[] = [];
  let i = 0;

  const peek = () => input[i] ?? "";
  const next = () => input[i + 1] ?? "";
  const eat = () => input[i++] as string;
  const skipWs = () => {
    while (i < input.length && /\s/.test(peek())) i++;
  };

  while (i < input.length) {
    skipWs();
    if (i >= input.length) break;
    const ch = peek();

    if (ch === "(" ) {
      const start = i;
      eat();
      tokens.push({ type: "lparen", start, end: i });
      continue;
    }
    if (ch === ")") {
      const start = i;
      eat();
      tokens.push({ type: "rparen", start, end: i });
      continue;
    }
    if (ch === ",") {
      const start = i;
      eat();
      tokens.push({ type: "comma", start, end: i });
      continue;
    }
    if ((ch === "!" || ch === "<" || ch === ">") && next() === "=") {
      const start = i;
      const op = `${eat()}${eat()}`;
      tokens.push({ type: "op", value: op as any, start, end: i });
      continue;
    }
    if (ch === "=" || ch === "<" || ch === ">") {
      const start = i;
      eat();
      tokens.push({ type: "op", value: ch as any, start, end: i });
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      const start = i;
      eat();
      tokens.push({ type: "op", value: ch as any, start, end: i });
      continue;
    }

    if (ch === "@") {
      const atStart = i;
      eat();
      const start = i;
      if (!isIdentStart(peek())) throw new Error("Invalid parameter reference");
      while (i < input.length && isIdentChar(peek())) i++;
      const name = input.slice(start, i);
      tokens.push({ type: "param", value: name, start: atStart, end: i });
      continue;
    }

    if (ch === "\"" || ch === "'") {
      const start = i;
      const quote = eat();
      let s = "";
      while (i < input.length) {
        const c = eat();
        if (c === quote) break;
        if (c === "\\" && i < input.length) {
          const esc = eat();
          s += esc;
          continue;
        }
        s += c;
      }
      tokens.push({ type: "string", value: s, start, end: i });
      continue;
    }

    if (/\d/.test(ch) || (ch === "." && /\d/.test(next()))) {
      const start = i;
      if (ch === ".") eat();
      while (i < input.length && /\d/.test(peek())) i++;
      if (peek() === ".") {
        eat();
        while (i < input.length && /\d/.test(peek())) i++;
      }
      const num = input.slice(start, i);
      tokens.push({ type: "number", value: num, start, end: i });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      eat();
      while (i < input.length && isIdentChar(peek())) i++;
      // Support qualified refs like Model.field — merge the dot and following ident.
      if (peek() === "." && i + 1 < input.length && isIdentStart(input[i + 1]!)) {
        eat(); // consume '.'
        while (i < input.length && isIdentChar(peek())) i++;
      }
      const name = input.slice(start, i);
      const kw = name.toUpperCase();
      if (kw === "AND" || kw === "OR" || kw === "NOT") {
        tokens.push({ type: "op", value: kw as any, start, end: i });
        continue;
      }
      tokens.push({ type: "ident", value: name, start, end: i });
      continue;
    }

    // Unknown character (Cyrillic, '.', '%', '=', etc.) — emit error token instead of throwing.
    {
      const start = i;
      eat();
      tokens.push({ type: "error", value: ch, start, end: i });
    }
  }

  return tokens;
}

export type CalcAst =
  | { kind: "number"; value: string; span: { start: number; end: number } }
  | { kind: "string"; value: string; span: { start: number; end: number } }
  | { kind: "ref"; name: string; span: { start: number; end: number } }
  | { kind: "param"; name: string; span: { start: number; end: number } }
  | { kind: "unary"; op: "NOT"; expr: CalcAst; span: { start: number; end: number } }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "AND" | "OR"; left: CalcAst; right: CalcAst; span: { start: number; end: number } }
  | { kind: "call"; fn: string; args: CalcAst[]; span: { start: number; end: number } };

export type CalcParseError = {
  message: string;
  span: { start: number; end: number };
};

type CalcParseMode = "strict" | "tolerant";

function tokenSpan(t: CalcToken | undefined, fallbackEnd: number): { start: number; end: number } {
  if (t) return { start: t.start, end: t.end };
  return { start: fallbackEnd, end: fallbackEnd };
}

function spanCover(a: { start: number; end: number }, b: { start: number; end: number }): { start: number; end: number } {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

export function parseCalcExprWithDiagnostics(tokens: CalcToken[], opts?: { mode?: CalcParseMode }): {
  ast: CalcAst | null;
  errors: CalcParseError[];
  recovered: boolean;
} {
  const mode: CalcParseMode = (opts?.mode === "tolerant") ? "tolerant" : "strict";
  const errors: CalcParseError[] = [];
  let recovered = false;

  let pos = 0;
  const cur = () => tokens[pos];
  const eat = () => tokens[pos++];
  const lastEnd = () => {
    const prev = tokens[pos - 1];
    return prev ? prev.end : 0;
  };

  const report = (message: string, t?: CalcToken) => {
    errors.push({ message, span: tokenSpan(t ?? cur(), lastEnd()) });
  };

  const expect = (t: CalcToken["type"]) => {
    const c = cur();
    if (!c || c.type !== t) {
      report(`Expected ${t}`, c);
      recovered = true;
      if (mode === "strict") throw new Error(`Expected ${t}`);
      return null;
    }
    return eat();
  };

  const recoverUntil = (types: Array<CalcToken["type"]>) => {
    while (cur() && !types.includes(cur()!.type)) eat();
  };

  const isIdentKeyword = (t: CalcToken | undefined, kw: string): boolean => {
    return !!t && t.type === "ident" && String((t as any).value ?? "").toUpperCase() === kw;
  };

  const expectKeyword = (kw: string): CalcToken | null => {
    const c = cur();
    if (!isIdentKeyword(c, kw)) {
      report(`Expected ${kw}`, c);
      recovered = true;
      if (mode === "strict") throw new Error(`Expected ${kw}`);
      return null;
    }
    return eat();
  };

  const parsePrimary = (): CalcAst | null => {
    const t = cur();
    if (!t) {
      report("Unexpected end of expression", undefined);
      recovered = true;
      if (mode === "strict") throw new Error("Unexpected end of expression");
      return null;
    }
    if (t.type === "number") {
      eat();
      return { kind: "number", value: t.value, span: { start: t.start, end: t.end } };
    }
    if (t.type === "string") {
      eat();
      return { kind: "string", value: t.value, span: { start: t.start, end: t.end } };
    }
    if (t.type === "param") {
      eat();
      return { kind: "param", name: t.value, span: { start: t.start, end: t.end } };
    }
    if (t.type === "ident") {
      const name = t.value;
      const nameTok = eat();
      const kw = String(name ?? "").toUpperCase();

      if (kw === "CASE") {
        const ifArgs: CalcAst[] = [];

        // CASE <expr>? WHEN ... THEN ... [ELSE ...] END
        // Lowering strategy:
        // - searched CASE -> IF(cond1, then1, cond2, then2, ..., else)
        // - simple CASE x WHEN v1 THEN r1 ... -> IF(x=v1, r1, x=v2, r2, ..., else)
        let baseExpr: CalcAst | null = null;
        if (!isIdentKeyword(cur(), "WHEN")) {
          baseExpr = parseExpr();
        }

        while (isIdentKeyword(cur(), "WHEN")) {
          eat(); // WHEN
          const whenExpr = parseExpr();
          if (!whenExpr) break;
          const _thenTok = expectKeyword("THEN");
          const thenExpr = parseExpr();
          if (!thenExpr) break;

          const cond: CalcAst = baseExpr
            ? {
                kind: "bin",
                op: "=",
                left: baseExpr,
                right: whenExpr,
                span: spanCover(baseExpr.span, whenExpr.span),
              }
            : whenExpr;
          ifArgs.push(cond, thenExpr);

          if (!_thenTok && mode === "tolerant") {
            recovered = true;
          }
        }

        if (isIdentKeyword(cur(), "ELSE")) {
          eat(); // ELSE
          const elseExpr = parseExpr();
          if (elseExpr) ifArgs.push(elseExpr);
        }

        const endTok = expectKeyword("END");
        const endSpan = endTok ? { start: endTok.start, end: endTok.end } : { start: nameTok.start, end: nameTok.end };
        return {
          kind: "call",
          fn: "IF",
          args: ifArgs,
          span: spanCover({ start: nameTok.start, end: nameTok.end }, endSpan),
        };
      }

      const l = cur();
      if (l && l.type === "lparen") {
        const lTok = eat();
        const args: CalcAst[] = [];
        if (cur() && cur()!.type !== "rparen") {
          while (true) {
            const a = parseExpr();
            if (a) args.push(a);
            if (cur() && cur()!.type === "comma") {
              eat();
              continue;
            }
            break;
          }
        }
        const rTok = expect("rparen");
        if (!rTok && mode === "tolerant") {
          recovered = true;
          recoverUntil(["rparen"]);
          if (cur() && cur()!.type === "rparen") eat();
        }
        const endTok = (rTok ?? cur() ?? lTok) as any;
        return {
          kind: "call",
          fn: name,
          args,
          span: spanCover({ start: nameTok.start, end: nameTok.end }, tokenSpan(endTok, lastEnd())),
        };
      }
      return { kind: "ref", name, span: { start: nameTok.start, end: nameTok.end } };
    }
    if (t.type === "op" && t.value === "-") {
      const opTok = eat();
      const right = parsePrimary();
      if (!right) return null;
      return {
        kind: "bin",
        op: "*",
        left: { kind: "number", value: "-1", span: { start: opTok.start, end: opTok.end } },
        right,
        span: spanCover({ start: opTok.start, end: opTok.end }, right.span),
      };
    }
    if (t.type === "op" && String(t.value ?? "").toUpperCase() === "NOT") {
      const opTok = eat();
      const right = parsePrimary();
      if (!right) return null;
      return {
        kind: "unary",
        op: "NOT",
        expr: right,
        span: spanCover({ start: opTok.start, end: opTok.end }, right.span),
      };
    }
    if (t.type === "lparen") {
      const lTok = eat();
      const e = parseExpr();
      const rTok = expect("rparen");
      if (!rTok && mode === "tolerant") {
        recovered = true;
        recoverUntil(["rparen"]);
        if (cur() && cur()!.type === "rparen") eat();
      }
      if (!e) return null;
      const endSpan = rTok ? { start: rTok.start, end: rTok.end } : { start: lTok.start, end: lTok.end };
      return { ...e, span: spanCover({ start: lTok.start, end: lTok.end }, endSpan) };
    }

    if (t.type === "error") {
      const ch = (t as any).value as string;
      report(`Unexpected character in expression: '${ch}' (character code ${ch.charCodeAt(0)})`, t);
      recovered = true;
      if (mode === "strict") throw new Error(`Unexpected character in expression: '${ch}'`);
      eat();
      return null;
    }

    report("Unexpected token", t);
    recovered = true;
    if (mode === "strict") throw new Error("Unexpected token");
    eat();
    return null;
  };

  const parseMulDiv = (): CalcAst | null => {
    let node = parsePrimary();
    while (cur() && cur()!.type === "op" && (cur() as any).value && (((cur() as any).value === "*") || ((cur() as any).value === "/"))) {
      const opTok = eat() as any;
      const right = parsePrimary();
      if (!node || !right) {
        if (mode === "strict") return null;
        if (!right) {
          report("Missing right operand", opTok);
          recovered = true;
          recoverUntil(["comma", "rparen"]);
          break;
        }
      }
      if (node && right) {
        node = { kind: "bin", op: opTok.value as "*" | "/", left: node, right, span: spanCover(node.span, right.span) };
      }
    }
    return node;
  };

  const parseAddSub = (): CalcAst | null => {
    let node = parseMulDiv();
    while (cur() && cur()!.type === "op" && (cur() as any).value && (((cur() as any).value === "+") || ((cur() as any).value === "-"))) {
      const opTok = eat() as any;
      const right = parseMulDiv();
      if (!node || !right) {
        if (mode === "strict") return null;
        if (!right) {
          report("Missing right operand", opTok);
          recovered = true;
          recoverUntil(["comma", "rparen"]);
          break;
        }
      }
      if (node && right) {
        node = { kind: "bin", op: opTok.value as "+" | "-", left: node, right, span: spanCover(node.span, right.span) };
      }
    }
    return node;
  };

  const parseCompare = (): CalcAst | null => {
    let node = parseAddSub();
    while (cur() && cur()!.type === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(String((cur() as any).value ?? ""))) {
      const opTok = eat() as any;
      const right = parseAddSub();
      if (!node || !right) {
        if (mode === "strict") return null;
        if (!right) {
          report("Missing right operand", opTok);
          recovered = true;
          recoverUntil(["comma", "rparen"]);
          break;
        }
      }
      if (node && right) {
        node = { kind: "bin", op: opTok.value as "=" | "!=" | "<" | "<=" | ">" | ">=", left: node, right, span: spanCover(node.span, right.span) };
      }
    }
    return node;
  };

  const parseAnd = (): CalcAst | null => {
    let node = parseCompare();
    while (cur() && cur()!.type === "op" && String((cur() as any).value ?? "").toUpperCase() === "AND") {
      const opTok = eat() as any;
      const right = parseCompare();
      if (!node || !right) {
        if (mode === "strict") return null;
        if (!right) {
          report("Missing right operand", opTok);
          recovered = true;
          recoverUntil(["comma", "rparen"]);
          break;
        }
      }
      if (node && right) {
        node = { kind: "bin", op: "AND", left: node, right, span: spanCover(node.span, right.span) };
      }
    }
    return node;
  };

  const parseExpr = (): CalcAst | null => {
    let node = parseAnd();
    while (cur() && cur()!.type === "op" && String((cur() as any).value ?? "").toUpperCase() === "OR") {
      const opTok = eat() as any;
      const right = parseAnd();
      if (!node || !right) {
        if (mode === "strict") return null;
        if (!right) {
          report("Missing right operand", opTok);
          recovered = true;
          recoverUntil(["comma", "rparen"]);
          break;
        }
      }
      if (node && right) {
        node = { kind: "bin", op: "OR", left: node, right, span: spanCover(node.span, right.span) };
      }
    }
    return node;
  };

  let ast: CalcAst | null = null;
  try {
    ast = parseExpr();
    if (mode === "strict") {
      if (pos !== tokens.length) throw new Error("Unexpected trailing tokens");
    } else {
      if (pos !== tokens.length) {
        report("Unexpected trailing tokens", cur());
        recovered = true;
      }
    }
  } catch (e: any) {
    if (mode === "tolerant") {
      const msg = e instanceof Error ? e.message : "Parse error";
      report(msg, cur());
      recovered = true;
    } else {
      throw e;
    }
  }

  return { ast, errors, recovered };
}

export function parseCalcExpr(tokens: CalcToken[]): CalcAst {
  const res = parseCalcExprWithDiagnostics(tokens, { mode: "strict" });
  if (!res.ast) throw new Error(res.errors[0]?.message ?? "Parse error");
  if (res.errors.length) throw new Error(res.errors[0]!.message);
  return res.ast;
}

export function compileCalcAstToSql(
  ast: CalcAst,
  opts: { measureAliasByName: Map<string, string>; params?: Record<string, any>; dialect: SqlDialect; missingParams?: string[] }
): string {
  const { measureAliasByName, params, dialect } = opts;

  const rec = (n: CalcAst): string => {
    if (n.kind === "number") return String(n.value);
    if (n.kind === "string") return sqlStringLiteral(String(n.value));
    if (n.kind === "param") {
      const v = params ? (params as any)[String(n.name ?? "").toLowerCase()] : undefined;
      if (v == null) {
        try {
          opts.missingParams?.push(String(n.name ?? ""));
        } catch {}
        return "NULL";
      }
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
      if (typeof v === "boolean") return v ? "true" : "false";
      return sqlStringLiteral(String(v));
    }
    if (n.kind === "ref") {
      const raw = String(n.name ?? "").trim();
      const alias = measureAliasByName.get(raw);
      if (alias) return alias;
      // Back-compat: allow unqualified refs in expressions when unambiguous.
      // Prefer `Model.measure` to avoid collisions.
      const matches: string[] = [];
      for (const [k, v] of measureAliasByName.entries()) {
        if (k.split(".").pop() === raw) matches.push(v);
      }
      if (matches.length === 1) return matches[0] as string;
      throw new Error(
        matches.length
          ? `Ambiguous measure reference in expression: ${raw}. Use fully-qualified ref 'Model.${raw}'.`
          : `Unknown measure reference in expression: ${raw}`
      );
    }
    if (n.kind === "bin") {
      const l = rec(n.left);
      const r = rec(n.right);
      return `(${l} ${n.op} ${r})`;
    }
    if (n.kind === "unary") {
      const e = rec(n.expr);
      if (n.op === "NOT") return `(NOT ${e})`;
      throw new Error("Unsupported unary expression");
    }
    if (n.kind === "call") {
      const fnDef = getFormulaFunctionByName(String(n.fn ?? ""));
      if (!fnDef) throw new Error(`Unsupported function: ${String(n.fn ?? "")}`);
      const args = n.args.map(rec);
      return fnDef.compile(args, dialect);
    }
    throw new Error("Unsupported expression");
  };

  return rec(ast);
}

function aggExpr(type: string, expr: string): string {
  const t = String(type).toLowerCase();
  if (t === "sum") return `SUM(${expr})`;
  if (t === "avg") return `AVG(${expr})`;
  if (t === "count") return expr === "*" ? "COUNT(*)" : `COUNT(${expr})`;
  if (t === "countdistinct") return `COUNT(DISTINCT ${expr})`;
  if (t === "min") return `MIN(${expr})`;
  if (t === "max") return `MAX(${expr})`;
  throw new Error(`Unsupported measure type: ${type}`);
}

function compileExpression(
  def: CalculatedFieldDef,
  opts: {
    dialect: SqlDialect;
    fieldSqlByRef: (ref: string) => string;
    dimSqlByRef: (ref: string) => string;
  }
): string {
  const dialect = opts.dialect;

  if (def.type === "conversion_rate") {
    const numerator = opts.fieldSqlByRef(def.numerator);
    const denominator = opts.fieldSqlByRef(def.denominator);
    const format = def.format ?? "percent";
    const multiplier = format === "percent" ? "100.0" : "1.0";

    if (dialect === "clickhouse") {
      return `if(${denominator} = 0, 0, (${numerator}) / (${denominator}) * ${multiplier})`;
    }
    return `CASE WHEN ${denominator} = 0 THEN 0 ELSE (${numerator})::double precision / (${denominator})::double precision * ${multiplier} END`;
  }

  if (def.type === "rolling_avg") {
    const measureExpr = opts.fieldSqlByRef(def.measure);
    const orderByExpr = opts.dimSqlByRef(def.orderBy);
    const partitionByExprs = Array.isArray(def.partitionBy) ? def.partitionBy.map(opts.dimSqlByRef) : undefined;
    return buildRollingAvg({
      dialect,
      measureExpr,
      window: def.window,
      orderByExpr,
      partitionByExprs,
    });
  }

  if (def.type === "window_agg") {
    const measureExpr = opts.fieldSqlByRef(def.measure);
    const orderByExpr = def.orderBy ? opts.dimSqlByRef(def.orderBy) : undefined;
    const partitionByExprs = Array.isArray(def.partitionBy) ? def.partitionBy.map(opts.dimSqlByRef) : undefined;
    return buildWindowAgg({
      dialect,
      fn: def.fn,
      measureExpr,
      orderByExpr,
      partitionByExprs,
      frame: {
        frameStart: def.frameStart,
        frameEnd: def.frameEnd,
      },
    });
  }

  if (def.type === "pivot_cohort") {
    throw new Error("Cohort Pivot calculated fields are not supported in compileSemanticQuery yet. Use the cohort-pivot query path.");
  }

  throw new Error("Unsupported calculated field");
}

function isWindowSqlExpression(sql: string): boolean {
  return /\bOVER\s*\(/i.test(String(sql ?? ""));
}

export function compileSemanticQuery({
  semanticModel,
  query,
  globalContext,
  dialectHint,
  sourceBindings,
  requestContext,
}: {
  semanticModel: SemanticModelV1;
  query: LogicalQuery;
  globalContext?: GlobalFilterContextV1 | null;
  dialectHint?: SqlDialect;
  sourceBindings: Record<string, { connectionId: string; tableKey: string }>;
  requestContext?: { chartId?: string; pageKey?: string } | null;
}): CompiledQuery {
  if (!semanticModel || typeof semanticModel !== "object" || (semanticModel as any).version !== 1) {
    throw new Error("Unsupported semantic model version");
  }

  const sourceModelName = safeIdent(query?.sourceModel);
  const sourceModel = (semanticModel.models as any)?.[sourceModelName];
  if (!sourceModel) throw new Error(`Unknown sourceModel: ${sourceModelName}`);

  const bound = (sourceBindings && typeof sourceBindings === "object") ? (sourceBindings as any)[sourceModelName] : null;
  const connectionId = String(bound?.connectionId ?? "").trim();
  const tableKey = String(bound?.tableKey ?? "").trim();
  // If bindings exist but connectionId is missing (e.g. after a project reload),
  // try a best-effort fallback to the default connection.
  const fallbackConnectionId = (() => {
    try {
      const anyBindings = sourceBindings && typeof sourceBindings === "object" ? Object.values(sourceBindings as any) : [];
      const first = Array.isArray(anyBindings) ? anyBindings.find((b: any) => !!String(b?.connectionId ?? "").trim()) : null;
      if (first) return String((first as any).connectionId).trim();
    } catch {}
    return "";
  })();
  const effectiveConnectionId = connectionId || fallbackConnectionId;
  if (!effectiveConnectionId) throw new Error(`Missing source binding for model: ${sourceModelName} (connectionId)`);
  if (!tableKey) throw new Error(`Missing source binding for model: ${sourceModelName} (tableKey)`);

  const dimensions = Array.isArray(query?.dimensions) ? query.dimensions : [];
  const measuresV2 = Array.isArray((query as any)?.measuresV2) ? (query as any).measuresV2 : [];
  const measuresLegacy = Array.isArray(query?.measures) ? query.measures : [];
  const measures = (measuresV2.length > 0
    ? measuresV2.map((m: any) => String(m?.ref ?? "").trim()).filter(Boolean)
    : measuresLegacy.map((m: any) => String(m ?? "").trim()).filter(Boolean));
  const vizType = String((query as any)?.vizType ?? (query as any)?.__vizType ?? "").trim().toLowerCase();
  const isTableViz = vizType === "table";
  const measureAggOverridesRaw = ((query as any)?.measureAggOverrides && typeof (query as any).measureAggOverrides === "object")
    ? ((query as any).measureAggOverrides as Record<string, unknown>)
    : {};
  const measureAggOverrides = new Map<string, "sum" | "avg" | "count" | "countDistinct" | "min" | "max">();
  for (const [k, v] of Object.entries(measureAggOverridesRaw)) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    const agg = normalizeAggFn(v);
    if (!agg) continue;
    measureAggOverrides.set(key, agg);
  }
  for (const m of measuresV2) {
    const ref = String((m as any)?.ref ?? "").trim();
    if (!ref) continue;
    const agg = normalizeAggFn((m as any)?.aggFn);
    if (!agg) continue;
    measureAggOverrides.set(ref, agg);
    const field = ref.includes(".") ? ref.split(".").slice(1).join(".") : ref;
    if (field && !measureAggOverrides.has(field)) measureAggOverrides.set(field, agg);
  }

  const dialect: SqlDialect = dialectHint ?? "postgres";

  const selectParts: string[] = [];
  const groupByParts: string[] = [];
  const allowedOrderAliases = new Set<string>();

  const calcMeasuresRequested: string[] = [];
  const baseMeasuresRequested: string[] = [];
  const calcFieldsRequested: string[] = [];
  for (const m of measures) {
    const ref = String(m ?? "").trim();
    if (!ref) continue;
    const { model, field } = splitRef(ref);
    if (model !== sourceModelName) {
      baseMeasuresRequested.push(ref);
      continue;
    }
    const baseDef = (sourceModel?.measures as any)?.[field];
    const calcDef = (sourceModel as any)?.calculatedMeasures?.[field];
    const calcFieldDef = (sourceModel as any)?.calculatedFields?.[field];
    if (calcFieldDef && !baseDef && !calcDef) {
      calcFieldsRequested.push(ref);
      continue;
    }
    if (calcDef && !baseDef) calcMeasuresRequested.push(ref);
    else baseMeasuresRequested.push(ref);
  }

  const time = (query as any)?.time;
  const timeDimRef = time && typeof time === "object" ? String(time?.dimension ?? "").trim() : "";
  const granularity = time && typeof time === "object" ? String(time?.granularity ?? "").trim() : "";
  const defaultTimeDim = String((sourceModel as any)?.defaultTimeDimension ?? "").trim();
  const scopedTimeDimRef = (() => {
    if (timeDimRef) return timeDimRef;
    if (!defaultTimeDim) return "";
    return `${sourceModelName}.${defaultTimeDim}`;
  })();

  const timeBucketExpr = (baseExpr: string) => {
    const g = granularity;
    if (!g) return baseExpr;
    if (dialect === "clickhouse") {
      if (g === "day") return `toStartOfDay(${baseExpr})`;
      if (g === "week") return `toStartOfWeek(${baseExpr})`;
      if (g === "month") return `toStartOfMonth(${baseExpr})`;
      if (g === "quarter") return `toStartOfQuarter(${baseExpr})`;
      if (g === "year") return `toStartOfYear(${baseExpr})`;
      return baseExpr;
    }
    if (dialect === "mssql") {
      if (g === "day") return `DATEADD(day, DATEDIFF(day, 0, ${baseExpr}), 0)`;
      if (g === "week") return `DATEADD(week, DATEDIFF(week, 0, ${baseExpr}), 0)`;
      if (g === "month") return `DATEADD(month, DATEDIFF(month, 0, ${baseExpr}), 0)`;
      if (g === "quarter") return `DATEADD(quarter, DATEDIFF(quarter, 0, ${baseExpr}), 0)`;
      if (g === "year") return `DATEADD(year, DATEDIFF(year, 0, ${baseExpr}), 0)`;
      return baseExpr;
    }
    if (g === "day") return `date_trunc('day', ${baseExpr})`;
    if (g === "week") return `date_trunc('week', ${baseExpr})`;
    if (g === "month") return `date_trunc('month', ${baseExpr})`;
    if (g === "quarter") return `date_trunc('quarter', ${baseExpr})`;
    if (g === "year") return `date_trunc('year', ${baseExpr})`;
    return baseExpr;
  };

  // Determine which models are required by query.
  const requiredModels = new Set<string>([sourceModelName]);
  for (const d of dimensions) {
    const ref = String(d ?? "").trim();
    if (!ref) continue;
    requiredModels.add(splitRef(ref).model);
  }
  for (const m of measures) {
    const ref = String(m ?? "").trim();
    if (!ref) continue;
    requiredModels.add(splitRef(ref).model);
  }
  if (scopedTimeDimRef) requiredModels.add(splitRef(scopedTimeDimRef).model);

  const orderByRaw = Array.isArray((query as any)?.orderBy) ? (query as any).orderBy : [];
  for (const o of orderByRaw) {
    const f = String(o?.field ?? "").trim();
    if (!f) continue;
    try {
      // If it's a semantic ref, include its model so the join plan includes required tables.
      requiredModels.add(splitRef(f).model);
    } catch {
      // Alias sort (recommended) or invalid string: ignore.
      continue;
    }
  }

  const dateRangeFilters = (() => {
    const dr = (globalContext as any)?.dateRange;
    if (!dr || typeof dr !== "object") return [] as LogicalFilter[];
    if (!scopedTimeDimRef) return [] as LogicalFilter[];
    const start = String((dr as any)?.start ?? "").trim();
    const end = String((dr as any)?.end ?? "").trim();
    if (!start && !end) return [] as LogicalFilter[];
    if (start && end) {
      const f: LogicalFilter = { field: scopedTimeDimRef, op: "between", values: [start, end] };
      return [f];
    }
    if (start) {
      const f: LogicalFilter = { field: scopedTimeDimRef, op: "gte", values: [start] };
      return [f];
    }
    const f: LogicalFilter = { field: scopedTimeDimRef, op: "lte", values: [end] };
    return [f];
  })();

  const rlsFilters = (() => {
    const rules = Array.isArray((sourceModel as any)?.rls) ? (sourceModel as any).rls : [];
    const params = ((globalContext as any)?.params && typeof (globalContext as any).params === "object")
      ? (globalContext as any).params
      : {};
    const out: LogicalFilter[] = [];
    for (const rule of rules) {
      const field = String((rule as any)?.field ?? "").trim();
      const param = String((rule as any)?.param ?? "").trim();
      if (!field || !param) continue;
      const raw = (params as any)[param];
      if (raw == null) continue;
      const op = String((rule as any)?.op ?? "eq").trim() as LogicalFilter["op"];
      const values = Array.isArray(raw) ? raw : [raw];
      out.push({ field, op, values });
    }
    return out;
  })();

  const filtersAll = [
    ...mergeFilters(query?.filters, globalContext, requestContext),
    ...dateRangeFilters,
    ...rlsFilters,
  ];

  if (String(process.env.SEMANTIC_DEBUG ?? "").trim() === "1") {
    try {
      const gf = Array.isArray((globalContext as any)?.filters) ? (globalContext as any).filters : [];
      const lf = Array.isArray((query as any)?.filters) ? (query as any).filters : [];
      console.log("[semantic.planner.filters]", {
        sourceModel: sourceModelName,
        requestContext: requestContext ?? null,
        globalFiltersCount: gf.length,
        localFiltersCount: lf.length,
        mergedFiltersCount: filtersAll.length,
        mergedFilters: filtersAll,
      });
    } catch {}
  }
  for (const f of filtersAll) {
    const ref = String(f?.field ?? "").trim();
    if (!ref) continue;
    requiredModels.add(splitRef(ref).model);
  }

  const allModelAliases = new Map<string, string>();
  allModelAliases.set(sourceModelName, "m0");
  const joinEdges = buildJoinEdges(semanticModel);
  const joinPlan: JoinEdge[] = [];

  const ensureModelAlias = (modelName: string) => {
    const mn = safeIdent(modelName);
    if (allModelAliases.has(mn)) return;
    const alias = `m${allModelAliases.size}`;
    allModelAliases.set(mn, alias);
  };

  for (const mn of Array.from(requiredModels)) {
    const modelName = safeIdent(mn);
    ensureModelAlias(modelName);
    if (modelName === sourceModelName) continue;
    const path = findJoinPath(joinEdges, sourceModelName, modelName);
    if (!path) throw new Error(`No join path from ${sourceModelName} to ${modelName}`);
    for (const e of path) {
      if (!joinPlan.some((x) => x.fromModel === e.fromModel && x.toModel === e.toModel && x.joinName === e.joinName)) {
        joinPlan.push(e);
      }
      ensureModelAlias(e.fromModel);
      ensureModelAlias(e.toModel);
    }
  }

  const bindingForModel = (modelName: string) => {
    return (sourceBindings && typeof sourceBindings === "object") ? (sourceBindings as any)[modelName] : null;
  };

  // Ensure all involved models are bound and use same connection.
  for (const mn of Array.from(allModelAliases.keys())) {
    const b = bindingForModel(mn);
    const cid = String(b?.connectionId ?? "").trim();
    const tk = String(b?.tableKey ?? "").trim();
    const effectiveCid = cid || effectiveConnectionId;
    if (!effectiveCid) throw new Error(`Missing source binding for model: ${mn} (connectionId)`);
    if (!tk) throw new Error(`Missing source binding for model: ${mn} (tableKey)`);
    if (effectiveCid !== effectiveConnectionId) {
      throw new Error(`Cross-connection joins are not supported (model ${mn} uses ${effectiveCid}, expected ${effectiveConnectionId})`);
    }
  }

  const modelSqlByRef = (ref: string): { expr: string; model: string; field: string; isMeasure: boolean; fieldType: FieldValueType } => {
    const { model, field } = splitRef(ref);
    const modelName = safeIdent(model);
    const mDef = (semanticModel.models as any)?.[modelName];
    if (!mDef) throw new Error(`Unknown model: ${modelName}`);
    const dim = (mDef?.dimensions as any)?.[field];
    if (dim && String(dim.sql ?? "").trim()) {
      const fieldType = String((dim as any)?.type ?? "").trim() as FieldValueType;
      return { expr: String(dim.sql).trim(), model: modelName, field, isMeasure: false, fieldType: fieldType || "unknown" };
    }
    const ms = (mDef?.measures as any)?.[field];
    if (ms && String(ms.sql ?? "").trim()) {
      return { expr: String(ms.sql).trim(), model: modelName, field, isMeasure: true, fieldType: "number" };
    }
    throw new Error(`Unknown field: ${ref}`);
  };

  const applyAlias = (expr: string, modelName: string) => {
    const alias = allModelAliases.get(modelName);
    if (!alias) return expr;
    if (expr.includes("{{alias}}")) return expr.split("{{alias}}").join(alias);
    // Back-compat: if the expr already references Model.field, rewrite Model -> alias.
    const rewritten = expr.replace(new RegExp(`\\b${modelName}\\.`, "g"), `${alias}.`);
    return rewritten;
  };

  const multiModel = allModelAliases.size > 1;

  const guardAliasSafe = (ref: string, expr: string, modelName: string) => {
    if (!multiModel) return;
    if (isAliasSafeExpr(expr, modelName)) return;
    throw new Error(
      `Multi-model query requires alias-safe SQL for ${ref}. ` +
      `Use '{{alias}}.<col>' (recommended) or prefix columns as '${modelName}.<col>' in semantic model sql.`
    );
  };

  const dimSqlByRef = (ref: string) => {
    const info = modelSqlByRef(ref);
    if (info.isMeasure) throw new Error(`Expected dimension but got measure: ${ref}`);
    const expr = String(info.expr ?? "").trim();
    if (!expr) throw new Error(`Empty dimension sql: ${ref}`);
    guardAliasSafe(ref, expr, info.model);
    return applyAlias(expr, info.model);
  };

  const fieldSqlByRef = (ref: string) => {
    const info = modelSqlByRef(ref);
    const expr = String(info.expr ?? "").trim();
    if (!expr) throw new Error(`Empty field sql: ${ref}`);
    guardAliasSafe(ref, expr, info.model);
    return applyAlias(expr, info.model);
  };
  const fieldTypeByRef = (ref: string): FieldValueType => {
    try {
      return modelSqlByRef(ref).fieldType || "unknown";
    } catch {
      return "unknown";
    }
  };
  const fieldKindByRef = (ref: string): "dimension" | "measure" | "unknown" => {
    try {
      const info = modelSqlByRef(ref);
      return info.isMeasure ? "measure" : "dimension";
    } catch {
      return "unknown";
    }
  };

  const projectedDimAliasByRef = new Map<string, string>();
  const projectedDimAliasSet = new Set<string>();
  const projectDimensionRef = (refRaw: string, opts?: { useTimeBucket?: boolean }) => {
    const ref = String(refRaw ?? "").trim();
    if (!ref) return "";
    const { field } = splitRef(ref);
    const alias = safeIdent(field);
    if (projectedDimAliasSet.has(alias)) {
      projectedDimAliasByRef.set(ref, alias);
      return alias;
    }
    const baseExpr = dimSqlByRef(ref);
    const expr = opts?.useTimeBucket ? timeBucketExpr(baseExpr) : baseExpr;
    selectParts.push(`${expr} as ${alias}`);
    groupByParts.push(expr);
    allowedOrderAliases.add(alias);
    projectedDimAliasSet.add(alias);
    projectedDimAliasByRef.set(ref, alias);
    return alias;
  };

  const measureAliasByName = new Map<string, string>();
  const addedBaseMeasureRefs = new Set<string>();
  const addBaseMeasure = (refRaw: string) => {
    const ref = String(refRaw ?? "").trim();
    if (!ref || addedBaseMeasureRefs.has(ref)) return;
    const { model, field } = splitRef(ref);
    const modelName = safeIdent(model);
    const mDef = (semanticModel.models as any)?.[modelName];
    if (!mDef) throw new Error(`Unknown model: ${modelName}`);
    const def = (mDef?.measures as any)?.[field];
    const dimDef = (mDef?.dimensions as any)?.[field];
    const overrideType = measureAggOverrides.get(ref) ?? measureAggOverrides.get(field) ?? "";
    if (!def && !(dimDef && overrideType)) throw new Error(`Unknown measure: ${ref}`);
    const exprRaw = String((def?.sql ?? dimDef?.sql) ?? "").trim() || "*";
    if (exprRaw !== "*") {
      guardAliasSafe(ref, exprRaw, modelName);
    }
    const expr = exprRaw === "*" ? "*" : applyAlias(exprRaw, modelName);
    const type = overrideType || String(def?.type ?? "").trim();
    const alias = safeIdent(`${modelName}_${field}`);

    const measureFilters = Array.isArray((def as any)?.filters) ? ((def as any).filters as any[]) : [];
    const normalizedMeasureFilters = normalizeFilters(measureFilters);
    const condSql = normalizedMeasureFilters.length
      ? renderFilterCondition(normalizedMeasureFilters, fieldSqlByRef, dialect, fieldTypeByRef)
      : "";

    selectParts.push(`${wrapAggWithCondition(type, expr, condSql, dialect)} as ${alias}`);
    allowedOrderAliases.add(alias);
    measureAliasByName.set(`${modelName}.${field}`, alias);
    if (!measureAliasByName.has(field)) {
      measureAliasByName.set(field, alias);
    }
    addedBaseMeasureRefs.add(ref);
  };

  const requestedDimensionSet = new Set(
    dimensions.map((d) => String(d ?? "").trim()).filter(Boolean)
  );
  for (const d of dimensions) {
    const ref = String(d ?? "").trim();
    if (!ref) continue;
    projectDimensionRef(ref, { useTimeBucket: ref === timeDimRef && !!granularity });
  }

  // time dimension bucket (optional)
  if (timeDimRef && !requestedDimensionSet.has(timeDimRef)) {
    projectDimensionRef(timeDimRef, { useTimeBucket: true });
  }

  for (const m of baseMeasuresRequested) {
    addBaseMeasure(String(m ?? ""));
  }

  type DeferredWindowCalc = {
    alias: string;
    sqlExpr: string;
  };
  const deferredWindowCalcs: DeferredWindowCalc[] = [];
  const requestedCalcFieldAliases: string[] = [];

  for (const cf of calcFieldsRequested) {
    const ref = String(cf ?? "").trim();
    if (!ref) continue;
    const { model, field } = splitRef(ref);
    const modelName = safeIdent(model);
    const mDef = (semanticModel.models as any)?.[modelName];
    if (!mDef) throw new Error(`Unknown model: ${modelName}`);
    const def = (mDef as any)?.calculatedFields?.[field] as CalculatedFieldDef | undefined;
    if (!def) throw new Error(`Unknown calculated field: ${ref}`);

    const alias = safeIdent(`${modelName}_${field}`);

    if (def.type === "rolling_avg" || def.type === "window_agg") {
      addBaseMeasure(def.measure);

      const measureAlias = measureAliasByName.get(def.measure)
        || (() => {
          const { field: mField } = splitRef(def.measure);
          return measureAliasByName.get(mField);
        })();
      if (!measureAlias) {
        throw new Error(`Window calculated field requires base measure alias: ${def.measure}`);
      }

      const orderByAlias = (() => {
        if (def.type !== "rolling_avg" && !def.orderBy) return undefined;
        const refOrder = def.type === "rolling_avg" ? def.orderBy : String(def.orderBy ?? "").trim();
        if (!refOrder) return undefined;
        return projectDimensionRef(refOrder, { useTimeBucket: refOrder === timeDimRef });
      })();

      const partitionByAliases = Array.isArray((def as any).partitionBy)
        ? ((def as any).partitionBy as string[])
            .map((p) => projectDimensionRef(String(p ?? ""), { useTimeBucket: String(p ?? "") === timeDimRef }))
            .filter(Boolean)
        : undefined;

      const sqlExpr = def.type === "rolling_avg"
        ? buildRollingAvg({
            dialect,
            measureExpr: measureAlias,
            window: def.window,
            orderByExpr: orderByAlias || "1",
            partitionByExprs: partitionByAliases,
          })
        : buildWindowAgg({
            dialect,
            fn: def.fn,
            measureExpr: measureAlias,
            orderByExpr: orderByAlias,
            partitionByExprs: partitionByAliases,
            frame: {
              frameStart: def.frameStart,
              frameEnd: def.frameEnd,
            },
          });

      deferredWindowCalcs.push({ alias, sqlExpr });
      measureAliasByName.set(`${modelName}.${field}`, alias);
      if (!measureAliasByName.has(field)) {
        measureAliasByName.set(field, alias);
      }
      continue;
    }

    const sqlExpr = compileExpression(def, {
      dialect,
      fieldSqlByRef,
      dimSqlByRef,
    });

    selectParts.push(`${sqlExpr} as ${alias}`);
    requestedCalcFieldAliases.push(alias);
    allowedOrderAliases.add(alias);
    measureAliasByName.set(`${modelName}.${field}`, alias);
    if (!measureAliasByName.has(field)) {
      measureAliasByName.set(field, alias);
    }
  }

  const hasMeasuresRequested = measures.length > 0;
  if (isTableViz && hasMeasuresRequested && dimensions.length > 0) {
    for (const d of dimensions) {
      const ref = String(d ?? "").trim();
      if (!ref) continue;
      const expr = dimSqlByRef(ref);
      if (!groupByParts.includes(expr)) groupByParts.push(expr);
    }
  }

  if (selectParts.length === 0) {
    selectParts.push("1 as value");
  }

  const whereFilters: LogicalFilter[] = [];
  const havingFilters: LogicalFilter[] = [];
  for (const f of filtersAll) {
    const kind = fieldKindByRef(String(f?.field ?? ""));
    if (kind === "measure") havingFilters.push(f);
    else whereFilters.push(f);
  }
  const whereBase = renderWhere(whereFilters, fieldSqlByRef, dialect, fieldTypeByRef);
  const where = (() => {
    if ((query as any)?.filterNullDimensions !== true || dimensions.length === 0) return whereBase;
    const extraClauses = Array.from(new Set(dimensions.map((d) => String(d ?? "").trim()).filter(Boolean))).map((ref) => {
      const expr = dimSqlByRef(ref);
      const textExpr = dialect === "clickhouse" ? `toString(${expr})` : `CAST(${expr} AS TEXT)`;
      return `(${expr} IS NOT NULL AND ${textExpr} <> '')`;
    });
    if (extraClauses.length === 0) return whereBase;
    const extra = extraClauses.join(" AND ");
    if (!whereBase) return `WHERE ${extra}`;
    return `${whereBase} AND ${extra}`;
  })();
  const groupByDedup = Array.from(new Set(groupByParts));
  const groupBy = groupByDedup.length ? `GROUP BY ${groupByDedup.join(", ")}` : "";
  const having = renderFilterCondition(havingFilters, fieldSqlByRef, dialect, fieldTypeByRef);

  const orderBy = (() => {
    const arr = Array.isArray((query as any)?.orderBy) ? (query as any).orderBy : [];
    if (!arr.length) {
      let firstMeasureAlias = "";
      for (const m of measures) {
        const ref = String(m ?? "").trim();
        if (!ref) continue;
        const alias = measureAliasByName.get(ref) || measureAliasByName.get(ref.split(".").slice(1).join(".")) || "";
        if (alias) {
          firstMeasureAlias = alias;
          break;
        }
      }
      return firstMeasureAlias ? `ORDER BY ${firstMeasureAlias} DESC` : "";
    }
    const parts: string[] = [];
    for (const o of arr) {
      const f = String(o?.field ?? "").trim();
      if (!f) continue;
      const dir = String(o?.dir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

      // Allow order by either alias (recommended) or full ref.
      if (allowedOrderAliases.has(f)) {
        parts.push(`${f} ${dir}`);
        continue;
      }

      // Full ref: only same-model dimensions.
      try {
        const expr = dimSqlByRef(f);
        parts.push(`${expr} ${dir}`);
      } catch {
        continue;
      }
    }
    return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
  })();

  const limit = Math.max(1, Math.min(50_000, Number(query?.limit ?? 500) || 500));
  const offset = Math.max(0, Number((query as any)?.offset ?? 0) || 0);
  const limitClause = dialect === "mssql" ? "" : `LIMIT ${limit}`;
  const offsetClause = (dialect === "mssql" || offset <= 0) ? "" : `OFFSET ${offset}`;
  const topClause = (dialect === "mssql" && offset <= 0) ? `TOP ${limit} ` : "";
  const mssqlPagingClause = (() => {
    if (dialect !== "mssql" || offset <= 0) return "";
    const ob = orderBy || "ORDER BY (SELECT NULL)";
    return `${ob} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  })();
  const orderByEffective = dialect === "mssql" && offset > 0 ? "" : orderBy;

  const fromClause = (() => {
    const baseAlias = allModelAliases.get(sourceModelName) ?? "m0";
    const parts: string[] = [];
    parts.push(`FROM ${tableKey} ${baseAlias}`);

    for (const e of joinPlan) {
      const fromAlias = allModelAliases.get(e.fromModel);
      const toAlias = allModelAliases.get(e.toModel);
      if (!fromAlias || !toAlias) continue;

      const b = bindingForModel(e.toModel);
      const toTableKey = String(b?.tableKey ?? "").trim();
      if (!toTableKey) throw new Error(`Missing tableKey for join model: ${e.toModel}`);

      const joinDef = ((semanticModel.models as any)?.[e.joinModel] as any)?.joins?.[e.joinName];
      if (!joinDef) throw new Error(`Join not found: ${e.joinModel}.joins.${e.joinName}`);

      const onExpr = (() => {
        const fromField = String((joinDef as any)?.fromField ?? "").trim();
        const toField = String((joinDef as any)?.toField ?? "").trim();
        const operator = String((joinDef as any)?.operator ?? "eq").trim() || "eq";
        const legacyOn = String((joinDef as any)?.on ?? "").trim();

        if (fromField && toField) {
          if (operator !== "eq") throw new Error(`Unsupported join operator: ${operator}`);
          const { model: lfModel, field: lfField } = splitRef(fromField);
          const { model: rtModel, field: rtField } = splitRef(toField);
          const lAlias = allModelAliases.get(safeIdent(lfModel));
          const rAlias = allModelAliases.get(safeIdent(rtModel));
          if (!lAlias || !rAlias) throw new Error(`Join aliases not found for ${fromField} -> ${toField}`);
          return `${lAlias}.${safeIdent(lfField)} = ${rAlias}.${safeIdent(rtField)}`;
        }

        if (legacyOn) {
          // Support placeholders for deterministic alias injection.
          let rendered = legacyOn;
          rendered = rendered.split("{{from}}").join(fromAlias);
          rendered = rendered.split("{{to}}").join(toAlias);
          // Also allow explicit model placeholders.
          rendered = rendered.split(`{{${e.fromModel}}}`).join(fromAlias);
          rendered = rendered.split(`{{${e.toModel}}}`).join(toAlias);
          rendered = rendered.split(`{{${e.joinModel}}}`).join(allModelAliases.get(e.joinModel) ?? "");
          const joinToModel = String((joinDef as any)?.toModel ?? "").trim();
          if (joinToModel) {
            rendered = rendered.split(`{{${joinToModel}}}`).join(allModelAliases.get(joinToModel) ?? "");
          }
          // Best-effort: rewrite Model. -> alias.
          rendered = rendered.replace(new RegExp(`\\b${e.fromModel}\\.`, "g"), `${fromAlias}.`);
          rendered = rendered.replace(new RegExp(`\\b${e.toModel}\\.`, "g"), `${toAlias}.`);
          rendered = rendered.replace(new RegExp(`\\b${e.joinModel}\\.`, "g"), `${allModelAliases.get(e.joinModel) ?? e.joinModel}.`);
          if (joinToModel) {
            rendered = rendered.replace(new RegExp(`\\b${joinToModel}\\.`, "g"), `${allModelAliases.get(joinToModel) ?? joinToModel}.`);
          }
          return rendered;
        }

        throw new Error(`Join ${e.fromModel}.${e.joinName} is missing fromField/toField and on`);
      })();

      parts.push(`LEFT JOIN ${toTableKey} ${toAlias} ON ${onExpr}`);
    }

    return parts.join(" ");
  })();

  const baseSql = `SELECT ${topClause}${selectParts.join(", ")} ${fromClause} ${where} ${groupBy} ${having ? `HAVING ${having}` : ""} ${orderByEffective} ${limitClause} ${offsetClause} ${mssqlPagingClause}`.trim();

  if (calcMeasuresRequested.length === 0 && deferredWindowCalcs.length === 0) {
    return {
      sql: baseSql,
      connectionId,
      connectionType: (bound as any)?.connectionType,
      debug: {
        mergedFilters: filtersAll,
        filterPlacement: {
          where: whereFilters,
          having: havingFilters,
        } as any,
        pagination: { limit, offset },
      },
    };
  }

  const outerSelectParts: string[] = [];
  for (const d of dimensions) {
    const { field } = splitRef(String(d));
    outerSelectParts.push(safeIdent(field));
  }
  if (timeDimRef) {
    const { field } = splitRef(timeDimRef);
    outerSelectParts.push(safeIdent(field));
  }
  for (const m of baseMeasuresRequested) {
    const { model, field } = splitRef(String(m));
    outerSelectParts.push(safeIdent(`${safeIdent(model)}_${field}`));
  }

  for (const alias of requestedCalcFieldAliases) {
    outerSelectParts.push(alias);
  }

  for (const dc of deferredWindowCalcs) {
    outerSelectParts.push(`${dc.sqlExpr} as ${dc.alias}`);
  }

  for (const cm of calcMeasuresRequested) {
    const { field } = splitRef(String(cm));
    const calcDef = (sourceModel as any)?.calculatedMeasures?.[field];
    if (!calcDef) throw new Error(`Unknown calculated measure: ${cm}`);
    const exprRaw = String((calcDef as any)?.sql ?? "").trim();
    if (!exprRaw) throw new Error(`Empty calculated measure sql: ${cm}`);

    const tokens = tokenizeCalcExpr(exprRaw);
    const ast = parseCalcExpr(tokens);
    const sqlExpr = compileCalcAstToSql(ast, {
      measureAliasByName,
      params: (globalContext as any)?.params,
      dialect,
    });
    const alias = safeIdent(field);
    if (isWindowSqlExpression(sqlExpr)) {
      deferredWindowCalcs.push({ alias, sqlExpr });
    } else {
      outerSelectParts.push(`${sqlExpr} as ${alias}`);
    }
  }

  const outerSqlBase = `SELECT ${outerSelectParts.join(", ")} FROM (${baseSql}) t`.trim();
  const outerSql = deferredWindowCalcs.length
    ? wrapWithWindowLayer({
        innerSql: outerSqlBase,
        windowExprs: deferredWindowCalcs.map((d) => ({ alias: d.alias, sql: d.sqlExpr })),
      })
    : outerSqlBase;

  return {
    sql: outerSql,
    connectionId,
    connectionType: (bound as any)?.connectionType,
    debug: {
      mergedFilters: filtersAll,
      filterPlacement: {
        where: whereFilters,
        having: havingFilters,
      } as any,
      pagination: { limit, offset },
    },
  };
}
