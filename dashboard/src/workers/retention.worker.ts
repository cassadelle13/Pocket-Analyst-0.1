export type PivotWorkerUnit = "day" | "week" | "month" | "quarter" | "year";

// Backward compatibility alias.
export type RetentionWorkerUnit = PivotWorkerUnit;

export type PivotWorkerRequest = {
  type: "COMPUTE_PIVOT" | "COMPUTE_RETENTION";
  taskId: string;
  payload: {
    rows: unknown[][];
    columns: string[];
    cohortField: string;
    activityField: string;
    userField?: string;
    usersField?: string;
    unit: PivotWorkerUnit;
    requestedPeriods?: number[];
    maxRows?: number;
  };
};

// Backward compatibility alias.
export type RetentionWorkerRequest = PivotWorkerRequest;

export type PivotWorkerResponse =
  | { type: "PIVOT_RESULT" | "RETENTION_RESULT"; taskId: string; payload: any }
  | { type: "PIVOT_ERROR" | "RETENTION_ERROR"; taskId: string; error: string };

// Backward compatibility alias.
export type RetentionWorkerResponse = PivotWorkerResponse;

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseUtcDate(raw: unknown): Date | null {
  try {
    if (raw == null) return null;
    if (raw instanceof Date) return raw;
    const s = String(raw).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfUtcMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfUtcQuarter(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
}
function startOfUtcYear(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}
function startOfUtcIsoWeek(d: Date) {
  const day = startOfUtcDay(d);
  const dow = ((day.getUTCDay() + 6) % 7) + 1;
  const deltaDays = dow - 1;
  return new Date(day.getTime() - deltaDays * 24 * 60 * 60 * 1000);
}

function toPeriodKey(unit: PivotWorkerUnit, raw: unknown): { key: string; idx: number } | null {
  const d0 = parseUtcDate(raw);
  if (!d0) return null;
  const u = String(unit ?? "day").toLowerCase();
  if (u === "week") {
    const d = startOfUtcIsoWeek(d0);
    const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    const idx = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    return { key, idx };
  }
  if (u === "month") {
    const d = startOfUtcMonth(d0);
    const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
    const idx = d.getUTCFullYear() * 12 + d.getUTCMonth();
    return { key, idx };
  }
  if (u === "quarter") {
    const d = startOfUtcQuarter(d0);
    const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
    const idx = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
    return { key, idx };
  }
  if (u === "year") {
    const d = startOfUtcYear(d0);
    const key = `${d.getUTCFullYear()}-01-01`;
    const idx = d.getUTCFullYear();
    return { key, idx };
  }
  const d = startOfUtcDay(d0);
  const key = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const idx = Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
  return { key, idx };
}

self.onmessage = (event: MessageEvent<PivotWorkerRequest>) => {
  const msg = event.data;
  if (!msg || (msg.type !== "COMPUTE_PIVOT" && msg.type !== "COMPUTE_RETENTION")) return;
  const legacyResponse = msg.type === "COMPUTE_RETENTION";

  const { taskId, payload } = msg;
  try {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const columns = Array.isArray(payload?.columns) ? payload.columns.map((c) => String(c)) : [];
    const colIdx = new Map<string, number>();
    for (let i = 0; i < columns.length; i++) colIdx.set(String(columns[i]), i);

    const getIdx = (refOrAlias: string): number => {
      const direct = colIdx.get(refOrAlias);
      if (typeof direct === "number") return direct;
      const last = refOrAlias.includes(".") ? (refOrAlias.split(".").pop() as string) : refOrAlias;
      const byLast = colIdx.get(last);
      if (typeof byLast === "number") return byLast;
      return -1;
    };

    const cohortField = String(payload?.cohortField ?? "").trim();
    const activityField = String(payload?.activityField ?? "").trim();
    const userField = String(payload?.userField ?? "").trim();
    const usersField = String(payload?.usersField ?? "").trim();
    const unit = (String(payload?.unit ?? "day").trim().toLowerCase() as PivotWorkerUnit) || "day";

    if (!cohortField || !activityField) {
      const resp: PivotWorkerResponse = { type: legacyResponse ? "RETENTION_ERROR" : "PIVOT_ERROR", taskId, error: "Missing required fields" };
      self.postMessage(resp);
      return;
    }

    const cohortIdx = getIdx(cohortField);
    const activityIdx = getIdx(activityField);
    const userIdx = userField ? getIdx(userField) : -1;
    const usersIdx = usersField ? getIdx(usersField) : -1;

    if (cohortIdx < 0 || activityIdx < 0) {
      const resp: PivotWorkerResponse = { type: legacyResponse ? "RETENTION_ERROR" : "PIVOT_ERROR", taskId, error: "Cohort/activity column not found" };
      self.postMessage(resp);
      return;
    }

    const maxRows = Math.max(1, Math.min(200_000, Number(payload?.maxRows ?? 50_000)));
    const srcRows = rows.slice(0, maxRows);

    const requestedPeriods: number[] = Array.isArray(payload?.requestedPeriods)
      ? payload.requestedPeriods.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n >= 0)
      : [];

    // Discover deltas
    const deltas: number[] = [];
    {
      const seen = new Set<number>();
      for (const r of srcRows) {
        const ck = toPeriodKey(unit, (r as any)?.[cohortIdx]);
        const ak = toPeriodKey(unit, (r as any)?.[activityIdx]);
        if (!ck || !ak) continue;
        const d = ak.idx - ck.idx;
        if (!Number.isFinite(d) || d < 0) continue;
        if (!seen.has(d)) {
          seen.add(d);
          deltas.push(d);
        }
      }
      deltas.sort((a, b) => a - b);
    }

    const periodsSorted = (() => {
      if (requestedPeriods.length > 0) {
        const s = new Set<number>(requestedPeriods.concat(deltas));
        return Array.from(s)
          .filter((n) => Number.isFinite(n) && n >= 0)
          .sort((a, b) => a - b);
      }
      const maxDelta = deltas.length > 0 ? Math.max(...deltas) : 0;
      const cap = Math.max(0, Math.min(60, Number.isFinite(maxDelta) ? maxDelta : 0));
      const out: number[] = [];
      for (let i = 0; i <= cap; i++) out.push(i);
      return out;
    })();

    const periodsSet = new Set<number>(periodsSorted);

    const cohortUsers = new Map<string, Set<string>>();
    const activeUsersByCohortPeriod = new Map<string, Map<number, Set<string>>>();
    const usersByCohortPeriod = new Map<string, Map<number, number>>();

    for (const r of srcRows) {
      const ck = toPeriodKey(unit, (r as any)?.[cohortIdx]);
      const ak = toPeriodKey(unit, (r as any)?.[activityIdx]);
      const cohortDay = ck?.key ?? "";
      const activityDay = ak?.key ?? "";
      if (!cohortDay || !activityDay) continue;

      const uid = userIdx >= 0 ? String((r as any)?.[userIdx] ?? "").trim() : "";
      const usersVal = usersIdx >= 0 ? safeNumber((r as any)?.[usersIdx]) : 0;
      if (userIdx >= 0 && !uid) continue;

      const p = (ck && ak) ? (ak.idx - ck.idx) : NaN;
      if (!Number.isFinite(p) || p < 0) continue;
      if (!periodsSet.has(p)) continue;

      if (userIdx >= 0) {
        if (!cohortUsers.has(cohortDay)) cohortUsers.set(cohortDay, new Set());
        cohortUsers.get(cohortDay)!.add(uid);

        if (!activeUsersByCohortPeriod.has(cohortDay)) activeUsersByCohortPeriod.set(cohortDay, new Map());
        const perMap = activeUsersByCohortPeriod.get(cohortDay)!;
        if (!perMap.has(p)) perMap.set(p, new Set());
        perMap.get(p)!.add(uid);
      } else if (usersIdx >= 0) {
        if (!usersByCohortPeriod.has(cohortDay)) usersByCohortPeriod.set(cohortDay, new Map());
        const per = usersByCohortPeriod.get(cohortDay)!;
        per.set(p, (per.get(p) ?? 0) + usersVal);
      }
    }

    const cohorts = Array.from((userIdx >= 0 ? cohortUsers.keys() : usersByCohortPeriod.keys())).sort((a, b) => a.localeCompare(b));
    const cohortSizes = cohorts.map((c) => (userIdx >= 0 ? (cohortUsers.get(c)?.size ?? 0) : 0));

    const valuesAbs: number[][] = cohorts.map((c, i) => {
      if (userIdx >= 0) {
        const perMap = activeUsersByCohortPeriod.get(c) ?? new Map();
        return periodsSorted.map((p) => perMap.get(p)?.size ?? 0);
      }
      const per = usersByCohortPeriod.get(c) ?? new Map();
      return periodsSorted.map((p) => safeNumber(per.get(p) ?? 0));
    });

    const valuesPct: number[][] = valuesAbs.map((row, i) => {
      const denom = (cohortSizes[i] ?? 0);
      return row.map((v) => (denom > 0 ? v / denom : 0));
    });

    const metricKeys = [
      ...periodsSorted.map((p) => `d${p}`),
      ...periodsSorted.map((p) => `d${p}_percent`),
    ];
    const valuesWide: number[][] = cohorts.map((_, i) => [...valuesAbs[i], ...valuesPct[i]]);

    // Pre-format data for line/area charts to avoid sync computation on main thread
    const lineChartData = {
      cols: ["cohort_date", "cohort_size", ...metricKeys],
      rows: cohorts.map((c: string, i: number) => {
        const size = Number(cohortSizes?.[i] ?? 0);
        const sizeNum = Number.isFinite(size) ? size : 0;
        const vrow = Array.isArray(valuesWide[i]) ? valuesWide[i] : [];
        return [c, sizeNum, ...vrow];
      }),
    };

    const resp: PivotWorkerResponse = {
      type: legacyResponse ? "RETENTION_RESULT" : "PIVOT_RESULT",
      taskId,
      payload: {
        cohorts,
        periods: periodsSorted,
        values: valuesWide,
        cohortSizes,
        metricKeys,
        lineChartData,
        debug: {
          usedRows: srcRows.length,
          maxRows,
        },
      },
    };
    self.postMessage(resp);
  } catch (e: any) {
    const resp: PivotWorkerResponse = {
      type: legacyResponse ? "RETENTION_ERROR" : "PIVOT_ERROR",
      taskId,
      error: e instanceof Error ? e.message : "Pivot compute failed",
    };
    self.postMessage(resp);
  }
};
