"use client";

import { useEffect, useState } from "react";
import { Card, Grid, Metric, Text } from "@tremor/react";

type Metrics = {
  eventsPerMin: number;
  activeUsers: number;
  p95LatencyMs: number;
  errorRatePct: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function RealTimeMetrics() {
  const [m, setM] = useState<Metrics>({
    eventsPerMin: 1280,
    activeUsers: 234,
    p95LatencyMs: 245,
    errorRatePct: 0.8,
  });

  useEffect(() => {
    const t = window.setInterval(() => {
      setM((prev: Metrics) => ({
        eventsPerMin: clamp(Math.round(prev.eventsPerMin + (Math.random() - 0.5) * 120), 100, 8000),
        activeUsers: clamp(Math.round(prev.activeUsers + (Math.random() - 0.5) * 18), 1, 5000),
        p95LatencyMs: clamp(Math.round(prev.p95LatencyMs + (Math.random() - 0.5) * 45), 40, 2000),
        errorRatePct: clamp(Math.round((prev.errorRatePct + (Math.random() - 0.5) * 0.2) * 10) / 10, 0, 15),
      }));
    }, 1500);

    return () => window.clearInterval(t);
  }, []);

  return (
    <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-6">
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
        <Text className="text-slate-300 text-sm">Events / min</Text>
        <Metric className="text-white">{m.eventsPerMin.toLocaleString()}</Metric>
      </Card>
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
        <Text className="text-slate-300 text-sm">Active users</Text>
        <Metric className="text-white">{m.activeUsers.toLocaleString()}</Metric>
      </Card>
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
        <Text className="text-slate-300 text-sm">p95 latency</Text>
        <Metric className="text-white">{m.p95LatencyMs}ms</Metric>
      </Card>
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
        <Text className="text-slate-300 text-sm">Error rate</Text>
        <Metric className="text-white">{m.errorRatePct}%</Metric>
      </Card>
    </Grid>
  );
}
