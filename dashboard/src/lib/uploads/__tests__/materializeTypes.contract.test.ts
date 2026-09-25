import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { materializeFileToPaUpload } from "../materializeToPostgres";

describe("file upload column types (KNOWN DEFECT I12)", () => {
  it("static: CREATE TABLE template still types every column as TEXT", () => {
    const src = readFileSync(path.resolve(__dirname, "../materializeToPostgres.ts"), "utf8");
    expect(src).toMatch(/\$\{pgQuoteIdent\(c\)\} TEXT/);
    expect(src).not.toMatch(/NUMERIC|DOUBLE PRECISION|INTEGER|BIGINT|TIMESTAMP/);
  });

  it("behavior: materializeFileToPaUpload issues CREATE TABLE with TEXT only (mock pool, no DB)", async () => {
    const sql: string[] = [];
    const client = {
      query: async (text: string) => {
        sql.push(text);
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as never;
    const csv = Buffer.from("amount,when\n12.5,2024-01-01\n", "utf8");
    await materializeFileToPaUpload(pool, { buffer: csv, originalFilename: "nums.csv" });
    const create = sql.find((s) => /CREATE TABLE/i.test(s) && /pa_upload/i.test(s));
    expect(create).toBeTruthy();
    expect(create).toMatch(/"amount" TEXT/);
    expect(create).toMatch(/"when" TEXT/);
    expect(create).not.toMatch(/NUMERIC|DOUBLE PRECISION|INTEGER|BIGINT|TIMESTAMP/);
  });
});
