import { SchemaIntelligenceService } from "../SchemaIntelligenceService";
import { test } from "vitest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const out = SchemaIntelligenceService.buildSemanticModelV1FromSchemaResponse({
    database: "analytics",
    columns: [
      { database: "analytics", table: "orders", name: "id", type: "UInt64" },
      { database: "analytics", table: "orders", name: "customer_id", type: "UInt64" },
      { database: "analytics", table: "orders", name: "revenue", type: "Float64" },
      { database: "analytics", table: "orders", name: "discount_rate", type: "Float64" },
      { database: "analytics", table: "orders", name: "is_paid", type: "Boolean" },
      { database: "analytics", table: "orders", name: "created_at", type: "DateTime64(3)" },
    ],
  });

  const model = out.semanticModel.models.orders as any;
  assert(!!model, "[schema] orders model should be generated");

  assert(model.dimensions.customer_id?.type === "string", "[schema] customer_id should be dimension string");
  assert(model.dimensions.is_paid?.type === "boolean", "[schema] is_paid should be boolean dimension");
  assert(model.dimensions.created_at?.type === "time", "[schema] created_at should be time dimension");

  assert(model.measures.revenue?.type === "sum", "[schema] revenue should default to sum");
  assert(model.measures.discount_rate?.type === "avg", "[schema] *_rate measure should default to avg");

  assert(model.measures.id_count_distinct?.type === "countDistinct", "[schema] id_count_distinct helper should exist");
  assert(model.measures.customer_id_count_distinct?.type === "countDistinct", "[schema] customer_id_count_distinct helper should exist");
  assert(model.measures.rows?.type === "count", "[schema] rows helper measure should exist");
  assert(model.calculatedFields?.retention?.type === "pivot_cohort", "[schema] retention calculated field should be auto-generated");
  assert(model.calculatedFields?.retention?.cohortBy === "orders.created_at", "[schema] retention.cohortBy should reference default time dim");
  assert(model.calculatedFields?.retention?.metric === "orders.customer_id_count_distinct", "[schema] retention.metric should prefer distinct user helper measure");

  // eslint-disable-next-line no-console
  console.log("schema intelligence service suite: OK");
}

test("schema intelligence service suite", () => {
  main();
});
