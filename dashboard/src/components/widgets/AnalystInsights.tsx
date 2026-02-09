"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bot, Sparkles, ArrowUpRight } from "lucide-react";
import { TextInput } from "@tremor/react";
import { AIInsightCard } from "./AIInsightCard";
import { useDemoMode } from "../../context/DemoContext";
import { generateMockInsights } from "../../lib/mockGenerator";
import type { AIInsight, InsightTone } from "./AIInsightCard";

interface InsightApiResponse {
  question: string;
  metric?: string | null;
  sql: string;
  summary: Record<string, unknown>;
  insight: string;
}

const DEFAULT_PROMPT = "Почему упала конверсия?";
const MAX_HISTORY = 5;

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `insight-${Math.random().toString(36).slice(2, 9)}`;

const createPlaceholderInsight = (prompt: string): AIInsight => ({
  id: `pending-${Date.now()}`,
  type: "info",
  title: prompt,
  message: "",
  metric: undefined,
  change: undefined,
  action: undefined,
  timestamp: new Date().toISOString(),
});

const classifyTone = (text: string): InsightTone => {
  const normalized = text.toLowerCase();
  if (normalized.includes("жду первого импульса") || normalized.includes("готов к работе")) {
    return "info";
  }
  if (
    normalized.includes("упал") ||
    normalized.includes("снижен") ||
    normalized.includes("дроп") ||
    normalized.includes("decrease") ||
    normalized.includes("risk")
  ) {
    return "critical";
  }
  if (
    normalized.includes("вырос") ||
    normalized.includes("рост") ||
    normalized.includes("increase") ||
    normalized.includes("усил")
  ) {
    return "success";
  }
  if (normalized.includes("внимание") || normalized.includes("предупреждение")) {
    return "warning";
  }
  return "tip";
};

const mapResponseToInsight = (response: InsightApiResponse): AIInsight => {
  const cleanedMessage = response.insight?.trim() || "Аналитик не вернул результат.";
  return {
    id: createId(),
    type: classifyTone(cleanedMessage),
    title: response.question || "AI Insight",
    message: cleanedMessage,
    metric: response.metric ?? undefined,
    change: undefined,
    action: undefined,
    timestamp: new Date().toISOString(),
  };
};

const createFallbackInsight = (prompt: string): AIInsight => ({
  id: createId(),
  type: "warning",
  title: prompt,
  message: "AI мозг временно недоступен. Проверь конфигурацию LiteLLM и повтори попытку.",
  metric: undefined,
  change: undefined,
  action: undefined,
  timestamp: new Date().toISOString(),
});

export function AnalystInsights() {
  const { isDemoMode } = useDemoMode();
  const [question, setQuestion] = useState(DEFAULT_PROMPT);
  const [history, setHistory] = useState<AIInsight[]>([]);
  const [pendingInsight, setPendingInsight] = useState<AIInsight | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const feed = useMemo(
    () => (pendingInsight ? [pendingInsight, ...history] : history),
    [pendingInsight, history],
  );

  const requestInsight = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    if (isDemoMode) {
      const mockInsights = generateMockInsights();
      const formatted = mockInsights.map((insight) => ({
        id: createId(),
        type: classifyTone(insight.answer),
        title: insight.question,
        message: insight.answer,
        metric: undefined,
        change: undefined,
        action: undefined,
        timestamp: insight.timestamp,
      }));
      setHistory((prev) => [...formatted, ...prev].slice(0, MAX_HISTORY));
      return;
    }

    const placeholder = createPlaceholderInsight(trimmed);
    setPendingInsight(placeholder);
    setActiveIndex(0);

    try {
      const controller = new AbortController();
      const params = new URLSearchParams({ metric: "events", question: trimmed });
      const response = await fetch(`/api/insights?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.statusText}`);
      }

      const payload = (await response.json()) as InsightApiResponse;
      const insight = mapResponseToInsight(payload);

      setHistory((prev) => [insight, ...prev].slice(0, MAX_HISTORY));
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setPendingInsight(null);
        return;
      }
      console.error("Failed to load insights", error);
      const fallback = createFallbackInsight(trimmed);
      setHistory((prev) => [fallback, ...prev].slice(0, MAX_HISTORY));
    } finally {
      setPendingInsight(null);
    }
  }, [isDemoMode]);

  const handleSubmit = useCallback(
    async (prompt?: string) => {
      const value = (prompt ?? question).trim();
      if (!value) return;
      setQuestion(value);
      await requestInsight(value);
    },
    [question, requestInsight],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmit(event.currentTarget.value);
      }
    },
    [handleSubmit],
  );

  useEffect(() => {
    void requestInsight(DEFAULT_PROMPT);
  }, [requestInsight]);

  useEffect(() => {
    if (feed.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % feed.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [feed.length]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-lime-500/10 via-transparent to-indigo-900/20" />
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="ai-glow flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-cyan-400 text-slate-900">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Analyst Insights</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-lime-300/70">
                Live intelligence feed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-lime-400" />
            Streaming from AI Core
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 px-4 py-5">
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-4">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
              Спроси аналитика о чем угодно (например: Почему упала конверсия?)
            </label>
            <div className="flex gap-2">
              <TextInput
                className="flex-1 border-none bg-slate-950/80 text-slate-100 placeholder:text-slate-600 focus:ring-2 focus:ring-lime-400"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Например: Какие события предсказывают churn?"
              />
              <button
                type="button"
                onClick={() => void handleSubmit(question)}
                disabled={!!pendingInsight}
                className="inline-flex items-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/10 px-4 py-2 text-sm font-medium text-lime-200 transition hover:bg-lime-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Спросить
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {feed.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-800/60 bg-slate-900/60 px-6 py-8 text-center">
              <Sparkles className="h-6 w-6 text-lime-300" />
              <p className="text-sm text-slate-400">
                Waiting for telemetry. Ship events via Vector to unlock AI insights.
              </p>
            </div>
          )}

          {feed.map((insight, index) => (
            <AIInsightCard
              key={insight.id}
              insight={insight}
              isActive={index === activeIndex}
              isLoading={pendingInsight?.id === insight.id}
              loadingLabel="Анализирую миллионы событий..."
            />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800/60 bg-slate-950/80 px-6 py-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Feed: <span className="text-lime-300">{history.length}</span>
              {" "}
              {history.length === 1 ? "signal" : "signals"}
            </span>
            <button className="rounded-full border border-lime-400/40 px-3 py-1 text-lime-200 transition hover:bg-lime-500/10">
              View AI Activity →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
