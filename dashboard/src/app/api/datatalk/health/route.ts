import { NextResponse } from "next/server";


function getAgentBaseUrl() {
  return process.env.DATATALK_AGENT_URL || "http://localhost:9010";
}

function getAgentSecret() {
  return process.env.DATATALK_AGENT_SHARED_SECRET || "";
}

export async function GET() {
  try {
    const secret = getAgentSecret();
    const res = await fetch(`${getAgentBaseUrl()}/health`, {
      cache: "no-store",
      headers: secret ? { "x-datatalk-agent-secret": secret } : undefined,
    });
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({ error: text || `Agent error ${res.status}` }, { status: 502 });
    }

    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reach datatalk-agent";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
