"use client";

import { Sparkles, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, Text, Title, Badge } from "@tremor/react";

interface AIInsight {
  id: string;
  type: "warning" | "success" | "info";
  title: string;
  description: string;
  metric?: string;
  change?: number;
  timestamp: string;
}

interface AIInsightCardProps {
  insight?: AIInsight;
  isLoading?: boolean;
}

const defaultInsight: AIInsight = {
  id: "1",
  type: "warning",
  title: "Retention Drop Detected",
  description:
    "Your Day-7 retention dropped by 12% this week. This correlates with the new onboarding flow deployed on Monday. Consider A/B testing the previous version.",
  metric: "D7 Retention",
  change: -12,
  timestamp: "2 hours ago",
};

export function AIInsightCard({ insight = defaultInsight, isLoading = false }: AIInsightCardProps) {
  const getTypeStyles = (type: AIInsight["type"]) => {
    switch (type) {
      case "warning":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: AlertTriangle,
          iconColor: "text-amber-500",
          badge: "amber",
        };
      case "success":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          icon: TrendingUp,
          iconColor: "text-emerald-500",
          badge: "emerald",
        };
      case "info":
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          icon: Sparkles,
          iconColor: "text-blue-500",
          badge: "blue",
        };
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gray-200 rounded-lg" />
          <div className="flex-1 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </Card>
    );
  }

  const styles = getTypeStyles(insight.type);
  const Icon = styles.icon;

  return (
    <Card className={`${styles.bg} ${styles.border} border`}>
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg bg-white shadow-sm`}>
          <Icon className={`w-6 h-6 ${styles.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Title className="text-gray-900">{insight.title}</Title>
            {insight.change && (
              <Badge color={insight.change > 0 ? "emerald" : "red"} size="sm">
                {insight.change > 0 ? "+" : ""}
                {insight.change}%
              </Badge>
            )}
          </div>
          <Text className="text-gray-600 mb-3">{insight.description}</Text>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <Text className="text-xs text-purple-600 font-medium">AI Insight from Dify</Text>
            </div>
            <Text className="text-xs text-gray-400">{insight.timestamp}</Text>
          </div>
        </div>
      </div>
    </Card>
  );
}
