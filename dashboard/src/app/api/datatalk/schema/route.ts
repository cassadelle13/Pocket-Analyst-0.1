import { NextRequest, NextResponse } from "next/server";

import { getConnectionSecretForAgent } from "../../../../lib/datatalkMetaDb";


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
  try {
    const body = await request.json();

    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;
    if (connectionId && !isUuid(connectionId)) {
      return NextResponse.json({ error: "Invalid connectionId format" }, { status: 400 });
    }
    const agentPayload = connectionId
      ? await (async () => {
          const secret = await getConnectionSecretForAgent(connectionId);
          if (!secret) {
            return null;
          }

          return {
            connection: secret.connection,
          };
        })()
      : body;

    if (connectionId && !agentPayload) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const secret = getAgentSecret();
    const res = await fetch(`${getAgentBaseUrl()}/schema`, {
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
      return NextResponse.json({ error: text || `Agent error ${res.status}` }, { status: 502 });
    }

    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to proxy schema";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
