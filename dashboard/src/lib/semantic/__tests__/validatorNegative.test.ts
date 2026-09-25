import { describe, expect, it } from "vitest";
import { validateSemanticModelV1 } from "../validator";

function modelWithDimSql(sql: string) {
  return {
    version: 1,
    models: {
      app: {
        dimensions: { city: { type: "string", sql } },
        measures: { n: { type: "count", sql: "1" } },
      },
    },
  };
}

describe("semantic validator negative cases", () => {
  it("rejects DROP in a dimension sql fragment", () => {
    const r = validateSemanticModelV1(modelWithDimSql("m0.city; DROP TABLE x"));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /forbidden/i.test(e))).toBe(true);
  });

  it("rejects UNION-looking fragments that contain a semicolon", () => {
    const r = validateSemanticModelV1(modelWithDimSql("m0.city; UNION SELECT 1"));
    expect(r.ok).toBe(false);
  });

  it("does not treat a plain UNION SELECT without blacklisted tokens as forbidden (blacklist limit)", () => {
    const r = validateSemanticModelV1(modelWithDimSql("m0.city UNION SELECT password"));
    // Current validator is a blacklist; this documents that gap (audit S4).
    expect(r.errors.some((e) => /forbidden/i.test(e))).toBe(false);
  });
});
