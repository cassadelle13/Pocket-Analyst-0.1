type QueryMetricEntry = {
  count: number;
  errors: number;
  slow: number;
  totalMs: number;
  maxMs: number;
};

type QueryMetricStore = {
  startedAt: number;
  byRoute: Record<string, QueryMetricEntry>;
};

const SLOW_QUERY_MS = Math.max(50, Number(process.env.SLOW_QUERY_MS ?? "1200") || 1200);

const store: QueryMetricStore = {
  startedAt: Date.now(),
  byRoute: {},
};

function ensureRoute(route: string): QueryMetricEntry {
  const key = String(route ?? "").trim() || "unknown";
  if (!store.byRoute[key]) {
    store.byRoute[key] = { count: 0, errors: 0, slow: 0, totalMs: 0, maxMs: 0 };
  }
  return store.byRoute[key];
}

export function createRequestId(prefix: string): string {
  const left = Date.now().toString(36);
  const right = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${left}_${right}`;
}

export function logQueryEvent(level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const s = JSON.stringify(line);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(s);
    return;
  }
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(s);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(s);
}

export function recordQueryMetric(params: {
  route: string;
  durationMs: number;
  ok: boolean;
  correlationId?: string;
  extra?: Record<string, unknown>;
}): void {
  const route = String(params.route ?? "").trim() || "unknown";
  const durationMs = Math.max(0, Number(params.durationMs) || 0);
  const entry = ensureRoute(route);
  entry.count += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  if (!params.ok) entry.errors += 1;
  if (durationMs >= SLOW_QUERY_MS) {
    entry.slow += 1;
    logQueryEvent("warn", "slow_query", {
      route,
      durationMs,
      correlationId: params.correlationId ?? null,
      ...(params.extra ?? {}),
    });
  }
}

export function getQueryMetricsSnapshot(): {
  startedAt: string;
  uptimeSec: number;
  slowQueryThresholdMs: number;
  routes: Array<{
    route: string;
    count: number;
    errors: number;
    slow: number;
    avgMs: number;
    maxMs: number;
    errorRate: number;
  }>;
  prometheus: string;
} {
  const now = Date.now();
  const routes = Object.entries(store.byRoute).map(([route, v]) => {
    const avgMs = v.count > 0 ? v.totalMs / v.count : 0;
    const errorRate = v.count > 0 ? v.errors / v.count : 0;
    return {
      route,
      count: v.count,
      errors: v.errors,
      slow: v.slow,
      avgMs,
      maxMs: v.maxMs,
      errorRate,
    };
  });
  const lines: string[] = [];
  for (const r of routes) {
    const baseLabels = `{route="${r.route.replace(/"/g, "'")}"}`;
    lines.push(`pocketanalyst_query_requests_total${baseLabels} ${r.count}`);
    lines.push(`pocketanalyst_query_errors_total${baseLabels} ${r.errors}`);
    lines.push(`pocketanalyst_query_slow_total${baseLabels} ${r.slow}`);
    lines.push(`pocketanalyst_query_duration_avg_ms${baseLabels} ${r.avgMs}`);
    lines.push(`pocketanalyst_query_duration_max_ms${baseLabels} ${r.maxMs}`);
  }
  return {
    startedAt: new Date(store.startedAt).toISOString(),
    uptimeSec: Math.floor((now - store.startedAt) / 1000),
    slowQueryThresholdMs: SLOW_QUERY_MS,
    routes,
    prometheus: lines.join("\n"),
  };
}
