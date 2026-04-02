import { NextRequest, NextResponse } from "next/server";

import { listWorkbookSheetNames, UPLOAD_LIMITS } from "../../../../lib/uploads/materializeToPostgres";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > UPLOAD_LIMITS.maxFileBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }
    const name = String(file.name ?? "").toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json({ error: "Only .xlsx and .xls supported for sheet listing" }, { status: 400 });
    }
    const sheets = listWorkbookSheetNames(buf);
    return NextResponse.json({ data: { sheets } }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list sheets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
