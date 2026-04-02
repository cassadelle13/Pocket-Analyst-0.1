import { createFullFunctionRegistry, getFormulaFunctionByName } from "../formulaRegistry";
import { test } from "vitest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  const reg = createFullFunctionRegistry();

  assert(reg.list.length >= 65, `[registry] expected >=65 functions, got ${reg.list.length}`);

  const sum = getFormulaFunctionByName("SUM");
  assert(!!sum, "[lookup] SUM should exist");
  assert(sum!.kind === "agg", `[lookup] SUM kind expected agg, got ${String(sum!.kind)}`);
  assert(sum!.compile(["sales"], "postgres") === "SUM(sales)", "[compile] SUM postgres mismatch");

  const countd = getFormulaFunctionByName("countd");
  assert(!!countd, "[lookup] COUNTD should be case-insensitive");
  assert(countd!.compile(["user_id"], "clickhouse") === "uniq(user_id)", "[compile] COUNTD clickhouse mismatch");
  assert(countd!.compile(["user_id"], "postgres") === "COUNT(DISTINCT user_id)", "[compile] COUNTD postgres mismatch");

  const countdIf = getFormulaFunctionByName("COUNTD_IF");
  assert(!!countdIf, "[lookup] COUNTD_IF should exist");
  assert(
    countdIf!.compile(["user_id", "is_paid = 1"], "clickhouse") === "uniqExactIf(user_id, is_paid = 1)",
    "[compile] COUNTD_IF clickhouse mismatch"
  );
  assert(
    countdIf!.compile(["user_id", "is_paid = 1"], "postgres") === "COUNT(DISTINCT CASE WHEN is_paid = 1 THEN user_id ELSE NULL END)",
    "[compile] COUNTD_IF postgres mismatch"
  );

  const ifFn = getFormulaFunctionByName("IF");
  assert(!!ifFn, "[lookup] IF should exist");
  const ifPg = ifFn!.compile(["x > 0", "'pos'", "'neg'"], "postgres");
  assert(ifPg === "CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END", `[compile] IF postgres mismatch: ${ifPg}`);

  const datetrunc = getFormulaFunctionByName("DATETRUNC");
  assert(!!datetrunc, "[lookup] DATETRUNC should exist");
  const dtPg = datetrunc!.compile(["created_at", "'month'"], "postgres");
  const dtCh = datetrunc!.compile(["created_at", "'month'"], "clickhouse");
  assert(dtPg === "date_trunc('month', created_at)", `[compile] DATETRUNC pg mismatch: ${dtPg}`);
  assert(dtCh === "toStartOfMonth(created_at)", `[compile] DATETRUNC ch mismatch: ${dtCh}`);

  const dateAdd = getFormulaFunctionByName("DATEADD");
  assert(!!dateAdd, "[lookup] DATEADD should exist");
  assert(
    dateAdd!.compile(["created_at", "'day'", "7"], "clickhouse") === "created_at + toIntervalDay(7)",
    "[compile] DATEADD clickhouse mismatch"
  );
  assert(
    dateAdd!.compile(["created_at", "'day'", "7"], "postgres") === "created_at + ((7) * INTERVAL '1 day')",
    "[compile] DATEADD postgres mismatch"
  );

  const startsWith = getFormulaFunctionByName("STARTSWITH");
  assert(!!startsWith, "[lookup] STARTSWITH should exist");
  assert(
    startsWith!.compile(["city", "'New'"], "postgres") === "city LIKE 'New' || '%'",
    "[compile] STARTSWITH postgres mismatch"
  );

  const allConcat = getFormulaFunctionByName("ALL_CONCAT");
  assert(!!allConcat, "[lookup] ALL_CONCAT should exist");
  assert(
    allConcat!.compile(["city", "';'"], "postgres") === "string_agg(CAST(city AS TEXT), ';')",
    "[compile] ALL_CONCAT postgres mismatch"
  );

  const topConcat = getFormulaFunctionByName("TOP_CONCAT");
  assert(!!topConcat, "[lookup] TOP_CONCAT should exist");
  assert(
    topConcat!.compile(["city", "5", "';'"], "clickhouse") === "arrayStringConcat(arraySlice(groupArray(toString(city)), 1, 5), ';')",
    "[compile] TOP_CONCAT clickhouse mismatch"
  );

  const castInt = getFormulaFunctionByName("INT");
  assert(!!castInt, "[lookup] INT should exist");
  assert(castInt!.compile(["price"], "postgres") === "CAST(price AS BIGINT)", "[compile] INT postgres mismatch");

  const rsum = getFormulaFunctionByName("RSUM");
  assert(!!rsum, "[lookup] RSUM should exist");
  assert(rsum!.kind === "window_ordered", `[lookup] RSUM kind expected window_ordered, got ${String(rsum!.kind)}`);

  const atDate = getFormulaFunctionByName("AT_DATE");
  assert(!!atDate, "[lookup] AT_DATE should exist");
  assert(
    atDate!.compile(["revenue", "2"], "postgres") === "LAG(revenue, 2) OVER (ORDER BY 1)",
    "[compile] AT_DATE postgres mismatch"
  );

  // eslint-disable-next-line no-console
  console.log("formula registry suite: OK");
}

test("formula registry suite", () => {
  main();
});
