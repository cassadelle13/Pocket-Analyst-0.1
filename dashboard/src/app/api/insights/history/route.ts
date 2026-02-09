import { NextResponse } from "next/server";


export type InsightHistoryItem = {
  id: string;
  ts: string;
  title: string;
  status: "good" | "warn" | "bad" | "info";
  summary: string;
  trend: Array<{ ts: number; value: number }>;
};

function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGhostTrend(seed: number, points = 24) {
  const rand = seededRandom(seed);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const start = now - day;
  let v = 40 + rand() * 30;
  const trend: Array<{ ts: number; value: number }> = [];
  for (let i = 0; i < points; i++) {
    v += (rand() - 0.5) * 10;
    v = Math.max(5, Math.min(120, v));
    trend.push({ ts: start + (i / (points - 1)) * day, value: Math.round(v) });
  }
  return trend;
}

function ghostData(days: number): InsightHistoryItem[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const seedBase = Math.floor(now / day);

  const items: Array<Omit<InsightHistoryItem, "trend"> & { trendSeed: number }> = [
    {
      id: "ins-1",
      ts: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      title: "Spike in page_view latency",
      status: "warn",
      summary:
        "Latency p95 вырос на 18% после 14:00. Похоже на деградацию mobile-рендера или рост payload.",
      trendSeed: seedBase + 11,
    },
    {
      id: "ins-2",
      ts: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      title: "Conversion stabilized",
      status: "good",
      summary:
        "CR удерживается около 3.1% при росте трафика. Воронка не теряет эффективность.",
      trendSeed: seedBase + 29,
    },
    {
      id: "ins-3",
      ts: new Date(now - 9 * 60 * 60 * 1000).toISOString(),
      title: "Paid traffic volatility",
      status: "info",
      summary:
        "CPC/volume прыгают. Рекомендуется ограничить кампанию и проверить UTM разметку.",
      trendSeed: seedBase + 37,
    },
    {
      id: "ins-4",
      ts: new Date(now - 16 * 60 * 60 * 1000).toISOString(),
      title: "Errors reduced",
      status: "good",
      summary:
        "Ошибок стало меньше на ~22% по сравнению со вчера. Похоже, фиксы деплоя отработали.",
      trendSeed: seedBase + 41,
    },
  ];

  const cutoff = now - days * day;
  return items
    .filter((i) => new Date(i.ts).getTime() >= cutoff)
    .map((i) => ({
      id: i.id,
      ts: i.ts,
      title: i.title,
      status: i.status,
      summary: i.summary,
      trend: buildGhostTrend(i.trendSeed),
    }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(7, Number(url.searchParams.get("days") ?? "3")));
  const fillMissing = url.searchParams.get("fill_missing") === "true";

  // TODO: Replace with real ClickHouse-backed insights history.
  // For now we intentionally return "Ghost Data" so the demo feed looks alive.
  // If fill_missing is true, ensure we have at least 3 items per day; otherwise, return whatever real data exists (future).
  const data = ghostData(fillMissing ? days : Math.max(1, days - 1));
  return NextResponse.json({ data }, { status: 200 });
}
