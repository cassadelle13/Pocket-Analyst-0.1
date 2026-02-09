"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, TrendingDown, TrendingUp, AlertTriangle, Zap, Loader2 } from "lucide-react";

export type InsightTone = "critical" | "warning" | "success" | "tip" | "info";

export interface AIInsight {
  id: string;
  type: InsightTone;
  title: string;
  message: string;
  metric?: string;
  change?: number;
  action?: string;
  timestamp: string;
}

interface AIInsightCardProps {
  insight: AIInsight;
  isActive?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
}

const gradientFrame =
  "relative overflow-hidden rounded-2xl bg-gradient-to-br from-lime-400/70 via-transparent to-indigo-500/50 p-[1px]";

const toneConfig: Record<InsightTone, { icon: typeof TrendingUp; badge: string; glow: string }> = {
  critical: {
    icon: AlertTriangle,
    badge: "bg-red-500/20 text-red-300 border border-red-500/30",
    glow: "shadow-[0_0_35px_rgba(248,113,113,0.35)]",
  },
  warning: {
    icon: TrendingDown,
    badge: "bg-amber-500/20 text-amber-300 border border-amber-500/40",
    glow: "shadow-[0_0_35px_rgba(251,191,36,0.25)]",
  },
  success: {
    icon: TrendingUp,
    badge: "bg-lime-500/20 text-lime-200 border border-lime-400/40",
    glow: "shadow-[0_0_45px_rgba(163,230,53,0.45)]",
  },
  tip: {
    icon: Sparkles,
    badge: "bg-purple-500/20 text-purple-200 border border-purple-500/30",
    glow: "shadow-[0_0_35px_rgba(168,85,247,0.35)]",
  },
  info: {
    icon: Sparkles,
    badge: "bg-sky-500/20 text-sky-200 border border-sky-500/30",
    glow: "shadow-[0_0_28px_rgba(56,189,248,0.25)]",
  },
};

const typingSpeed = 15;

export function AIInsightCard({
  insight,
  isActive = false,
  isLoading = false,
  loadingLabel = "Анализирую миллионы событий...",
}: AIInsightCardProps) {
  const [displayedText, setDisplayedText] = useState("");

  const { icon: Icon, badge, glow } = useMemo(() => toneConfig[insight.type ?? "info"], [insight.type]);

  useEffect(() => {
    if (isLoading || !insight.message) {
      setDisplayedText("");
      return;
    }

    setDisplayedText("");
    let isMounted = true;
    let index = 0;

    const interval = setInterval(() => {
      if (!isMounted) return;
      index += 1;
      setDisplayedText(insight.message.slice(0, index));
      if (index >= insight.message.length) {
        clearInterval(interval);
      }
    }, typingSpeed);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [insight.message, insight.id]);

  if (isLoading) {
    return (
      <div className={`${gradientFrame} animate-pulse`}>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/80 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
            <Loader2 className="h-5 w-5 animate-spin-slow text-lime-300" />
            {loadingLabel}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {insight.title || "Готовлю интеллектуальный отчёт"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${gradientFrame} ${isActive ? "ring-2 ring-lime-400/60" : ""}`}>
      <div className={`relative rounded-2xl bg-slate-950/80 border border-slate-800/60 backdrop-blur-xl p-6 transition-shadow duration-500 ${isActive ? glow : ""}`}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-lime-400/5 via-transparent to-indigo-900/10 opacity-70" />
        <div className="relative flex items-start gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400/90 to-cyan-400/70 text-slate-900">
            <Icon className="h-6 w-6" />
            <span className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-lime-300 shadow-[0_0_12px_rgba(163,230,53,0.6)]">
              <Sparkles className="h-3 w-3 animate-spin-slow" />
            </span>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-white tracking-tight">
                {insight.title}
              </h3>
              {insight.metric && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${badge}`}>
                  {insight.metric}
                </span>
              )}
              {typeof insight.change === "number" && (
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${insight.change >= 0 ? "text-lime-300 bg-lime-500/10" : "text-red-300 bg-red-500/10"}`}>
                  {insight.change >= 0 ? "+" : ""}
                  {insight.change}%
                </span>
              )}
            </div>

            <p className="typewriter-text text-sm leading-relaxed text-slate-300">
              {displayedText}
              {displayedText.length < (insight.message?.length ?? 0) && (
                <span className="typewriter-caret ml-1" />
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {insight.action && (
                <button className="inline-flex items-center gap-1 rounded-full bg-slate-800/60 px-3 py-1 font-medium text-lime-300 transition-all hover:bg-slate-700/70 hover:text-lime-200">
                  <Zap className="h-3.5 w-3.5" />
                  {insight.action}
                </button>
              )}
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Sparkles className="h-3 w-3 text-lime-300" />
                {new Date(insight.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
