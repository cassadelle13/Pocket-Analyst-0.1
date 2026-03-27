import { NextRequest, NextResponse } from "next/server";

import { getQueryMetricsSnapshot } from "../../../../lib/queryObservability";

export async function GET(request: NextRequest) {
  const format = String(request.nextUrl.searchParams.get("format") ?? "").trim().toLowerCase();
  const snapshot = getQueryMetricsSnapshot();
  if (format === "prometheus" || format === "prom") {
    return new NextResponse(snapshot.prometheus, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json(snapshot, { status: 200 });
}
