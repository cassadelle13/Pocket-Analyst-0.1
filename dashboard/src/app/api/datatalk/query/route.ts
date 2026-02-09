import { NextRequest, NextResponse } from "next/server";

import crypto from "node:crypto";

import { getConnectionSecretForAgent, insertQueryAudit } from "../../../../lib/datatalkMetaDb";


function getAgentBaseUrl() {
  return process.env.DATATALK_AGENT_URL || "http://localhost:9010";
}

function getAgentSecret() {
  return process.env.DATATALK_AGENT_SHARED_SECRET || "";
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = await request.json();

    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;
    const sqlText = typeof body?.sql === "string" ? body.sql : "";
    const sqlPreview = sqlText ? sqlText.trim().slice(0, 500) : null;
    const sqlSha256 = sqlText ? crypto.createHash("sha256").update(sqlText, "utf8").digest("hex") : null;

    let connectionName: string | null = null;

    const agentPayload = connectionId
      ? await (async () => {
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
        })()
      : body;

    const dbType = typeof agentPayload?.connection?.type === "string" ? agentPayload.connection.type : null;

    if (connectionId && !agentPayload) {
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
      return NextResponse.json({ error: text || `Agent error ${res.status}` }, { status: 502 });
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

    return NextResponse.json(data, { status: 200 });
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
