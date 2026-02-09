import { NextRequest, NextResponse } from "next/server";


export type UserGraphNode = {
  id: string;
  name?: string;
  size: number;
  category: number;
  ltv?: number;
  lastActive?: string;
};

export type UserGraphLink = {
  source: string;
  target: string;
  weight?: number;
};

type UserGraphResponse = {
  data: {
    nodes: UserGraphNode[];
    links: UserGraphLink[];
    categories: Array<{ name: string }>;
  };
  total: number;
};

function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ghostGraph(count: number) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rand = seededRandom(Math.floor(now / day));

  const clusters = 6;
  const categories = Array.from({ length: clusters }, (_, i) => ({
    name: i === 0 ? "Whales" : i === 1 ? "Bots" : `Cluster ${i + 1}`,
  }));

  const nodes: UserGraphNode[] = Array.from({ length: count }, (_, i) => {
    const c = Math.floor(rand() * clusters);
    const active = rand() > 0.34;
    const size = Math.round(10 + (active ? 14 : 6) + rand() * (active ? 22 : 10));
    const ltv = Math.round((active ? 200 : 30) + rand() * (active ? 2400 : 220));
    const lastActive = new Date(now - Math.floor(rand() * 72) * 60 * 60 * 1000).toISOString();

    return {
      id: `u_${i + 1}`,
      name: `User ${i + 1}`,
      size,
      category: c,
      ltv,
      lastActive,
    };
  });

  const byCluster: Record<number, string[]> = {};
  for (const n of nodes) {
    byCluster[n.category] ??= [];
    byCluster[n.category].push(n.id);
  }

  const links: UserGraphLink[] = [];

  for (let c = 0; c < clusters; c++) {
    const ids = byCluster[c] ?? [];
    const localEdges = Math.min(Math.floor(ids.length * 1.6), 900);

    for (let k = 0; k < localEdges; k++) {
      const a = ids[Math.floor(rand() * ids.length)];
      const b = ids[Math.floor(rand() * ids.length)];
      if (!a || !b || a === b) continue;
      links.push({ source: a, target: b, weight: 1 + rand() * 2 });
    }
  }

  const bridgeEdges = Math.min(200, Math.floor(count / 2));
  for (let k = 0; k < bridgeEdges; k++) {
    const a = nodes[Math.floor(rand() * nodes.length)];
    const b = nodes[Math.floor(rand() * nodes.length)];
    if (!a || !b || a.id === b.id) continue;
    if (a.category === b.category) continue;
    if (rand() < 0.8) continue;
    links.push({ source: a.id, target: b.id, weight: 0.6 + rand() });
  }

  return { nodes, links, categories };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const limit = Math.max(50, Math.min(1500, Number(sp.get("limit") ?? "650")));
  const fillMissing = sp.get("fill_missing") === "true";

  // TODO: Replace with ClickHouse + AI Service pipeline.
  // For now return deterministic "Ghost Data" so the constellation is always visually rich.
  // If fill_missing is true, ensure we have at least `limit` nodes; otherwise, try real data first (future).
  const graph = ghostGraph(fillMissing ? limit : Math.max(50, limit / 3));

  const payload: UserGraphResponse = {
    data: graph,
    total: graph.nodes.length,
  };

  return NextResponse.json(payload, { status: 200 });
}
