import { describe, expect, it } from "vitest";
import { compileSemanticQuery } from "../planner";

const semanticModel: any = {
  version: 1,
  models: {
    app: {
      dimensions: {
        tenant_id: { type: "string", sql: "m0.tenant_id" },
        city: { type: "string", sql: "m0.city" },
      },
      measures: {
        revenue: { type: "sum", sql: "m0.revenue" },
      },
      rls: [{ field: "app.tenant_id", op: "eq", param: "tenantId" }],
    },
  },
};

const sourceBindings = { app: { connectionId: "conn-1", tableKey: "analytics.events" } };

describe("RLS missing param (KNOWN DEFECT I8)", () => {
  it("current behavior: request compiles without tenant predicate when param is absent", () => {
    const compiled = compileSemanticQuery({
      semanticModel,
      query: { sourceModel: "app", dimensions: ["app.city"], measures: ["app.revenue"], limit: 10 } as any,
      sourceBindings,
      globalContext: { version: 1, filters: [], params: {} },
      dialectHint: "postgres",
    });
    expect(compiled.sql.toLowerCase()).not.toMatch(/tenant_id\s*=/);
  });

  it.fails("desired: missing RLS param is a deny, not fail-open [KNOWN DEFECT I8]", () => {
    expect(() =>
      compileSemanticQuery({
        semanticModel,
        query: { sourceModel: "app", dimensions: ["app.city"], measures: ["app.revenue"], limit: 10 } as any,
        sourceBindings,
        globalContext: { version: 1, filters: [], params: {} },
        dialectHint: "postgres",
      }),
    ).toThrow(/rls|tenant|param/i);
  });
});
