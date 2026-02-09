import { NextRequest, NextResponse } from "next/server";

import { parsePropertyFiltersFromURL, buildPropertyFilterConditions } from "../../../../lib/propertyFilterUtils";


type FunnelStep = {
  key: "view" | "cart" | "checkout" | "pay";
  name: string;
  value: number;
  conversionFromPrev: number | null;
  aiNote: string;
};

type FunnelResponse = {
  period: "24h" | "7d" | "30d";
  steps: FunnelStep[];
};

async function queryClickHouse(query: string) {
  const hosts = [process.env.CLICKHOUSE_HOST || "storage", "localhost"];
  const port = process.env.CLICKHOUSE_PORT || "8123";
  const database = process.env.CLICKHOUSE_DATABASE || "analytics";

  for (const host of hosts) {
    try {
      const url = `http://${host}:${port}/?database=${database}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query + " FORMAT JSON",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      return data.data as Array<Record<string, unknown>>;
    } catch (err) {
      console.warn(`ClickHouse unavailable at ${host}:${port}:`, err);
    }
  }

  return [];
}

function safeRatio(n: number, d: number): number | null {
  if (!d) return null;
  return Math.round((n / d) * 10000) / 10000;
}

function clampPeriod(v: string | null): FunnelResponse["period"] {
  if (v === "24h" || v === "7d" || v === "30d") return v;
  return "7d";
}

function emptyFunnel(period: FunnelResponse["period"]): FunnelResponse {
  const steps: FunnelStep[] = [
    { key: "view", name: "View", value: 0, conversionFromPrev: null, aiNote: "" },
    { key: "cart", name: "Cart", value: 0, conversionFromPrev: null, aiNote: "" },
    { key: "checkout", name: "Checkout", value: 0, conversionFromPrev: null, aiNote: "" },
    { key: "pay", name: "Pay", value: 0, conversionFromPrev: null, aiNote: "" },
  ];
  return { period, steps };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const period = clampPeriod(sp.get("period"));

  const interval = period === "24h" ? "24 HOUR" : period === "7d" ? "7 DAY" : "30 DAY";

  const propertyFilters = parsePropertyFiltersFromURL(sp);
  const propertyFilterConditions = buildPropertyFilterConditions(propertyFilters);

  const whereConditions = [`timestamp >= now() - INTERVAL ${interval}`, ...propertyFilterConditions];
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  try {
    const rows = await queryClickHouse(`
      SELECT
        countIf(event_name = 'view') AS view,
        countIf(event_name = 'cart') AS cart,
        countIf(event_name = 'checkout') AS checkout,
        countIf(event_name = 'pay') AS pay
      FROM events
      ${whereClause}
    `);

    const r = rows[0] ?? { view: 0, cart: 0, checkout: 0, pay: 0 };

    const view = Number(r.view ?? 0);
    const cart = Number(r.cart ?? 0);
    const checkout = Number(r.checkout ?? 0);
    const pay = Number(r.pay ?? 0);

    if (!view && !cart && !checkout && !pay) {
      return NextResponse.json({ data: emptyFunnel(period), isDemoData: false }, { status: 200 });
    }

    const steps: FunnelStep[] = [
      { key: "view", name: "View", value: view, conversionFromPrev: null, aiNote: "Traffic ok: watch source quality" },
      {
        key: "cart",
        name: "Cart",
        value: cart,
        conversionFromPrev: safeRatio(cart, view),
        aiNote: "Drop-off high: check add-to-cart UX",
      },
      {
        key: "checkout",
        name: "Checkout",
        value: checkout,
        conversionFromPrev: safeRatio(checkout, cart),
        aiNote: "Drop-off high: reduce form fields",
      },
      {
        key: "pay",
        name: "Pay",
        value: pay,
        conversionFromPrev: safeRatio(pay, checkout),
        aiNote: "Monitor declines and retry flow",
      },
    ];

    return NextResponse.json({ data: { period, steps } satisfies FunnelResponse, isDemoData: false }, { status: 200 });
  } catch (error) {
    console.error("REST cyber-funnel error:", error);
    return NextResponse.json({ data: emptyFunnel(period), isDemoData: false }, { status: 200 });
  }
}
