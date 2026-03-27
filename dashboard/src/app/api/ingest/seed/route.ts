import { NextRequest, NextResponse } from "next/server";

function parseIntOr(value: string | null, fallback: number) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const n = Math.max(1, Math.min(500, parseIntOr(sp.get("n"), 50)));

    const ingestUrl = process.env.INGEST_HTTP_URL || "http://localhost:9009";

    let ok = 0;
    const errors: Array<{ i: number; status: number; text: string }> = [];

    for (let i = 0; i < n; i++) {
      const evt = {
        project_id: "proj_001",
        event_name: i % 2 === 0 ? "page_view" : "click",
        user_id: `u${(i % 10) + 1}`,
        session_id: `s${(i % 5) + 1}`,
        properties: { source: "web", i },
      };

      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evt),
        cache: "no-store",
      });

      if (res.ok) {
        ok++;
        continue;
      }

      const text = await res.text().catch(() => "");
      errors.push({ i, status: res.status, text: text.slice(0, 400) });

      if (errors.length >= 10) break;
    }

    return NextResponse.json({ ok, requested: n, ingestUrl, errors }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to seed ingest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
