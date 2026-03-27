export type TableColumnType = "number" | "date" | "string" | "unknown";

const DATE_LIKE_RE = /^\d{4}[-/]\d{2}[-/]\d{2}|^\d{2}[-/]\d{2}[-/]\d{4}/;
const DATE_NAME_RE = /date|time|timestamp|created|updated|period|day|month|year|dt$/i;

function isDateLike(s: string): boolean {
  if (!s) return false;
  if (DATE_LIKE_RE.test(s)) return true;
  if (/^\d{10,13}$/.test(s)) return true;
  const parsed = Date.parse(s);
  return !Number.isNaN(parsed) && s.length > 6;
}

export function detectTableColumnType(rows: unknown[][], colIdx: number, colName: string): TableColumnType {
  const sampleSize = Math.min(rows.length, 20);
  if (sampleSize === 0) return "unknown";

  let num = 0;
  let dt = 0;
  let total = 0;
  for (let i = 0; i < sampleSize; i++) {
    const v = (rows[i] as any)?.[colIdx];
    if (v == null || v === "") continue;
    total++;
    const s = String(v).trim();
    if (!s) continue;
    if (!Number.isNaN(Number(s))) {
      num++;
      continue;
    }
    if (isDateLike(s)) {
      dt++;
    }
  }

  if (total === 0) return "unknown";
  if (dt / total > 0.5 || (DATE_NAME_RE.test(colName) && dt > 0)) return "date";
  if (num / total > 0.6) return "number";
  return "string";
}

export function formatCellValue(value: unknown, colType: TableColumnType): string {
  if (value == null || value === "") return "";
  const raw = String(value);

  if (colType === "number") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return Number.isInteger(n)
        ? n.toLocaleString("en-US")
        : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
    }
  }

  if (colType === "date") {
    let d: Date | null = null;
    if (/^\d{10,13}$/.test(raw)) {
      const ts = raw.length >= 13 ? Number(raw) : Number(raw) * 1000;
      d = new Date(ts);
    } else {
      d = new Date(raw);
    }
    if (d && !Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  return raw;
}
