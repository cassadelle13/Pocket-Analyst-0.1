import { NextRequest, NextResponse } from "next/server";

import crypto from "node:crypto";

import { getConnectionSecretForAgent, insertQueryAudit } from "../../../../lib/datatalkMetaDb";
import { createRequestId, logQueryEvent, recordQueryMetric } from "../../../../lib/queryObservability";


function getAgentBaseUrl() {
  return process.env.DATATALK_AGENT_URL || "http://localhost:9010";
}

function getAgentSecret() {
  return process.env.DATATALK_AGENT_SHARED_SECRET || "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rid = createRequestId("dtq");

  try {
    const body = await request.json();

    const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }
    if (!isUuid(connectionId)) {
      return NextResponse.json({ error: "Invalid connectionId format" }, { status: 400 });
    }
    const sqlText = typeof body?.sql === "string" ? body.sql : "";
    const sqlPreview = sqlText ? sqlText.trim().slice(0, 500) : null;
    const sqlSha256 = sqlText ? crypto.createHash("sha256").update(sqlText, "utf8").digest("hex") : null;

    let connectionName: string | null = null;

    const agentPayload = await (async () => {
      const secret = await getConnectionSecretForAgent(connectionId);
      if (!secret) {
        return null;
      }

      connectionName = secret.name;

      return {
        connection: secret.connection,
        sql: body?.sql,
        role: body?.role,
        maxRows: body?.maxRows,
        timeoutMs: body?.timeoutMs,
      };
    })();

    const dbType = typeof agentPayload?.connection?.type === "string" ? agentPayload.connection.type : null;

    if (!agentPayload) {
      try {
        await insertQueryAudit({
          connectionId,
          connectionName,
          status: "error",
          durationMs: Date.now() - startedAt,
          role: typeof body?.role === "string" ? body.role : null,
          sqlPreview,
          sqlSha256,
          dbType: (dbType as any) ?? null,
          errorMessage: "Connection not found",
        });
      } catch {
        // ignore audit failures
      }
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const secret = getAgentSecret();
    const res = await fetch(`${getAgentBaseUrl()}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-datatalk-agent-secret": secret } : {}),
      },
      body: JSON.stringify(agentPayload),
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      try {
        await insertQueryAudit({
          connectionId,
          connectionName,
          status: "error",
          durationMs: Date.now() - startedAt,
          role: typeof body?.role === "string" ? body.role : null,
          sqlPreview,
          sqlSha256,
          dbType: (dbType as any) ?? null,
          errorMessage: text || `Agent error ${res.status}`,
        });
      } catch {
        // ignore audit failures
      }
      logQueryEvent("warn", "datatalk_query_upstream_error", { rid, status: res.status });
      recordQueryMetric({
        route: "/api/datatalk/query",
        durationMs: Date.now() - startedAt,
        ok: false,
        correlationId: rid,
        extra: { status: res.status },
      });
      const failResponse = NextResponse.json({ error: text || `Agent error ${res.status}` }, { status: 502 });
      failResponse.headers.set("x-correlation-id", rid);
      return failResponse;
    }

    const data = text ? JSON.parse(text) : {};

    try {
      const rowCount = typeof data?.data?.rowCount === "number" ? data.data.rowCount : null;
      await insertQueryAudit({
        connectionId,
        connectionName,
        status: "ok",
        durationMs: Date.now() - startedAt,
        role: typeof body?.role === "string" ? body.role : null,
        sqlPreview,
        sqlSha256,
        dbType: (dbType as any) ?? null,
        rowCount,
      });
    } catch {
      // ignore audit failures
    }

    const shouldStream = body?.stream === true;
    if (shouldStream && Array.isArray((data as any)?.data?.rows)) {
      const rows = (data as any).data.rows as unknown[][];
      const cols = Array.isArray((data as any)?.data?.columns) ? (data as any).data.columns : [];
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode(JSON.stringify({ columns: cols }) + "\n"));
          for (const row of rows) {
            controller.enqueue(enc.encode(JSON.stringify({ row }) + "\n"));
          }
          controller.enqueue(enc.encode(JSON.stringify({ rowCount: rows.length }) + "\n"));
          controller.close();
        },
      });
      recordQueryMetric({
        route: "/api/datatalk/query",
        durationMs: Date.now() - startedAt,
        ok: true,
        correlationId: rid,
        extra: { streamed: true, rowCount: rows.length },
      });
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "x-correlation-id": rid,
        },
      });
    }

    recordQueryMetric({
      route: "/api/datatalk/query",
      durationMs: Date.now() - startedAt,
      ok: true,
      correlationId: rid,
      extra: {
        rowCount: Array.isArray((data as any)?.data?.rows) ? (data as any).data.rows.length : null,
      },
    });
    const okResponse = NextResponse.json(data, { status: 200 });
    okResponse.headers.set("x-correlation-id", rid);
    return okResponse;
  } catch (err: unknown) {
    try {
      await insertQueryAudit({
        connectionId: null,
        status: "error",
        durationMs: Date.now() - startedAt,
        errorMessage: err instanceof Error ? err.message : "Failed to proxy query",
      });
    } catch {
      // ignore audit failures
    }
    const message = err instanceof Error ? err.message : "Failed to proxy query";
    logQueryEvent("error", "datatalk_query_failed", { rid, message });
    recordQueryMetric({
      route: "/api/datatalk/query",
      durationMs: Date.now() - startedAt,
      ok: false,
      correlationId: rid,
      extra: { message },
    });
    const failResponse = NextResponse.json({ error: message }, { status: 400 });
    failResponse.headers.set("x-correlation-id", rid);
    return failResponse;
  }
}
