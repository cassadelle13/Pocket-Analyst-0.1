import { NextRequest, NextResponse } from "next/server";

import { getDataTalkMetaPool } from "../../../../lib/datatalkMetaDb";
import { materializeFileToPaUpload, UPLOAD_LIMITS } from "../../../../lib/uploads/materializeToPostgres";
import { resolvePostgresUploadConnectionId } from "../../../../lib/uploads/resolveUploadConnection";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const sheetRaw = form.get("sheet");
    const sheet = typeof sheetRaw === "string" && sheetRaw.trim() ? sheetRaw.trim() : null;

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > UPLOAD_LIMITS.maxFileBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }

    const originalFilename = String(file.name ?? "upload");

    const lower = originalFilename.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      return NextResponse.json({ error: "Only .csv, .xlsx, .xls are supported" }, { status: 400 });
    }

    if ((lower.endsWith(".xlsx") || lower.endsWith(".xls")) && !sheet) {
      return NextResponse.json(
        { error: "sheet name is required for Excel files (use POST /api/uploads/sheets first)" },
        { status: 400 }
      );
    }

    const connectionId = await resolvePostgresUploadConnectionId();
    if (!connectionId) {
      return NextResponse.json({ error: "No Postgres connection available for uploads" }, { status: 503 });
    }

    const pool = getDataTalkMetaPool();
    const result = await materializeFileToPaUpload(pool, {
      buffer: buf,
      originalFilename,
      sheet,
    });

    return NextResponse.json(
      {
        data: {
          connectionId,
          tableKey: result.tableKey,
          tableName: result.tableName,
          rowCount: result.rowCount,
          columnNames: result.columnNames,
          displayName: originalFilename,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
