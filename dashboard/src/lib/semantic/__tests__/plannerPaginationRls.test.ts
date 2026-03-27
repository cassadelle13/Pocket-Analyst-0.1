import { compileSemanticQuery } from "../planner";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const semanticModel: any = {
    version: 1,
    models: {
      app: {
        dimensions: {
          tenant_id: { type: "string", sql: "m0.tenant_id" },
          city: { type: "string", sql: "m0.city" },
          ts: { type: "time", sql: "m0.ts" },
        },
        measures: {
          revenue: { type: "sum", sql: "m0.revenue" },
        },
        rls: [{ field: "app.tenant_id", op: "eq", param: "tenantId" }],
      },
    },
  };

  const sourceBindings = {
    app: {
      connectionId: "conn-1",
      tableKey: "analytics.events",
    },
  };

  const havingCompiled = compileSemanticQuery({
    semanticModel,
    query: {
      sourceModel: "app",
      dimensions: ["app.city"],
      measures: ["app.revenue"],
      filters: [{ field: "app.revenue", op: "gt", values: [100] }],
    } as any,
    sourceBindings,
    dialectHint: "postgres",
  });
  assert(havingCompiled.sql.includes("HAVING"), `[planner] expected HAVING clause, got: ${havingCompiled.sql}`);

  const pagedMssql = compileSemanticQuery({
    semanticModel,
    query: {
      sourceModel: "app",
      dimensions: ["app.city"],
      measures: ["app.revenue"],
      limit: 25,
      offset: 50,
    } as any,
    sourceBindings,
    dialectHint: "mssql",
  });
  assert(
    pagedMssql.sql.includes("OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY"),
    `[planner] expected MSSQL OFFSET/FETCH clause, got: ${pagedMssql.sql}`
  );

  const withRls = compileSemanticQuery({
    semanticModel,
    query: {
      sourceModel: "app",
      dimensions: ["app.city"],
      measures: ["app.revenue"],
      limit: 10,
    } as any,
    sourceBindings,
    globalContext: {
      version: 1,
      filters: [],
      params: { tenantId: "tenant-42" },
    },
    dialectHint: "postgres",
  });
  assert(
    withRls.sql.includes("tenant_id"),
    `[planner] expected RLS filter on tenant_id in SQL, got: ${withRls.sql}`
  );

  // eslint-disable-next-line no-console
  console.log("planner pagination/rls suite: OK");
}

main();
