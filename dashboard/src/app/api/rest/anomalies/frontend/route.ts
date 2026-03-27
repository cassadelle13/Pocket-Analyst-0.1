import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null);
    console.log("[anomalies/frontend]", payload);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to accept anomaly";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
