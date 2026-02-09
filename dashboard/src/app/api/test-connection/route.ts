import { NextRequest, NextResponse } from "next/server";
import { ConnectionPayload } from "../../../types/connection";
import { isDirectConnectDriver, normalizeConnectionPayload } from "../../../lib/connectionPayload";

export const dynamic = "force-dynamic";

type DbType = "postgres" | "mysql" | "mssql";

interface TestConnectionRequest {
  connection: ConnectionPayload;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TestConnectionRequest;
    const { connection: rawConnection } = body;

    if (!rawConnection || !rawConnection.type || !rawConnection.host || !rawConnection.user) {
      return NextResponse.json(
        { error: "Invalid connection configuration" },
        { status: 400 }
      );
    }

    const connection = normalizeConnectionPayload(rawConnection);

    if (!isDirectConnectDriver(connection.type)) {
      return NextResponse.json(
        { error: `Driver ${connection.type} is not supported for direct connections yet` },
        { status: 400 }
      );
    }

    const agentUrl = process.env.DATATALK_AGENT_URL || "http://datatalk-agent:9010";
    const agentSecret = process.env.DATATALK_AGENT_SHARED_SECRET;

    const response = await fetch(`${agentUrl}/test-connection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(agentSecret ? { "x-datatalk-agent-secret": agentSecret } : {}),
      },
      body: JSON.stringify({ connection }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Connection test failed",
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Test Connection API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}
