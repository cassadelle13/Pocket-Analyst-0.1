"use client";

import { Bot, TrendingDown, TrendingUp, AlertTriangle, Lightbulb, ArrowRight } from "lucide-react";

interface Insight {
  id: string;
  type: "warning" | "success" | "tip" | "critical";
  title: string;
  message: string;
  metric?: string;
  change?: number;
  action?: string;
  timestamp: string;
}

const insights: Insight[] = [
  {
    id: "1",
    type: "critical",
    title: "Retention Alert",
    message: "Day-7 retention dropped 12% this week. This correlates with the new onboarding flow deployed Monday. Users are dropping off at step 3 of the tutorial.",
    metric: "D7 Retention",
    change: -12,
    action: "Review onboarding funnel",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    type: "success",
    title: "Conversion Spike",
    message: "Premium conversion rate increased by 8% after the pricing page redesign. Users spend 40% more time on the features comparison section.",
    metric: "Conversion",
    change: 8,
    action: "A/B test new CTA",
    timestamp: "5 hours ago",
  },
  {
    id: "3",
    type: "tip",
    title: "Engagement Opportunity",
    message: "Users who complete the profile setup have 3x higher retention. Currently only 34% complete this step. Consider adding a progress indicator.",
    action: "Add profile completion prompt",
    timestamp: "1 day ago",
  },
];

const typeConfig = {
  critical: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertTriangle,
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    badge: "bg-red-500/20 text-red-400",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: TrendingDown,
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400",
  },
  success: {
    bg: "bg-lime-500/10",
    border: "border-lime-500/30",
    icon: TrendingUp,
    iconBg: "bg-lime-500/20",
    iconColor: "text-lime-400",
    badge: "bg-lime-500/20 text-lime-400",
  },
  tip: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    icon: Lightbulb,
    iconBg: "bg-purple-500/20",
    iconColor: "text-purple-400",
    badge: "bg-purple-500/20 text-purple-400",
  },
};

function InsightCard({ insight }: { insight: Insight }) {
  const config = typeConfig[insight.type];
  const Icon = config.icon;

  return (
    <div
      className={`${config.bg} ${config.border} border rounded-xl p-4 transition-all hover:scale-[1.01] cursor-pointer`}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div className={`${config.iconBg} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white text-sm">{insight.title}</h3>
            {insight.change && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.badge}`}>
                {insight.change > 0 ? "+" : ""}{insight.change}%
              </span>
            )}
          </div>
          
          <p className="text-slate-400 text-sm leading-relaxed mb-3">
            {insight.message}
          </p>

          <div className="flex items-center justify-between">
            {insight.action && (
              <button className="flex items-center gap-1.5 text-xs font-medium text-lime-400 hover:text-lime-300 transition-colors">
                {insight.action}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <span className="text-xs text-slate-600">{insight.timestamp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalystInsights() {
  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-lime-400 to-lime-500 rounded-xl flex items-center justify-center ai-glow">
            <Bot className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Analyst Insights</h2>
            <p className="text-xs text-slate-500">AI-powered recommendations based on your data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
          <span className="text-xs text-slate-500">Live</span>
        </div>
      </div>

      {/* Insights List */}
      <div className="p-4 space-y-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-800/20">
        <button className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
          View all insights →
        </button>
      </div>
    </div>
  );
}
