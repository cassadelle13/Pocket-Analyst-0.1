import { SchemaIntelligenceService } from "../SchemaIntelligenceService";
import { compileSemanticQuery } from "../../semantic/planner";
import type { LogicalQuery } from "../../semantic/types";
import { test } from "vitest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const generated = SchemaIntelligenceService.buildSemanticModelV1FromSchemaResponse({
    database: "analytics",
    columns: [
      { database: "analytics", table: "orders", name: "id", type: "UInt64" },
      { database: "analytics", table: "orders", name: "customer_id", type: "UInt64" },
      { database: "analytics", table: "orders", name: "amount", type: "Decimal64(2)" },
      { database: "analytics", table: "orders", name: "created_at", type: "DateTime" },
    ],
  });

  const query: LogicalQuery = {
    sourceModel: "orders",
    dimensions: ["orders.created_at"],
    measures: ["orders.rows", "orders.customer_id_count_distinct", "orders.amount"],
    time: { dimension: "orders.created_at", granularity: "month" },
    limit: 100,
  };

  const compiled = compileSemanticQuery({
    semanticModel: generated.semanticModel,
    query,
    dialectHint: "postgres",
    sourceBindings: {
      orders: {
        connectionId: "c1",
        tableKey: generated.modelToTableKey.orders,
      },
    },
  });

  assert(compiled.sql.includes("COUNT(*) as orders_rows"), "[compat] expected rows measure SQL");
  assert(compiled.sql.includes("COUNT(DISTINCT"), "[compat] expected count distinct helper SQL");
  assert(compiled.sql.includes("date_trunc('month'"), "[compat] expected month time bucket SQL");

  // eslint-disable-next-line no-console
  console.log("schema -> planner compatibility suite: OK");
}

test("schema to planner compatibility suite", () => {
  main();
});
