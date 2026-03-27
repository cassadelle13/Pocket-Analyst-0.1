export type PivotValueMode = "percent" | "absolute";

// Backward compatibility alias.
export type RetentionValueMode = PivotValueMode;

export type PivotResult = {
  cohorts: string[];
  periods: number[];
  values: number[][];
  cohortSizes?: number[];
  metricKeys?: string[];
};

// Backward compatibility alias.
export type RetentionResult = PivotResult;

function parsePeriodFromColumn(col: string): number | null {
  const raw = String(col ?? "").trim().toLowerCase();
  if (!raw) return null;

  const normalized = raw
    .replace(/_percent$/i, "")
    .replace(/_pct$/i, "")
    .replace(/_rate$/i, "");

  const patterns = [
    /^d(\d+)$/i,
    /^w(\d+)$/i,
    /^m(\d+)$/i,
    /^q(\d+)$/i,
    /^y(\d+)$/i,
    /^day_(\d+)$/i,
    /^week_(\d+)$/i,
    /^month_(\d+)$/i,
    /^quarter_(\d+)$/i,
    /^year_(\d+)$/i,
    /^period_(\d+)$/i,
    /^p_(\d+)$/i,
    /^p(\d+)$/i,
  ];

  for (const re of patterns) {
    const m = re.exec(normalized);
    if (!m) continue;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  const tail = /(\d+)$/.exec(normalized);
  if (!tail) return null;
  const n = Number(tail[1]);
  return Number.isFinite(n) ? n : null;
}

export function pivotResultFromWide(params: {
  columns: string[];
  rows: unknown[][];
}): PivotResult {
  const cols = Array.isArray(params.columns) ? params.columns.map((c) => String(c)) : [];
  const rows = Array.isArray(params.rows) ? params.rows : [];

  const cohortDateIdx = cols.findIndex((c) => c === "cohort_date");
  if (cohortDateIdx < 0) {
    throw new Error("Retention result missing column cohort_date");
  }

  const cohortSizeIdx = cols.findIndex((c) => c === "cohort_size");

  // DataLens-style: X is cohort_date, and every numeric column (except cohort_size) is a series.
  // This allows mixing absolute and percent columns together.
  const metricCols: Array<{ idx: number; name: string; period: number | null; percent: boolean }> = [];
  for (let i = 0; i < cols.length; i++) {
    const name = cols[i];
    if (name === "cohort_date" || name === "cohort_size") continue;
    // numeric heuristic: look at first non-null value
    let sample: unknown = null;
    for (const r of rows) {
      const v = (r as any)?.[i];
      if (v === null || v === undefined) continue;
      sample = v;
      break;
    }
    const n = Number(sample);
    if (!Number.isFinite(n)) continue;
    const lowered = String(name ?? "").toLowerCase();
    const percent = lowered.endsWith("_percent") || lowered.endsWith("_pct") || lowered.endsWith("_rate");
    metricCols.push({ idx: i, name, period: parsePeriodFromColumn(name), percent });
  }

  // Deterministic ordering:
  // 1) columns that look like dN / dN_percent by N
  // 2) then by name
  metricCols.sort((a, b) => {
    const ap = a.period;
    const bp = b.period;
    if (ap != null && bp != null && ap !== bp) return ap - bp;
    if (ap != null && bp == null) return -1;
    if (ap == null && bp != null) return 1;
    if (a.percent !== b.percent) return a.percent ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const periods = metricCols.map((m, i) => (m.period != null ? m.period : i));
  const metricKeys = metricCols.map((m) => m.name);

  const cohorts: string[] = [];
  const values: number[][] = [];
  const cohortSizes: number[] = [];

  for (const r of rows) {
    const cohort = String((r as any)?.[cohortDateIdx] ?? "").trim();
    if (!cohort) continue;

    const sizeRaw = cohortSizeIdx >= 0 ? (r as any)?.[cohortSizeIdx] : null;
    const sizeNum = Number(sizeRaw);
    const cohortSize = Number.isFinite(sizeNum) ? sizeNum : 0;

    const rowVals = metricCols.map((mc) => {
      const raw = (r as any)?.[mc.idx];
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    });

    cohorts.push(cohort);
    values.push(rowVals);
    cohortSizes.push(cohortSize);
  }

  return { cohorts, periods, values, cohortSizes, metricKeys };
}

// Backward compatibility alias.
export const retentionResultFromWide = pivotResultFromWide;
