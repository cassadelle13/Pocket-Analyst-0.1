import { describe, expect, it } from "vitest";
import { compileSemanticQuery } from "../planner";

const semanticModel: any = {
  version: 1,
  models: {
    app: {
      dimensions: {
        city: { type: "string", sql: "m0.city" },
        country: { type: "string", sql: "m0.country" },
        ts: { type: "time", sql: "m0.ts" },
      },
      measures: {
        revenue: { type: "sum", sql: "m0.revenue" },
        users: { type: "countDistinct", sql: "m0.user_id" },
      },
    },
  },
};

const sourceBindings = {
  app: {
    connectionId: "conn-1",
    tableKey: "analytics.events",
  },
};

describe("planner golden", () => {
  it("generates stable SQL for core query patterns", () => {
    const cases = [
      compileSemanticQuery({
        semanticModel,
        sourceBindings,
        query: {
          sourceModel: "app",
          dimensions: ["app.city"],
          measures: ["app.revenue"],
          limit: 50,
        } as any,
        dialectHint: "postgres",
      }).sql,
      compileSemanticQuery({
        semanticModel,
        sourceBindings,
        query: {
          sourceModel: "app",
          dimensions: ["app.country"],
          measures: ["app.users"],
          filters: [{ field: "app.country", op: "in", values: ["DE"] }],
          limit: 100,
          offset: 20,
        } as any,
        dialectHint: "mssql",
      }).sql,
      compileSemanticQuery({
        semanticModel,
        sourceBindings,
        query: {
          sourceModel: "app",
          dimensions: ["app.city"],
          measures: ["app.revenue"],
          orderBy: [{ field: "app.revenue", dir: "desc" }],
          limit: 10,
        } as any,
        dialectHint: "clickhouse",
      }).sql,
    ];

    expect(cases).toMatchSnapshot();
  });
});
