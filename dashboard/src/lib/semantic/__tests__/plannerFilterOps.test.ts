import { renderWhere } from "../planner";
import { test } from "vitest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const fieldSqlByRef = (ref: string) => {
    if (ref === "app.city") return "city";
    throw new Error(`unknown ref: ${ref}`);
  };

  const wherePg = renderWhere(
    [
      { field: "app.city", op: "notcontains", values: ["York"] },
      { field: "app.city", op: "noticontains", values: ["new"] },
    ] as any,
    fieldSqlByRef,
    "postgres"
  );

  assert(wherePg.includes("NOT (city LIKE '%York%')"), `[filter-op] expected postgres notcontains SQL, got: ${wherePg}`);
  assert(wherePg.includes("NOT (city ILIKE '%new%')"), `[filter-op] expected postgres noticontains SQL, got: ${wherePg}`);

  const whereCh = renderWhere(
    [{ field: "app.city", op: "noticontains", values: ["abc"] }] as any,
    fieldSqlByRef,
    "clickhouse"
  );
  assert(whereCh.includes("NOT (lowerUTF8(toString(city)) LIKE lowerUTF8('%abc%'))"), `[filter-op] expected clickhouse noticontains SQL, got: ${whereCh}`);

  // eslint-disable-next-line no-console
  console.log("planner filter ops suite: OK");
}

test("planner filter ops suite", () => {
  main();
});
