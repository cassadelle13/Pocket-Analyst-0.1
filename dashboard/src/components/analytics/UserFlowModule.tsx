"use client";

import { useMemo } from "react";
import BaseChart from "../../components/charts/BaseChart";
import { Card, Title, Text, Badge } from "@tremor/react";
import { AlertTriangle } from "lucide-react";

interface FlowLink {
  source: string;
  target: string;
  value: number;
}

interface DeadEnd {
  event: string;
  exits: number;
  total: number;
  exitRate: number;
}

interface UserFlowData {
  links: FlowLink[];
  deadEnds: DeadEnd[];
  aiInsight: string | null;
  totalFlows: number;
}

interface Props {
  data: UserFlowData | null;
  height?: number;
  loading?: boolean;
}

export default function UserFlowModule({ data, height = 500, loading = false }: Props) {
  const option = useMemo(() => {
    if (!data || data.links.length === 0) {
      return null;
    }

    // Extract unique nodes from links
    const nodeSet = new Set<string>();
    data.links.forEach((link) => {
      nodeSet.add(link.source);
      nodeSet.add(link.target);
    });

    const nodes = Array.from(nodeSet).map((name) => ({ name }));

    // Identify positive flows (high-value transitions)
    const maxValue = Math.max(...data.links.map((l) => l.value));
    const positiveThreshold = maxValue * 0.3; // Top 30% are "positive"

    // Color palette
    const limeColor = "#a3e635"; // Lime-400
    const slateColor = "#64748b"; // Slate-500

    const links = data.links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
      lineStyle: {
        color: link.value >= positiveThreshold ? limeColor : slateColor,
        opacity: 0.4,
        curveness: 0.5,
      },
    }));

    return {
      backgroundColor: "transparent",
      // Performance optimization: progressive rendering
      progressive: 400,
      progressiveThreshold: 1000,
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(2, 6, 23, 0.85)",
        borderColor: "rgba(163, 230, 53, 0.3)",
        extraCssText: "backdrop-filter: blur(10px); border-radius: 12px; padding: 10px 12px;",
        textStyle: { color: "#e2e8f0" },
        formatter: (params: any) => {
          if (params.dataType === "edge") {
            return `${params.data.source} → ${params.data.target}<br/>Users: ${params.data.value.toLocaleString()}`;
          }
          return `${params.name}<br/>Total: ${params.value.toLocaleString()}`;
        },
      },
      series: [
        {
          type: "sankey",
          data: nodes,
          links,
          nodeAlign: "justify",
          orient: "horizontal",
          layoutIterations: 32,
          nodeWidth: 20,
          nodeGap: 12,
          // Performance: incremental rendering
          progressive: 400,
          progressiveChunkMode: 'sequential',
          itemStyle: {
            borderWidth: 1,
            borderColor: "rgba(148, 163, 184, 0.3)",
          },
          lineStyle: {
            curveness: 0.5,
          },
          label: {
            color: "rgba(226, 232, 240, 0.9)",
            fontSize: 11,
            fontWeight: 500,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: {
              opacity: 0.8,
            },
          },
        },
      ],
    };
  }, [data]);

  if (loading) {
    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
        <div className="mb-6">
          <Title className="text-white text-2xl">User Flows</Title>
          <Text className="text-slate-300 mt-1 text-lg">Event sequences and user journeys</Text>
        </div>
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-slate-400">Loading flow data...</div>
        </div>
      </Card>
    );
  }

  if (!data || data.links.length === 0) {
    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
        <div className="mb-6">
          <Title className="text-white text-2xl">User Flows</Title>
          <Text className="text-slate-300 mt-1 text-lg">Event sequences and user journeys</Text>
        </div>
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-slate-400">No flow data available for the selected period</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <Title className="text-white text-2xl">User Flows</Title>
            <Text className="text-slate-300 mt-1 text-lg">Event sequences and user journeys</Text>
          </div>
          <Badge color="lime" size="lg">
            {data.totalFlows} transitions
          </Badge>
        </div>

        {option && <BaseChart option={option} height={height} />}

        <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
          <span>
            <span className="inline-block w-3 h-3 rounded-full bg-lime-400 mr-2" />
            High-volume flows
          </span>
          <span>
            <span className="inline-block w-3 h-3 rounded-full bg-slate-500 mr-2" />
            Standard flows
          </span>
        </div>
      </Card>

      {/* Dead-end flows alert */}
      {data.deadEnds.length > 0 && data.deadEnds[0].exitRate > 30 && (
        <Card className="bg-gradient-to-r from-amber-950/40 to-orange-950/40 border-2 border-amber-500/50 backdrop-blur-xl rounded-2xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <Title className="text-amber-300 mb-2">Dead-end Flows Detected</Title>
                <Text className="text-slate-300 mb-4">
                  High exit rates detected on the following events:
                </Text>
                <div className="space-y-2 mb-4">
                  {data.deadEnds.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-black/20 rounded-lg px-4 py-2">
                      <span className="text-sm text-slate-200">{d.event}</span>
                      <span className="text-sm font-mono text-amber-400">
                        {d.exitRate}% exit rate ({d.exits}/{d.total})
                      </span>
                    </div>
                  ))}
                </div>
                {data.aiInsight && (
                  <div className="bg-black/30 rounded-lg p-4 border border-lime-500/30">
                    <Text className="text-xs text-lime-400 mb-2">AI Recommendation:</Text>
                    <Text className="text-sm text-slate-200 whitespace-pre-wrap">{data.aiInsight}</Text>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
