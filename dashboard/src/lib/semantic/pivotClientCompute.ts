import type { PivotResult } from "./retentionResult";

export type PivotComputeUnit = "day" | "week" | "month" | "quarter" | "year";

type PivotComputeParams = {
  rows: unknown[][];
  columns: string[];
  cohortField: string;
  activityField: string;
  userField?: string;
  usersField?: string;
  unit: PivotComputeUnit;
  requestedPeriods?: number[];
  maxRows?: number;
};

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseUtcDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfUtcQuarter(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
}

function startOfUtcYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function startOfUtcIsoWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = ((day.getUTCDay() + 6) % 7) + 1;
  return new Date(day.getTime() - (dow - 1) * 24 * 60 * 60 * 1000);
}

function toPeriodIndex(unit: PivotComputeUnit, raw: unknown): { key: string; idx: number } | null {
  const d0 = parseUtcDate(raw);
  if (!d0) return null;
  if (unit === "week") {
    const d = startOfUtcIsoWeek(d0);
    return { key: d.toISOString().slice(0, 10), idx: Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000)) };
  }
  if (unit === "month") {
    const d = startOfUtcMonth(d0);
    return { key: d.toISOString().slice(0, 10), idx: d.getUTCFullYear() * 12 + d.getUTCMonth() };
  }
  if (unit === "quarter") {
    const d = startOfUtcQuarter(d0);
    return { key: d.toISOString().slice(0, 10), idx: d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) };
  }
  if (unit === "year") {
    const d = startOfUtcYear(d0);
    return { key: d.toISOString().slice(0, 10), idx: d.getUTCFullYear() };
  }
  const d = startOfUtcDay(d0);
  return { key: d.toISOString().slice(0, 10), idx: Math.floor(d.getTime() / (24 * 60 * 60 * 1000)) };
}

export function computePivotResultSync(params: PivotComputeParams): PivotResult & { lineChartData: { cols: string[]; rows: unknown[][] } } {
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const columns = Array.isArray(params.columns) ? params.columns.map((c) => String(c)) : [];
  const indexByCol = new Map<string, number>();
  for (let i = 0; i < columns.length; i++) indexByCol.set(columns[i], i);
  const getIdx = (ref: string): number => {
    const direct = indexByCol.get(ref);
    if (typeof direct === "number") return direct;
    const last = ref.includes(".") ? String(ref.split(".").pop() ?? "") : ref;
    return indexByCol.get(last) ?? -1;
  };

  const cohortIdx = getIdx(String(params.cohortField ?? ""));
  const activityIdx = getIdx(String(params.activityField ?? ""));
  const userIdx = params.userField ? getIdx(String(params.userField)) : -1;
  const usersIdx = params.usersField ? getIdx(String(params.usersField)) : -1;
  if (cohortIdx < 0 || activityIdx < 0) throw new Error("Cohort/activity column not found");

  const maxRows = Math.max(1, Math.min(200_000, Number(params.maxRows ?? 50_000)));
  const srcRows = rows.slice(0, maxRows);
  const reqPeriods = Array.isArray(params.requestedPeriods)
    ? params.requestedPeriods.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0)
    : [];

  const deltas = new Set<number>();
  for (const r of srcRows) {
    const ck = toPeriodIndex(params.unit, (r as any)?.[cohortIdx]);
    const ak = toPeriodIndex(params.unit, (r as any)?.[activityIdx]);
    if (!ck || !ak) continue;
    const d = ak.idx - ck.idx;
    if (Number.isFinite(d) && d >= 0) deltas.add(d);
  }
  const periods = Array.from(new Set<number>([...reqPeriods, ...Array.from(deltas)])).sort((a, b) => a - b);
  const periodList = periods.length ? periods : [0];
  const periodSet = new Set<number>(periodList);

  const cohortUsers = new Map<string, Set<string>>();
  const activeUsers = new Map<string, Map<number, Set<string>>>();
  const activeCounts = new Map<string, Map<number, number>>();

  for (const r of srcRows) {
    const ck = toPeriodIndex(params.unit, (r as any)?.[cohortIdx]);
    const ak = toPeriodIndex(params.unit, (r as any)?.[activityIdx]);
    if (!ck || !ak) continue;
    const p = ak.idx - ck.idx;
    if (!Number.isFinite(p) || p < 0 || !periodSet.has(p)) continue;
    if (userIdx >= 0) {
      const uid = String((r as any)?.[userIdx] ?? "").trim();
      if (!uid) continue;
      if (!cohortUsers.has(ck.key)) cohortUsers.set(ck.key, new Set());
      cohortUsers.get(ck.key)!.add(uid);
      if (!activeUsers.has(ck.key)) activeUsers.set(ck.key, new Map());
      const byP = activeUsers.get(ck.key)!;
      if (!byP.has(p)) byP.set(p, new Set());
      byP.get(p)!.add(uid);
    } else if (usersIdx >= 0) {
      if (!activeCounts.has(ck.key)) activeCounts.set(ck.key, new Map());
      const byP = activeCounts.get(ck.key)!;
      byP.set(p, (byP.get(p) ?? 0) + safeNumber((r as any)?.[usersIdx]));
    }
  }

  const cohorts = Array.from(new Set([...cohortUsers.keys(), ...activeCounts.keys()])).sort((a, b) => a.localeCompare(b));
  const cohortSizes = cohorts.map((c) => (userIdx >= 0 ? (cohortUsers.get(c)?.size ?? 0) : 0));
  const abs = cohorts.map((c) => {
    if (userIdx >= 0) {
      const byP = activeUsers.get(c) ?? new Map<number, Set<string>>();
      return periodList.map((p) => byP.get(p)?.size ?? 0);
    }
    const byP = activeCounts.get(c) ?? new Map<number, number>();
    return periodList.map((p) => safeNumber(byP.get(p) ?? 0));
  });
  const pct = abs.map((row, i) => {
    const d = cohortSizes[i] ?? 0;
    return row.map((v) => (d > 0 ? v / d : 0));
  });

  const metricKeys = [...periodList.map((p) => `d${p}`), ...periodList.map((p) => `d${p}_percent`)];
  const values = cohorts.map((_, i) => [...abs[i], ...pct[i]]);
  const lineChartData = {
    cols: ["cohort_date", "cohort_size", ...metricKeys],
    rows: cohorts.map((c, i) => [c, cohortSizes[i] ?? 0, ...values[i]]),
  };
  return { cohorts, periods: periodList, values, cohortSizes, metricKeys, lineChartData };
}
