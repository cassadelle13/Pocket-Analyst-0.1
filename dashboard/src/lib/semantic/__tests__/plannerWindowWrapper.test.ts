import { compileSemanticQuery } from "../planner";
import { test } from "vitest";
import type { LogicalQuery, SemanticModelV1 } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function buildSemanticModel(): SemanticModelV1 {
  return {
    version: 1,
    models: {
      app: {
        dimensions: {
          ts: { type: "time", sql: "{{alias}}.ts" },
          country: { type: "string", sql: "{{alias}}.country" },
        },
        measures: {
          revenue: { type: "sum", sql: "{{alias}}.revenue" },
        },
        calculatedFields: {
          running_revenue: {
            type: "rolling_avg",
            measure: "app.revenue",
            window: 7,
            orderBy: "app.ts",
            partitionBy: ["app.country"],
          },
          rank_revenue: {
            type: "window_agg",
            fn: "max",
            measure: "app.revenue",
            orderBy: "app.ts",
            partitionBy: ["app.country"],
            frameStart: 3,
            frameEnd: 0,
          },
        },
        calculatedMeasures: {
          revenue_running_sum: {
            sql: "RSUM(app.revenue)",
          },
        },
      },
    },
  };
}

function main() {
  const semanticModel = buildSemanticModel();
  const sourceBindings = {
    app: { connectionId: "conn1", tableKey: "analytics.app" },
  };

  const q1: LogicalQuery = {
    sourceModel: "app",
    dimensions: ["app.country", "app.ts"],
    measures: ["app.running_revenue"],
    orderBy: [{ field: "country", dir: "asc" }],
  };

  const c1 = compileSemanticQuery({
    semanticModel,
    query: q1,
    dialectHint: "postgres",
    sourceBindings,
  });

  assert(c1.sql.includes("FROM (SELECT"), "[window-wrapper] expected outer wrapper SELECT for rolling_avg");
  assert(c1.sql.includes("AVG(app_revenue) OVER"), "[window-wrapper] expected rolling AVG over base measure alias");
  assert(c1.sql.includes("as app_running_revenue"), "[window-wrapper] expected projected rolling alias");

  const q2: LogicalQuery = {
    sourceModel: "app",
    measures: ["app.rank_revenue"],
  };

  const c2 = compileSemanticQuery({
    semanticModel,
    query: q2,
    dialectHint: "postgres",
    sourceBindings,
  });

  assert(c2.sql.includes("FROM (SELECT"), "[window-wrapper] expected outer wrapper SELECT for window_agg");
  assert(c2.sql.includes("MAX(app_revenue) OVER"), "[window-wrapper] expected window agg over base measure alias");
  assert(c2.sql.includes("ORDER BY ts"), "[window-wrapper] expected hidden order-by dimension alias projection");
  assert(c2.sql.includes("as app_rank_revenue"), "[window-wrapper] expected projected window_agg alias");

  const q3: LogicalQuery = {
    sourceModel: "app",
    dimensions: ["app.ts"],
    measures: ["app.revenue", "app.revenue_running_sum"],
  };

  const c3 = compileSemanticQuery({
    semanticModel,
    query: q3,
    dialectHint: "postgres",
    sourceBindings,
  });

  assert(c3.sql.includes("_win_inner"), "[window-wrapper] expected dedicated window layer alias");
  assert(c3.sql.includes("SUM(app_revenue) OVER"), "[window-wrapper] expected RSUM to compile into SUM OVER");
  assert(c3.sql.includes("as revenue_running_sum"), "[window-wrapper] expected calculated measure alias in window layer");

  // eslint-disable-next-line no-console
  console.log("planner window wrapper suite: OK");
}

test("planner window wrapper suite", () => {
  main();
});
