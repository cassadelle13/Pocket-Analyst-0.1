export type Role = "user" | "business" | "admin";

export function normalizeRole(role: unknown): Role {
  if (role === "admin" || role === "business" || role === "user") return role;
  return "user";
}

export function isProbablyMultiStatement(sql: string): boolean {
  const trimmed = sql.trim();
  const withoutTrailing = trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
  return withoutTrailing.includes(";");
}

export function enforceRolePolicy(sql: string, role: Role): void {
  const cleaned = sql.trim().toLowerCase();

  if (role === "admin") {
    return;
  }

  const allowedPrefixes = ["select", "with", "show", "describe", "desc", "explain"];
  if (!allowedPrefixes.some((p) => cleaned.startsWith(p))) {
    throw new Error("Only read-only queries are allowed for this role");
  }

  const forbidden = ["insert", "update", "delete", "alter", "drop", "truncate", "create", "grant", "revoke"];
  const forbiddenWord = new RegExp(`\\b(${forbidden.join("|")})\\b`, "i");
  if (forbiddenWord.test(cleaned)) {
    throw new Error("Query contains forbidden keywords for this role");
  }
}
