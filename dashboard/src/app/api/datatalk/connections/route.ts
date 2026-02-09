import { NextRequest, NextResponse } from "next/server";

import { createConnection, listConnections } from "../../../../lib/datatalkMetaDb";


export async function GET() {
  try {
    const data = await listConnections();
    return NextResponse.json({ data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const type = typeof body?.type === "string" ? body.type : "";
    const host = typeof body?.host === "string" ? body.host.trim() : "";

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!host) return NextResponse.json({ error: "host is required" }, { status: 400 });
    if (type !== "clickhouse" && type !== "postgres" && type !== "mysql" && type !== "mssql") {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }

    const port = body?.port === null || body?.port === undefined || body?.port === "" ? null : Number(body.port);

    const created = await createConnection({
      name,
      type,
      host,
      port: Number.isFinite(port) ? port : null,
      database: typeof body?.database === "string" ? body.database : null,
      username: typeof body?.username === "string" ? body.username : null,
      password: typeof body?.password === "string" ? body.password : null,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
