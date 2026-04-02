/**
 * Physical SQL type helpers for chart column pickers (ColumnMappingPanel, DragDropCanvas).
 * Intentionally separate from schema-intelligence/typeClassifier to avoid changing semantic bootstrap behavior.
 */

const MEASURE_TYPES = new Set([
  "int",
  "integer",
  "int2",
  "int4",
  "int8",
  "int16",
  "int32",
  "int64",
  "int128",
  "int256",
  "smallint",
  "mediumint",
  "bigint",
  "tinyint",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "uint128",
  "uint256",
  "float",
  "float32",
  "float64",
  "double",
  "real",
  "decimal",
  "numeric",
  "number",
  "decimal32",
  "decimal64",
  "decimal128",
  "decimal256",
]);

const TIME_TYPES = new Set([
  "date",
  "datetime",
  "timestamp",
  "time",
  "timestamptz",
  "datetime2",
  "smalldatetime",
  "datetimeoffset",
  "datetime64",
  "date32",
]);

function stripWrappedType(input: string, wrapperPrefix: string): string | null {
  const s = input.trim();
  const low = s.toLowerCase();
  const p = `${wrapperPrefix.toLowerCase()}(`;
  if (!low.startsWith(p)) return null;
  let depth = 0;
  const start = p.length;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) return s.slice(start, i).trim();
      depth--;
    }
  }
  return null;
}

function unwrapSimpleAggregateFunction(s: string): string {
  const inner = stripWrappedType(s.trim(), "simpleaggregatefunction");
  if (inner == null) return s;
  let depth = 0;
  let lastComma = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) lastComma = i;
  }
  if (lastComma < 0) return inner.trim();
  return inner.slice(lastComma + 1).trim();
}

/**
 * Normalize DB type string for set lookups (unwrap CH wrappers, strip size params).
 */
export function normalizeSqlType(sqlType: string): string {
  let s = String(sqlType ?? "").trim();
  if (!s) return "";

  let guard = 0;
  while (guard++ < 16) {
    let changed = false;
    const n1 = stripWrappedType(s, "nullable");
    if (n1 != null) {
      s = n1;
      changed = true;
    } else {
      const n2 = stripWrappedType(s, "lowcardinality");
      if (n2 != null) {
        s = n2;
        changed = true;
      } else {
        const n3 = unwrapSimpleAggregateFunction(s);
        if (n3 !== s) {
          s = n3;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, "")
    .replace(/nullable/g, "")
    .trim();
}

export function isNumericSqlType(sqlType: string | undefined): boolean {
  const normalized = normalizeSqlType(String(sqlType ?? ""));
  if (!normalized) return false;
  if (MEASURE_TYPES.has(normalized)) return true;
  if (normalized.includes("interval")) return false;
  if (normalized.includes("int")) return true;
  if (
    normalized.includes("float") ||
    normalized.includes("decimal") ||
    normalized.includes("numeric") ||
    normalized.includes("double") ||
    normalized.includes("real")
  ) {
    return true;
  }
  if (normalized.includes("money")) return true;
  return false;
}

export function isDateSqlType(sqlType: string | undefined): boolean {
  const raw = String(sqlType ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (/(varchar|char|text|enum|string)/.test(raw) && !/(datetime|timestamp)/.test(raw)) return false;
  const normalized = normalizeSqlType(String(sqlType ?? ""));
  if (TIME_TYPES.has(normalized)) return true;
  if (!normalized) return false;
  return /(date|time)/.test(normalized) && !/(varchar|char|text)/.test(normalized);
}

export type PhysicalKind = "number" | "date" | "string";

export function chartInferPhysicalKind(type?: string): PhysicalKind {
  const raw = String(type ?? "").trim();
  if (!raw) return "string";
  if (isDateSqlType(raw)) return "date";
  if (isNumericSqlType(raw)) return "number";
  return "string";
}

export type MeasureAggDefault = "SUM" | "COUNT";

export function defaultAggForMeasureType(type?: string): MeasureAggDefault {
  return isNumericSqlType(type) ? "SUM" : "COUNT";
}
