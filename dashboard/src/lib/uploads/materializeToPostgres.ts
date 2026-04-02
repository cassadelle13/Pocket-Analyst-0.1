/**
 * Import CSV / XLSX into datatalk DB schema pa_upload (same PG as DATATALK_META_PG_*).
 * All columns stored as TEXT for MVP (simple charts and casting in SQL).
 */

import type { Pool } from "pg";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";

export const UPLOAD_LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxRows: 500_000,
  maxCols: 300,
  insertBatchRows: 500,
} as const;

const SCHEMA = "pa_upload";

function pgQuoteIdent(id: string): string {
  return `"${String(id).replace(/"/g, '""')}"`;
}

/** Safe unquoted table name segment: pa_upload.file_<hex> */
function newTableName(): string {
  return `file_${randomUUID().replace(/-/g, "")}`;
}

function sanitizeHeader(h: unknown, index: number, used: Set<string>): string {
  let raw = String(h ?? "").trim();
  raw = raw.replace(/[\u0000-\u001F\u007F;]/g, "").slice(0, 200);
  if (!raw) {
    let c = index;
    let name = `col_${c}`;
    while (used.has(name)) {
      c += 1;
      name = `col_${c}`;
    }
    used.add(name);
    return name;
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw)) {
    const name = `col_${index}`;
    used.add(name);
    return name;
  }
  let name = raw;
  let n = 0;
  while (used.has(name)) {
    n += 1;
    name = `${raw}_${n}`;
  }
  used.add(name);
  return name;
}

function parseCsvToMatrix(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
    if (fatal) throw new Error(`CSV parse: ${fatal.message}`);
  }
  const data = parsed.data as string[][];
  return data.filter((row) => row.some((c) => String(c ?? "").trim() !== ""));
}

function parseXlsxToMatrix(buffer: Buffer, sheetName?: string | null): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const names = wb.SheetNames;
  if (!names.length) throw new Error("Excel workbook has no sheets");
  const pick =
    sheetName && names.includes(sheetName)
      ? sheetName
      : names[0];
  const sheet = wb.Sheets[pick];
  if (!sheet) throw new Error(`Sheet not found: ${pick}`);
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => (c == null ? "" : String(c)))
  ).filter((row) => row.some((c) => c.trim() !== ""));
}

export function listWorkbookSheetNames(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames ?? [];
}

export type MaterializeResult = {
  tableName: string;
  tableKey: string;
  rowCount: number;
  columnNames: string[];
};

export async function materializeFileToPaUpload(
  pool: Pool,
  input: {
    buffer: Buffer;
    originalFilename: string;
    sheet?: string | null;
  }
): Promise<MaterializeResult> {
  const { buffer, originalFilename, sheet } = input;
  if (buffer.length > UPLOAD_LIMITS.maxFileBytes) {
    throw new Error(`File too large (max ${UPLOAD_LIMITS.maxFileBytes} bytes)`);
  }

  const lower = originalFilename.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const matrix = isXlsx ? parseXlsxToMatrix(buffer, sheet) : parseCsvToMatrix(buffer);

  if (matrix.length < 2) {
    throw new Error("File must have a header row and at least one data row");
  }

  const headerRow = matrix[0]!;
  const dataRows = matrix.slice(1);
  const used = new Set<string>();
  const columnNames = headerRow.map((h, i) => sanitizeHeader(h, i, used)).slice(0, UPLOAD_LIMITS.maxCols);

  if (columnNames.length === 0) throw new Error("No columns found");

  const limitedRows = dataRows.slice(0, UPLOAD_LIMITS.maxRows);
  const tableName = newTableName();
  const tableKey = `${SCHEMA}.${tableName}`;

  const colDefs = columnNames.map((c) => `${pgQuoteIdent(c)} TEXT`).join(", ");
  const createSql = `CREATE TABLE ${pgQuoteIdent(SCHEMA)}.${pgQuoteIdent(tableName)} (${colDefs})`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${pgQuoteIdent(SCHEMA)}`);
    await client.query(createSql);

    let inserted = 0;
    for (let i = 0; i < limitedRows.length; i += UPLOAD_LIMITS.insertBatchRows) {
      const batch = limitedRows.slice(i, i + UPLOAD_LIMITS.insertBatchRows);
      const values: Array<string | null> = [];
      const rowPlaceholders = batch.map((row, rowIdx) => {
        const cols = columnNames.map((_, colIdx) => {
          const v = row[colIdx];
          values.push(v == null || v === "" ? null : String(v));
          return `$${rowIdx * columnNames.length + colIdx + 1}`;
        });
        return `(${cols.join(", ")})`;
      });
      const insertSql = `INSERT INTO ${pgQuoteIdent(SCHEMA)}.${pgQuoteIdent(tableName)} (${columnNames
        .map(pgQuoteIdent)
        .join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
      await client.query(insertSql, values);
      inserted += batch.length;
    }

    await client.query("COMMIT");
    return {
      tableName,
      tableKey,
      rowCount: inserted,
      columnNames,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
