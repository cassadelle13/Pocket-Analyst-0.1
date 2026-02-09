"use client";

import { Card, Metric, Text, Flex, BadgeDelta } from "@tremor/react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  delta?: number;
  deltaType?: "increase" | "decrease" | "unchanged";
  icon?: LucideIcon;
}

export function MetricCard({ title, value, delta, deltaType = "unchanged", icon: Icon }: MetricCardProps) {
  return (
    <Card className="max-w-xs">
      <Flex alignItems="start">
        <div>
          <Text>{title}</Text>
          <Metric>{value}</Metric>
        </div>
        {Icon && (
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-6 h-6 text-blue-500" />
          </div>
        )}
      </Flex>
      {delta !== undefined && (
        <Flex className="mt-4 space-x-2">
          <BadgeDelta deltaType={deltaType} />
          <Text className="truncate">
            {delta > 0 ? "+" : ""}
            {delta}% from last week
          </Text>
        </Flex>
      )}
    </Card>
  );
}
