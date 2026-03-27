import { NextResponse } from "next/server";

import { listConnections } from "../../../../lib/datatalkMetaDb";


export async function GET() {
  try {
    const connections = await listConnections();

    const preferredName = (process.env.DATATALK_DEFAULT_CONNECTION_NAME ?? "").trim();
    const byNameCi = (name: string) =>
      connections.find((c) => String(c.name ?? "").trim().toLowerCase() === name.trim().toLowerCase());
    const byNameContainsCi = (part: string) =>
      connections.find((c) => String(c.name ?? "").trim().toLowerCase().includes(part.trim().toLowerCase()));

    const activeConnection =
      (preferredName
        ? byNameCi(preferredName)
        : null) ??
      byNameCi("MusGen 2") ??
      byNameContainsCi("musgen") ??
      byNameCi("Online_retail") ??
      (connections.length > 0 ? connections[0] : null);

    if (activeConnection) {
      return NextResponse.json({
        connected: true,
        connection: {
          id: activeConnection.id,
          name: activeConnection.name,
          type: activeConnection.type,
          connectedAt: activeConnection.created_at,
        },
      });
    }

    return NextResponse.json({
      connected: false,
      connection: null,
    });
  } catch (error) {
    console.error("[Connection Status] Error:", error);
    return NextResponse.json(
      {
        connected: false,
        connection: null,
        error: error instanceof Error ? error.message : "Failed to check connection status",
      },
      { status: 500 }
    );
  }
}
