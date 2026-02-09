"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Text, Title } from "@tremor/react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { InsightSparkline } from "./InsightSparkline";
import { ShimmerInsightCard } from "../../components/ui";
import { useDemoMode } from "../../context/DemoContext";
import { generateMockInsights } from "../../lib/mockGenerator";

type InsightHistoryItem = {
  id: string;
  ts: string;
  title: string;
  status: "good" | "warn" | "bad" | "info";
  summary: string;
  trend: Array<{ ts: number; value: number }>;
};

type Props = {
  days?: number;
  onItemClick?: (item: InsightHistoryItem) => void;
};

function StatusIcon({ status }: { status: InsightHistoryItem["status"] }) {
  const cls = "h-5 w-5";
  switch (status) {
    case "good":
      return <CheckCircle2 className={`${cls} text-lime-400`} />;
    case "warn":
      return <AlertTriangle className={`${cls} text-amber-400`} />;
    case "bad":
      return <XCircle className={`${cls} text-rose-400`} />;
    default:
      return <Info className={`${cls} text-slate-300`} />;
  }
}

function SkeletonCard({ i }: { i: number }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 overflow-hidden"
      style={{ animationDelay: `${i * 90}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-0.5 h-5 w-5 rounded bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-white/10" />
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-5/6 rounded bg-white/10" />
          </div>
        </div>
        <div className="h-9 w-28 rounded bg-white/10" />
      </div>
      <div className="mt-3 h-3 w-24 rounded bg-white/10" />
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

export function InsightFeed({ days = 3, onItemClick }: Props) {
  const [items, setItems] = useState<InsightHistoryItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const { isDemoMode } = useDemoMode();

  useEffect(() => {
    if (isDemoMode) {
      const mockInsights = generateMockInsights();
      const demoItems = mockInsights.map((insight, idx) => ({
        id: `demo-${idx}`,
        ts: insight.timestamp,
        title: insight.question,
        status: "info" as const,
        summary: insight.answer,
        trend: insight.sparkline ?? [],
      }));
      setItems(demoItems);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const res = await fetch(`/api/insights/history?days=${days}&fill_missing=true`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { data: InsightHistoryItem[] };
        if (!cancelled) {
          setItems(Array.isArray(json.data) ? json.data : []);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [days, isDemoMode]);

  const header = useMemo(
    () => (
      <div className="flex items-end justify-between gap-6">
        <div>
          <Title className="text-white">Insights</Title>
          <Text className="text-slate-300 mt-1">Последние 3 дня: краткий AI-дайджест по метрикам и аномалиям.</Text>
        </div>
        <div className="text-xs text-slate-400">Accent: Lime-400</div>
      </div>
    ),
    [],
  );

  return (
    <div className="space-y-5">
      {header}

      {status === "loading" && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <ShimmerInsightCard />
            </motion.div>
          ))}
        </div>
      )}

      {/* Actual content */}
      {status === "ready" && items.length > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
              },
            },
          }}
          className="space-y-3"
        >
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onItemClick?.(item)}
              className="cursor-pointer"
            >
              <Card className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 overflow-hidden shadow-xl hover:shadow-2xl transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <StatusIcon status={item.status} />
                    <div className="flex-1 space-y-2">
                      <Text className="text-white font-medium">{item.title}</Text>
                      <Text className="text-slate-300 text-sm">{item.summary}</Text>
                    </div>
                  </div>
                  <div className="w-24 h-12">
                    <InsightSparkline points={item.trend} />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
