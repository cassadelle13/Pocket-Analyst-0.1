import { NextResponse } from "next/server";

import { listConnections } from "../../../../lib/datatalkMetaDb";


export async function GET() {
  try {
    const connections = await listConnections();
    
    // Check if there's an active connection marked in metadata
    // For now, we consider "connected" if there's at least one saved connection
    // In production, you'd have a dedicated "active_connection" table or flag
    const activeConnection = connections.length > 0 ? connections[0] : null;

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
