export type SqlDialect = "postgres" | "clickhouse" | "mssql";

export function resolveSqlDialect(connectionTypeRaw: unknown): SqlDialect {
  const ct = String(connectionTypeRaw ?? "").trim().toLowerCase();
  if (ct === "clickhouse") return "clickhouse";
  if (ct === "mssql" || ct === "sqlserver") return "mssql";
  return "postgres";
}
