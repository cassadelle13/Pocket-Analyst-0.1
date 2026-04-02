import { NextResponse } from "next/server";

import { pickDefaultConnection } from "../../../../lib/defaultConnectionPick";
import { listConnections } from "../../../../lib/datatalkMetaDb";


export async function GET() {
  try {
    const connections = await listConnections();
    const activeConnection = pickDefaultConnection(connections);

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
