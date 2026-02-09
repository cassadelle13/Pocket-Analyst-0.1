"use client";

import { useEffect, useMemo, useState } from "react";
import EChartsCanvas from "../analytics/EChartsCanvas";
import type { UserGraphLink, UserGraphNode } from "../../app/api/rest/users-graph/route";

type GraphData = {
  nodes: UserGraphNode[];
  links: UserGraphLink[];
  categories: Array<{ name: string }>;
};

type Props = {
  data?: GraphData | null;
  height?: number;
  highlightNodeIds?: Set<string>;
  onNodeClick?: (node: UserGraphNode) => void;
};

export default function UserConstellation({ data, height = 560, highlightNodeIds, onNodeClick }: Props) {
  const [graph, setGraph] = useState<GraphData | null>(data ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (data) {
      setGraph(data);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/rest/users-graph?limit=650&fill_missing=true", { cache: "no-store" });
        const json = (await res.json()) as { data: GraphData };
        if (!cancelled) setGraph(json.data);
      } catch {
        if (!cancelled) setGraph({ nodes: [], links: [], categories: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const option = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const links = graph?.links ?? [];
    const categories = graph?.categories ?? [];

    const isBig = nodes.length > 500;

    const activeColor = "#a3e635"; // lime-400
    const sleepingColor = "#64748b"; // slate-500

    const toNode = (n: UserGraphNode) => {
      const active = (n.size ?? 0) >= 24;
      const isHighlighted = highlightNodeIds?.has(n.id) ?? false;

      const baseColor = active ? activeColor : sleepingColor;
      const color = isHighlighted ? "#fbbf24" : baseColor; // amber highlight

      return {
        id: n.id,
        name: n.name ?? n.id,
        value: {
          id: n.id,
          name: n.name ?? n.id,
          ltv: n.ltv ?? 0,
          lastActive: n.lastActive ?? null,
          category: n.category,
          size: n.size,
        },
        category: n.category,
        symbolSize: Math.max(6, Math.min(46, n.size ?? 10)),
        itemStyle: {
          color,
          shadowColor: color === sleepingColor ? "rgba(148,163,184,0.12)" : "rgba(163,230,53,0.35)",
          shadowBlur: isHighlighted ? 22 : 14,
        },
        emphasis: {
          scale: true,
          itemStyle: {
            shadowBlur: 28,
            shadowColor: "rgba(163,230,53,0.55)",
          },
        },
      };
    };

    return {
      backgroundColor: "#020617", // slate-950
      animation: !isBig,
      animationDuration: 900,
      animationEasing: "cubicOut",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(2,6,23,0.92)",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        textStyle: { color: "rgba(226,232,240,0.92)" },
        formatter: (params: any) => {
          const v = params?.data?.value ?? {};
          const ltv = Number(v.ltv ?? 0);
          const last = v.lastActive ? new Date(v.lastActive).toLocaleString() : "—";
          return `
            <div style="padding:10px; min-width: 180px;">
              <div style="font-weight:700; color: rgba(255,255,255,0.95); margin-bottom: 6px;">${String(v.name ?? params?.name ?? "User")}</div>
              <div style="color: rgba(148,163,184,0.95); font-size: 12px;">LTV: <b style="color:#a3e635">${ltv.toLocaleString()}</b></div>
              <div style="color: rgba(148,163,184,0.95); font-size: 12px;">Last active: ${last}</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          data: nodes.map(toNode),
          links: links.map((l) => ({
            source: l.source,
            target: l.target,
            lineStyle: {
              width: 1,
              opacity: 0.18,
              color: "rgba(148,163,184,0.75)",
              curveness: 0.2,
            },
          })),
          categories,
          roam: true,
          focusNodeAdjacency: true,
          draggable: false,
          edgeSymbol: ["none", "none"],
          emphasis: {
            focus: "adjacency",
            lineStyle: {
              width: 1.5,
              opacity: 0.55,
              color: "rgba(163,230,53,0.85)",
            },
          },
          force: {
            repulsion: isBig ? 55 : 95,
            gravity: 0.08,
            edgeLength: isBig ? [20, 65] : [25, 90],
            friction: 0.18,
            layoutAnimation: !isBig,
          },
          progressive: isBig ? 2500 : 0,
          progressiveThreshold: 500,
          silent: false,
        },
      ],
    };
  }, [graph, highlightNodeIds]);

  if (loading && !graph) {
    return <div className="h-[560px] rounded-2xl border border-white/10 bg-white/5" />;
  }

  return (
    <EChartsCanvas
      option={option}
      className="w-full rounded-2xl"
      height={height}
      onReady={(chart: any) => {
        chart.off("click");
        chart.on("click", (params: any) => {
          const raw = params?.data?.value;
          if (!raw) return;
          onNodeClick?.({
            id: String(raw.id),
            name: String(raw.name ?? raw.id),
            size: Number(raw.size ?? 10),
            category: Number(raw.category ?? 0),
            ltv: Number(raw.ltv ?? 0),
            lastActive: raw.lastActive ? String(raw.lastActive) : undefined,
          });
        });
      }}
    />
  );
}
