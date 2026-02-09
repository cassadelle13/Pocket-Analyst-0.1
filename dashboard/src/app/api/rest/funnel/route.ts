import { NextRequest, NextResponse } from "next/server";


const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

async function queryClickHouse(query: string) {
  const url = `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?database=${CLICKHOUSE_DATABASE}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: query + " FORMAT JSON",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ClickHouse error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data as Array<Record<string, unknown>>;
}

function safeRatio(n: number, d: number): number | null {
  if (!d) return null;
  return Math.round((n / d) * 10000) / 10000;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("projectId") || "proj_001";

  try {
    const rows = await queryClickHouse(`
      SELECT
        countIf(event_name = 'signup') AS signup,
        countIf(event_name = 'upgrade_click') AS upgrade_click,
        countIf(event_name = 'purchase') AS purchase
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY
    `);

    const r = rows[0] ?? { signup: 0, upgrade_click: 0, purchase: 0 };
    const signup = Number(r.signup ?? 0);
    const upgradeClick = Number(r.upgrade_click ?? 0);
    const purchase = Number(r.purchase ?? 0);

    const payload = {
      id: "funnel_30d",
      signup,
      upgrade_click: upgradeClick,
      purchase,
      purchase_per_signup: safeRatio(purchase, signup),
      purchase_per_upgrade_click: safeRatio(purchase, upgradeClick),
    };

    return new NextResponse(JSON.stringify([payload]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Total-Count": "1",
      },
    });
  } catch (error) {
    console.error("REST funnel error:", error);
    return NextResponse.json({ error: "Failed to fetch funnel" }, { status: 500 });
  }
}
