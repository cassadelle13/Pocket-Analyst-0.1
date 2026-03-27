import { NextRequest, NextResponse } from "next/server";
import { createRequestId, recordQueryMetric } from "../../../lib/queryObservability";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rid = createRequestId("qry");
  try {
    const body = await request.json().catch(() => ({}));
    const page = Number(body?.page);
    const pageSize = Number(body?.pageSize);
    const derivedMaxRows = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : undefined;
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
    const sql = typeof body?.sql === "string"
      ? body.sql
      : (typeof body?.query === "string" ? body.query : "");

    if (!connectionId || !sql) {
      return NextResponse.json({ error: "connectionId and sql are required" }, { status: 400 });
    }

    const url = new URL("/api/datatalk/query", request.nextUrl.origin).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionId,
        sql,
        role: body?.role,
        maxRows: body?.maxRows ?? derivedMaxRows,
        timeoutMs: body?.timeoutMs,
        stream: body?.stream === true,
      }),
      cache: "no-store",
    });

    const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/x-ndjson")) {
      recordQueryMetric({
        route: "/api/query",
        durationMs: Date.now() - startedAt,
        ok: res.ok,
        correlationId: rid,
      });
      return new NextResponse(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "x-correlation-id": rid,
        },
      });
    }

    const payload = await res.json().catch(() => ({}));
    recordQueryMetric({
      route: "/api/query",
      durationMs: Date.now() - startedAt,
      ok: res.ok,
      correlationId: rid,
      extra: {
        page: Number.isFinite(page) ? page : null,
        pageSize: Number.isFinite(pageSize) ? pageSize : null,
      },
    });
    const response = NextResponse.json(payload, { status: res.status });
    response.headers.set("x-correlation-id", rid);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to proxy query";
    recordQueryMetric({
      route: "/api/query",
      durationMs: Date.now() - startedAt,
      ok: false,
      correlationId: rid,
      extra: { message },
    });
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set("x-correlation-id", rid);
    return response;
  }
}
