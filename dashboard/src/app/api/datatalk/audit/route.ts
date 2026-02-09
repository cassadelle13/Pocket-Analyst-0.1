import { NextRequest, NextResponse } from "next/server";

import { listQueryAudit } from "../../../../lib/datatalkMetaDb";


export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const limitRaw = sp.get("limit");
    const limit = Math.max(1, Math.min(500, Number(limitRaw ?? "100") || 100));

    const status = sp.get("status");
    const connectionId = sp.get("connectionId");

    const data = await listQueryAudit({
      limit,
      status: status === "ok" || status === "error" ? status : undefined,
      connectionId: connectionId ? String(connectionId) : undefined,
    });

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load audit";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
