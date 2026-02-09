export type WorkerRequest = {
  id: string;
  type: "transform_sankey" | "filter_events" | "calculate_forecast" | "process_retention";
  payload: any;
};

export type WorkerResponse = {
  id: string;
  payload: any;
  error?: string;
};

function ok(id: string, payload: any): WorkerResponse {
  return { id, payload };
}

function fail(id: string, error: string): WorkerResponse {
  return { id, payload: null, error };
}

function transformSankey(flows: any[]): { nodes: any[]; links: any[] } {
  const nodesMap = new Map<string, { name: string }>();
  const links: Array<{ source: string; target: string; value: number }> = [];

  for (const f of flows ?? []) {
    const source = String((f as any)?.source ?? (f as any)?.from ?? "");
    const target = String((f as any)?.target ?? (f as any)?.to ?? "");
    const value = Number((f as any)?.value ?? (f as any)?.count ?? 1);
    if (!source || !target) continue;

    if (!nodesMap.has(source)) nodesMap.set(source, { name: source });
    if (!nodesMap.has(target)) nodesMap.set(target, { name: target });
    links.push({ source, target, value: Number.isFinite(value) ? value : 1 });
  }

  return { nodes: Array.from(nodesMap.values()), links };
}

function filterEvents(events: any[], filters: any): any[] {
  const q = (filters ?? {}) as { eventName?: string; userId?: string; source?: string };
  const eventName = String(q.eventName ?? "").toLowerCase().trim();
  const userId = String(q.userId ?? "").toLowerCase().trim();
  const source = String(q.source ?? "").toLowerCase().trim();

  return (events ?? []).filter((e) => {
    const name = String(e?.event_name ?? e?.eventName ?? "").toLowerCase();
    const user = String(e?.user_id ?? e?.userId ?? "").toLowerCase();
    let src = "";
    try {
      const p = typeof e?.properties === "string" ? JSON.parse(e.properties) : e?.properties;
      src = String(p?.source ?? "").toLowerCase();
    } catch {
      src = "";
    }

    if (eventName && !name.includes(eventName)) return false;
    if (userId && !user.includes(userId)) return false;
    if (source && src !== source) return false;
    return true;
  });
}

function calculateForecast(historicalData: any[], forecastDays: number): any[] {
  const arr = historicalData ?? [];
  const n = arr.length;
  if (n === 0) return [];

  const points = Math.max(1, Math.min(60, Number(forecastDays ?? 7)));
  const last = arr[n - 1];
  const lastTs = Number(last?.ts ?? Date.now());
  const step = 24 * 60 * 60 * 1000;

  const lastVal = Number(last?.value ?? last?.revenue ?? last?.events ?? 0);
  const prevVal = n >= 2 ? Number(arr[n - 2]?.value ?? arr[n - 2]?.revenue ?? arr[n - 2]?.events ?? lastVal) : lastVal;
  const delta = lastVal - prevVal;

  const out: any[] = [];
  for (let i = 1; i <= points; i++) {
    out.push({ ts: lastTs + i * step, value: Math.max(0, Math.round((lastVal + delta * i) * 100) / 100) });
  }
  return out;
}

function processRetention(cohorts: any[]): any[] {
  // Keep as-is; UI components can transform further.
  return Array.isArray(cohorts) ? cohorts : [];
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.type) {
      case "transform_sankey":
        ctx.postMessage(ok(req.id, transformSankey(req.payload?.flows ?? req.payload ?? [])));
        return;
      case "filter_events":
        ctx.postMessage(ok(req.id, filterEvents(req.payload?.events ?? [], req.payload?.filters ?? {})));
        return;
      case "calculate_forecast":
        ctx.postMessage(ok(req.id, calculateForecast(req.payload?.historicalData ?? [], req.payload?.forecastDays ?? 7)));
        return;
      case "process_retention":
        ctx.postMessage(ok(req.id, processRetention(req.payload?.cohorts ?? req.payload ?? [])));
        return;
      default:
        ctx.postMessage(fail(req.id, "Unknown worker request type"));
        return;
    }
  } catch (e: unknown) {
    ctx.postMessage(fail(req.id, e instanceof Error ? e.message : "Worker error"));
  }
};
