export type FormulaDialect = "clickhouse" | "postgres" | "mssql";

export type FunctionKind = "agg" | "scalar" | "window" | "window_ordered";

export type FormulaFunctionDef = {
  name: string;
  minArgs: number;
  maxArgs?: number;
  kind: FunctionKind;
  compile: (args: string[], dialect: FormulaDialect) => string;
};

export type FormulaFunctionRegistry = {
  byName: Map<string, FormulaFunctionDef>;
  list: FormulaFunctionDef[];
};

function normalizeFnName(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

function stripQuotedLiteral(raw: string): string {
  const s = String(raw ?? "").trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function unitToken(raw: string): string {
  return stripQuotedLiteral(raw).trim().toLowerCase();
}

function capWord(raw: string): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  return `${s[0]!.toUpperCase()}${s.slice(1)}`;
}

const same = (name: string): FormulaFunctionDef["compile"] => (args) => `${name}(${args.join(", ")})`;
const dual = (chName: string, pgName: string): FormulaFunctionDef["compile"] => (args, dialect) => {
  return `${dialect === "clickhouse" ? chName : pgName}(${args.join(", ")})`;
};

function dateExtractPart(expr: string, part: string, dialect: FormulaDialect): string {
  if (dialect === "clickhouse") return `datePart('${part}', ${expr})`;
  if (dialect === "mssql") return `DATEPART(${part.toUpperCase()}, ${expr})`;
  return `EXTRACT(${part.toUpperCase()} FROM ${expr})`;
}

function containsCompile(args: string[], dialect: FormulaDialect): string {
  const [x = "", v = ""] = args;
  if (dialect === "clickhouse") return `positionCaseInsensitive(${x}, ${v}) > 0`;
  if (dialect === "mssql") return `CHARINDEX(LOWER(${v}), LOWER(CAST(${x} AS NVARCHAR(MAX)))) > 0`;
  return `${x} ILIKE '%' || ${v} || '%'`;
}

function startsWithCompile(args: string[], dialect: FormulaDialect, insensitive: boolean): string {
  const [x = "", v = ""] = args;
  if (dialect === "clickhouse") {
    if (insensitive) return `startsWith(lower(${x}), lower(${v}))`;
    return `startsWith(${x}, ${v})`;
  }
  if (dialect === "mssql") {
    if (insensitive) return `LOWER(CAST(${x} AS NVARCHAR(MAX))) LIKE LOWER(${v}) + '%'`;
    return `CAST(${x} AS NVARCHAR(MAX)) LIKE ${v} + '%'`;
  }
  if (insensitive) return `${x} ILIKE ${v} || '%'`;
  return `${x} LIKE ${v} || '%'`;
}

function endsWithCompile(args: string[], dialect: FormulaDialect, insensitive: boolean): string {
  const [x = "", v = ""] = args;
  if (dialect === "clickhouse") {
    if (insensitive) return `endsWith(lower(${x}), lower(${v}))`;
    return `endsWith(${x}, ${v})`;
  }
  if (dialect === "mssql") {
    if (insensitive) return `LOWER(CAST(${x} AS NVARCHAR(MAX))) LIKE '%' + LOWER(${v})`;
    return `CAST(${x} AS NVARCHAR(MAX)) LIKE '%' + ${v}`;
  }
  if (insensitive) return `${x} ILIKE '%' || ${v}`;
  return `${x} LIKE '%' || ${v}`;
}

function dateTruncCompile(args: string[], dialect: FormulaDialect): string {
  const [dt = "", unitRaw = "'day'"] = args;
  const unit = unitToken(unitRaw) || "day";
  if (dialect === "clickhouse") {
    if (unit === "day") return `toStartOfDay(${dt})`;
    if (unit === "week") return `toStartOfWeek(${dt})`;
    if (unit === "month") return `toStartOfMonth(${dt})`;
    if (unit === "quarter") return `toStartOfQuarter(${dt})`;
    if (unit === "year") return `toStartOfYear(${dt})`;
    return `toStartOfInterval(${dt}, INTERVAL 1 ${unit})`;
  }
  if (dialect === "mssql") {
    if (unit === "day") return `DATEADD(day, DATEDIFF(day, 0, ${dt}), 0)`;
    if (unit === "week") return `DATEADD(week, DATEDIFF(week, 0, ${dt}), 0)`;
    if (unit === "month") return `DATEADD(month, DATEDIFF(month, 0, ${dt}), 0)`;
    if (unit === "quarter") return `DATEADD(quarter, DATEDIFF(quarter, 0, ${dt}), 0)`;
    if (unit === "year") return `DATEADD(year, DATEDIFF(year, 0, ${dt}), 0)`;
    return `DATEADD(${unit}, DATEDIFF(${unit}, 0, ${dt}), 0)`;
  }
  return `date_trunc('${unit}', ${dt})`;
}

function dateAddCompile(args: string[], dialect: FormulaDialect): string {
  const [dt = "", unitRaw = "'day'", amount = "0"] = args;
  const unit = unitToken(unitRaw) || "day";
  if (dialect === "clickhouse") {
    return `${dt} + toInterval${capWord(unit)}(${amount})`;
  }
  if (dialect === "mssql") {
    return `DATEADD(${unit}, ${amount}, ${dt})`;
  }
  return `${dt} + ((${amount}) * INTERVAL '1 ${unit}')`;
}

function dateDiffCompile(args: string[], dialect: FormulaDialect): string {
  const [unitRaw = "'day'", d1 = "", d2 = ""] = args;
  const unit = unitToken(unitRaw) || "day";
  if (dialect === "clickhouse") return `dateDiff('${unit}', ${d1}, ${d2})`;
  if (dialect === "mssql") return `DATEDIFF(${unit}, ${d1}, ${d2})`;
  if (unit === "month") return `((date_part('year', age(${d2}, ${d1})) * 12) + date_part('month', age(${d2}, ${d1})))`;
  if (unit === "year") return `date_part('year', age(${d2}, ${d1}))`;
  return `date_part('${unit}', (${d2} - ${d1}))`;
}

function ifCompile(args: string[], dialect: FormulaDialect): string {
  if (args.length < 2) return "NULL";
  const hasElse = args.length % 2 === 1;
  const last = hasElse ? (args[args.length - 1] ?? "NULL") : "NULL";
  const pairs: Array<{ cond: string; thenExpr: string }> = [];
  const until = hasElse ? (args.length - 1) : args.length;
  for (let i = 0; i + 1 < until; i += 2) {
    pairs.push({ cond: args[i] ?? "FALSE", thenExpr: args[i + 1] ?? "NULL" });
  }
  if (dialect === "clickhouse" && pairs.length === 1) {
    return `if(${pairs[0]!.cond}, ${pairs[0]!.thenExpr}, ${last})`;
  }
  const branches = pairs.map((p) => `WHEN ${p.cond} THEN ${p.thenExpr}`).join(" ");
  return `CASE ${branches} ELSE ${last} END`;
}

function caseCompile(args: string[]): string {
  if (args.length < 3) return "NULL";
  const valueExpr = args[0] ?? "NULL";
  const hasElse = args.length % 2 === 0;
  const until = hasElse ? args.length - 1 : args.length;
  const pairs: string[] = [];
  for (let i = 1; i < until; i += 2) {
    pairs.push(`WHEN ${valueExpr} = ${args[i]} THEN ${args[i + 1] ?? "NULL"}`);
  }
  const elseExpr = hasElse ? (args[args.length - 1] ?? "NULL") : "NULL";
  return `CASE ${pairs.join(" ")} ELSE ${elseExpr} END`;
}

function allConcatCompile(args: string[], dialect: FormulaDialect): string {
  const [expr = "", sepRaw = "','"] = args;
  if (dialect === "clickhouse") {
    return `arrayStringConcat(groupArray(toString(${expr})), ${sepRaw})`;
  }
  if (dialect === "mssql") return `STRING_AGG(CAST(${expr} AS NVARCHAR(MAX)), ${sepRaw})`;
  return `string_agg(CAST(${expr} AS TEXT), ${sepRaw})`;
}

function topConcatCompile(args: string[], dialect: FormulaDialect): string {
  const [expr = "", _topN = "10", sepRaw = "','"] = args;
  if (dialect === "clickhouse") {
    return `arrayStringConcat(arraySlice(groupArray(toString(${expr})), 1, ${_topN}), ${sepRaw})`;
  }
  if (dialect === "mssql") return `STRING_AGG(CAST(${expr} AS NVARCHAR(MAX)), ${sepRaw})`;
  return `array_to_string((array_agg(CAST(${expr} AS TEXT)))[1:${_topN}], ${sepRaw})`;
}

const DEF_LIST: FormulaFunctionDef[] = [
  // Aggregations
  { name: "SUM", kind: "agg", minArgs: 1, maxArgs: 1, compile: same("SUM") },
  { name: "AVG", kind: "agg", minArgs: 1, maxArgs: 1, compile: same("AVG") },
  { name: "MIN", kind: "agg", minArgs: 1, maxArgs: 1, compile: same("MIN") },
  { name: "MAX", kind: "agg", minArgs: 1, maxArgs: 1, compile: same("MAX") },
  { name: "COUNT", kind: "agg", minArgs: 0, maxArgs: 1, compile: (args) => args.length ? `COUNT(${args[0]})` : "COUNT(*)" },
  { name: "COUNTD", kind: "agg", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `uniq(${args[0]})` : `COUNT(DISTINCT ${args[0]})` },
  { name: "COUNT_DISTINCT", kind: "agg", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `uniqExact(${args[0]})` : `COUNT(DISTINCT ${args[0]})` },
  { name: "COUNTD_IF", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `uniqExactIf(${args[0]}, ${args[1]})` : `COUNT(DISTINCT CASE WHEN ${args[1]} THEN ${args[0]} ELSE NULL END)` },
  { name: "COUNT_IF", kind: "agg", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `countIf(${args[0]})` : `SUM(CASE WHEN ${args[0]} THEN 1 ELSE 0 END)` },
  { name: "SUM_IF", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `sumIf(${args[0]}, ${args[1]})` : `SUM(CASE WHEN ${args[1]} THEN ${args[0]} ELSE 0 END)` },
  { name: "AVG_IF", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `avgIf(${args[0]}, ${args[1]})` : `AVG(CASE WHEN ${args[1]} THEN ${args[0]} ELSE NULL END)` },
  { name: "STDEV", kind: "agg", minArgs: 1, maxArgs: 1, compile: dual("stddevSamp", "STDDEV_SAMP") },
  { name: "STDEVP", kind: "agg", minArgs: 1, maxArgs: 1, compile: dual("stddevPop", "STDDEV_POP") },
  { name: "VAR", kind: "agg", minArgs: 1, maxArgs: 1, compile: dual("varSamp", "VAR_SAMP") },
  { name: "VARP", kind: "agg", minArgs: 1, maxArgs: 1, compile: dual("varPop", "VAR_POP") },
  { name: "MEDIAN", kind: "agg", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `median(${args[0]})` : `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${args[0]})` },
  { name: "QUANTILE", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `quantile(${args[1]})(${args[0]})` : `PERCENTILE_CONT(${args[1]}) WITHIN GROUP (ORDER BY ${args[0]})` },
  { name: "ANY", kind: "agg", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `any(${args[0]})` : `MIN(${args[0]})` },
  { name: "ARG_MIN", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `argMin(${args[0]}, ${args[1]})` : `${args[0]}` },
  { name: "ARG_MAX", kind: "agg", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `argMax(${args[0]}, ${args[1]})` : `${args[0]}` },

  // Logical
  { name: "IF", kind: "scalar", minArgs: 2, compile: ifCompile },
  { name: "IIF", kind: "scalar", minArgs: 2, compile: ifCompile },
  { name: "CASE", kind: "scalar", minArgs: 3, compile: (args) => caseCompile(args) },
  { name: "ISNULL", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `isNull(${args[0]})` : `${args[0]} IS NULL` },
  { name: "IFNULL", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `ifNull(${args[0]}, ${args[1]})` : `COALESCE(${args[0]}, ${args[1]})` },
  { name: "ISNAN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `isNaN(${args[0]})` : `${args[0]}::double precision <> ${args[0]}::double precision` },
  { name: "IFNAN", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `if(isNaN(${args[0]}), ${args[1]}, ${args[0]})` : `CASE WHEN ${args[0]}::double precision <> ${args[0]}::double precision THEN ${args[1]} ELSE ${args[0]} END` },
  { name: "ZN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `ifNull(${args[0]}, 0)` : `COALESCE(${args[0]}, 0)` },

  // Math
  { name: "ABS", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("ABS") },
  { name: "ACOS", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("ACOS") },
  { name: "ASIN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("ASIN") },
  { name: "ATAN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("ATAN") },
  { name: "ATAN2", kind: "scalar", minArgs: 2, maxArgs: 2, compile: same("ATAN2") },
  { name: "CEILING", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("ceil", "CEIL") },
  { name: "COS", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("COS") },
  { name: "SIN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("SIN") },
  { name: "TAN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("TAN") },
  { name: "RADIANS", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("RADIANS") },
  { name: "DEGREES", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("DEGREES") },
  { name: "FLOOR", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("FLOOR") },
  { name: "ROUND", kind: "scalar", minArgs: 1, maxArgs: 2, compile: dual("round", "ROUND") },
  { name: "DIV", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `intDiv(${args[0]}, ${args[1]})` : `FLOOR((${args[0]}) / NULLIF(${args[1]}, 0))` },
  { name: "POWER", kind: "scalar", minArgs: 2, maxArgs: 2, compile: same("POWER") },
  { name: "SQRT", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("SQRT") },
  { name: "LOG", kind: "scalar", minArgs: 1, maxArgs: 2, compile: dual("log", "LOG") },
  { name: "LOG2", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("log2", "LOG2") },
  { name: "LN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("log", "LN") },
  { name: "EXP", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("EXP") },
  { name: "SIGN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: same("SIGN") },
  { name: "SQUARE", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args) => `((${args[0]}) * (${args[0]}))` },
  { name: "GREATEST", kind: "scalar", minArgs: 2, compile: same("GREATEST") },
  { name: "LEAST", kind: "scalar", minArgs: 2, compile: same("LEAST") },

  // Strings
  { name: "CONCAT", kind: "scalar", minArgs: 1, compile: dual("concat", "CONCAT") },
  { name: "ALL_CONCAT", kind: "agg", minArgs: 1, maxArgs: 2, compile: allConcatCompile },
  { name: "TOP_CONCAT", kind: "agg", minArgs: 2, maxArgs: 3, compile: topConcatCompile },
  { name: "ASCII", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("ascii", "ASCII") },
  { name: "CHAR", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("char", "CHR") },
  { name: "LOWER", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("lower", "LOWER") },
  { name: "UPPER", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("upper", "UPPER") },
  { name: "TRIM", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("trim", "TRIM") },
  { name: "LTRIM", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("trimLeft", "LTRIM") },
  { name: "RTRIM", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("trimRight", "RTRIM") },
  { name: "LEN", kind: "scalar", minArgs: 1, maxArgs: 1, compile: dual("length", "LENGTH") },
  { name: "LEFT", kind: "scalar", minArgs: 2, maxArgs: 2, compile: dual("left", "LEFT") },
  { name: "RIGHT", kind: "scalar", minArgs: 2, maxArgs: 2, compile: dual("right", "RIGHT") },
  { name: "SUBSTR", kind: "scalar", minArgs: 2, maxArgs: 3, compile: dual("substring", "SUBSTRING") },
  { name: "FIND", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `position(${args[0]}, ${args[1]})` : `POSITION(${args[1]} IN ${args[0]})` },
  { name: "REPLACE", kind: "scalar", minArgs: 3, maxArgs: 3, compile: dual("replaceAll", "REPLACE") },
  { name: "SPACE", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `repeat(' ', ${args[0]})` : `repeat(' ', ${args[0]})` },
  { name: "CONTAINS", kind: "scalar", minArgs: 2, maxArgs: 2, compile: containsCompile },
  { name: "ICONTAINS", kind: "scalar", minArgs: 2, maxArgs: 2, compile: containsCompile },
  { name: "STARTSWITH", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => startsWithCompile(args, dialect, false) },
  { name: "ISTARTSWITH", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => startsWithCompile(args, dialect, true) },
  { name: "ENDSWITH", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => endsWithCompile(args, dialect, false) },
  { name: "IENDSWITH", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => endsWithCompile(args, dialect, true) },
  { name: "COALESCE", kind: "scalar", minArgs: 1, compile: dual("coalesce", "COALESCE") },
  { name: "NULLIF", kind: "scalar", minArgs: 2, maxArgs: 2, compile: dual("nullIf", "NULLIF") },
  { name: "REGEXP_MATCH", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `match(${args[0]}, ${args[1]})` : `(${args[0]} ~ ${args[1]})` },
  { name: "REGEXP_REPLACE", kind: "scalar", minArgs: 3, maxArgs: 3, compile: (args, dialect) => dialect === "clickhouse" ? `replaceRegexpAll(${args[0]}, ${args[1]}, ${args[2]})` : `regexp_replace(${args[0]}, ${args[1]}, ${args[2]}, 'g')` },
  { name: "REGEXP_EXTRACT", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `extract(${args[0]}, ${args[1]})` : `substring(${args[0]} from ${args[1]})` },

  // Datetime
  { name: "NOW", kind: "scalar", minArgs: 0, maxArgs: 0, compile: (_args, dialect) => dialect === "clickhouse" ? "now()" : (dialect === "mssql" ? "SYSDATETIME()" : "NOW()") },
  { name: "TODAY", kind: "scalar", minArgs: 0, maxArgs: 0, compile: (_args, dialect) => dialect === "clickhouse" ? "today()" : (dialect === "mssql" ? "CAST(GETDATE() AS DATE)" : "CURRENT_DATE") },
  { name: "DATETRUNC", kind: "scalar", minArgs: 2, maxArgs: 2, compile: dateTruncCompile },
  { name: "DATEADD", kind: "scalar", minArgs: 3, maxArgs: 3, compile: dateAddCompile },
  { name: "DATEDIFF", kind: "scalar", minArgs: 3, maxArgs: 3, compile: dateDiffCompile },
  { name: "DATEPART", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => {
    const unit = unitToken(args[0]);
    if (dialect === "clickhouse") return `datePart('${unit || "day"}', ${args[1]})`;
    if (dialect === "mssql") return `DATEPART(${(unit || "day").toUpperCase()}, ${args[1]})`;
    return `date_part('${unit || "day"}', ${args[1]})`;
  } },
  { name: "YEAR", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toYear(${args[0]})` : (dialect === "mssql" ? `DATEPART(YEAR, ${args[0]})` : `EXTRACT(YEAR FROM ${args[0]})`) },
  { name: "MONTH", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toMonth(${args[0]})` : (dialect === "mssql" ? `DATEPART(MONTH, ${args[0]})` : `EXTRACT(MONTH FROM ${args[0]})`) },
  { name: "DAY", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toDayOfMonth(${args[0]})` : (dialect === "mssql" ? `DATEPART(DAY, ${args[0]})` : `EXTRACT(DAY FROM ${args[0]})`) },
  { name: "WEEK", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toISOWeek(${args[0]})` : (dialect === "mssql" ? `DATEPART(WEEK, ${args[0]})` : `EXTRACT(WEEK FROM ${args[0]})`) },
  { name: "QUARTER", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toQuarter(${args[0]})` : (dialect === "mssql" ? `DATEPART(QUARTER, ${args[0]})` : `EXTRACT(QUARTER FROM ${args[0]})`) },
  { name: "HOUR", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dateExtractPart(args[0] ?? "", "hour", dialect) },
  { name: "MINUTE", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dateExtractPart(args[0] ?? "", "minute", dialect) },
  { name: "SECOND", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dateExtractPart(args[0] ?? "", "second", dialect) },
  { name: "DAYOFWEEK", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toDayOfWeek(${args[0]})` : (dialect === "mssql" ? `DATEPART(WEEKDAY, ${args[0]})` : `EXTRACT(DOW FROM ${args[0]})`) },

  // Type casts
  { name: "STR", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toString(${args[0]})` : (dialect === "mssql" ? `CAST(${args[0]} AS NVARCHAR(MAX))` : `CAST(${args[0]} AS TEXT)`) },
  { name: "INT", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toInt64(${args[0]})` : `CAST(${args[0]} AS BIGINT)` },
  { name: "FLOAT", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toFloat64(${args[0]})` : (dialect === "mssql" ? `CAST(${args[0]} AS FLOAT)` : `CAST(${args[0]} AS DOUBLE PRECISION)`) },
  { name: "DATE", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toDate(${args[0]})` : `CAST(${args[0]} AS DATE)` },
  { name: "DATETIME", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toDateTime(${args[0]})` : (dialect === "mssql" ? `CAST(${args[0]} AS DATETIME2)` : `CAST(${args[0]} AS TIMESTAMP)`) },
  { name: "BOOL", kind: "scalar", minArgs: 1, maxArgs: 1, compile: (args, dialect) => dialect === "clickhouse" ? `toUInt8(${args[0]})` : (dialect === "mssql" ? `CAST(${args[0]} AS BIT)` : `CAST(${args[0]} AS BOOLEAN)`) },
  { name: "DB_CAST", kind: "scalar", minArgs: 2, maxArgs: 2, compile: (args, dialect) => {
    const t = unitToken(args[1] ?? "text") || "text";
    if (dialect === "clickhouse") {
      if (t.includes("int")) return `toInt64(${args[0]})`;
      if (t.includes("float") || t.includes("double") || t.includes("numeric")) return `toFloat64(${args[0]})`;
      if (t.includes("date") && !t.includes("time")) return `toDate(${args[0]})`;
      if (t.includes("time")) return `toDateTime(${args[0]})`;
      return `toString(${args[0]})`;
    }
    return `CAST(${args[0]} AS ${String(stripQuotedLiteral(args[1] ?? "TEXT") || "TEXT").toUpperCase()})`;
  } },

  // Window/time-series placeholders (Block 2 will wrap with subquery layer)
  { name: "RSUM", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `SUM(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` },
  { name: "RAVG", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `AVG(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` },
  { name: "RMIN", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `MIN(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` },
  { name: "RMAX", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `MAX(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` },
  { name: "RCOUNT", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `COUNT(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` },
  { name: "MSUM", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `SUM(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN ${args[1]} PRECEDING AND CURRENT ROW)` },
  { name: "MAVG", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `AVG(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN ${args[1]} PRECEDING AND CURRENT ROW)` },
  { name: "MMIN", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `MIN(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN ${args[1]} PRECEDING AND CURRENT ROW)` },
  { name: "MMAX", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `MAX(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN ${args[1]} PRECEDING AND CURRENT ROW)` },
  { name: "MCOUNT", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `COUNT(${args[0]}) OVER (ORDER BY 1 ROWS BETWEEN ${args[1]} PRECEDING AND CURRENT ROW)` },
  { name: "RANK", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `RANK() OVER (ORDER BY ${args[0]} DESC)` },
  { name: "RANK_DENSE", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `DENSE_RANK() OVER (ORDER BY ${args[0]} DESC)` },
  { name: "RANK_UNIQUE", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `ROW_NUMBER() OVER (ORDER BY ${args[0]} DESC)` },
  { name: "RANK_PERCENTILE", kind: "window_ordered", minArgs: 1, maxArgs: 1, compile: (args) => `PERCENT_RANK() OVER (ORDER BY ${args[0]})` },
  { name: "LAG", kind: "window_ordered", minArgs: 1, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `lagInFrame(${args[0]}, ${args[1] ?? "1"}) OVER (ORDER BY 1)` : `LAG(${args[0]}, ${args[1] ?? "1"}) OVER (ORDER BY 1)` },
  { name: "AGO", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args) => `LAG(${args[0]}, ${args[1]}) OVER (ORDER BY 1)` },
  { name: "AT_DATE", kind: "window_ordered", minArgs: 2, maxArgs: 2, compile: (args, dialect) => dialect === "clickhouse" ? `lagInFrame(${args[0]}, ${args[1]}) OVER (ORDER BY 1)` : `LAG(${args[0]}, ${args[1]}) OVER (ORDER BY 1)` },
];

export function createFullFunctionRegistry(): FormulaFunctionRegistry {
  const byName = new Map<string, FormulaFunctionDef>();
  for (const def of DEF_LIST) {
    byName.set(normalizeFnName(def.name), def);
  }
  return {
    byName,
    list: DEF_LIST.slice().sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const FULL_FORMULA_REGISTRY = createFullFunctionRegistry();

export function getFormulaFunctionByName(name: string): FormulaFunctionDef | null {
  return FULL_FORMULA_REGISTRY.byName.get(normalizeFnName(name)) ?? null;
}
