#!/usr/bin/env node
// Checks that each .cursor/rules/*.mdc glob covers the listed real files.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/git.mjs";

export function globToRegExp(glob) {
  const g = String(glob).trim();
  let out = "^";
  for (let i = 0; i < g.length; i += 1) {
    if (g[i] === "*" && g[i + 1] === "*") {
      out += ".*";
      i += 1;
      if (g[i + 1] === "/") i += 1;
    } else if (g[i] === "*") out += "[^/]*";
    else if (g[i] === "?") out += "[^/]";
    else if ("+.^${}()|[]\\".includes(g[i])) out += `\\${g[i]}`;
    else out += g[i];
  }
  if (g.endsWith("/**")) out = out.replace(/\.\*$/, "(?:.*)?");
  return new RegExp(out + "$");
}

export function matchesAny(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

export function parseRuleGlobs(mdcText) {
  const fm = mdcText.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const line = fm[1].split("\n").find((l) => l.startsWith("globs:"));
  if (!line) return [];
  return line
    .slice("globs:".length)
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EXPECTED = {
  "query-path-security.mdc": [
    "dashboard/src/app/api/query/route.ts",
    "dashboard/src/app/api/datatalk/query/route.ts",
    "dashboard/src/app/api/semantic/query/route.ts",
    "dashboard/src/app/api/connect/route.ts",
    "datatalk-agent/src/index.ts",
    "datatalk-agent/src/rolePolicy.ts",
    "ai-service/main.py",
  ],
  "semantic-layer.mdc": [
    "dashboard/src/lib/semantic/planner.ts",
    "dashboard/src/lib/semantic/validator.ts",
    "dashboard/src/lib/semantic/types.ts",
    "dashboard/src/lib/schema-intelligence/SchemaIntelligenceService.ts",
    "dashboard/src/lib/sqlDialect.ts",
  ],
  "filters-and-dashboard-state.mdc": [
    "dashboard/src/store/biFiltersContext.tsx",
    "dashboard/src/components/dashboard/ChartPreview.tsx",
    "dashboard/src/components/dashboard/DragDropCanvas.tsx",
    "dashboard/src/lib/dashboardEvents.ts",
    "dashboard/src/lib/projectsStorage.ts",
    "dashboard/src/app/api/projects/route.ts",
  ],
  "api-routes.mdc": [
    "dashboard/src/app/api/rest/analytics-trend/route.ts",
    "dashboard/src/app/api/rest/users-graph/route.ts",
    "dashboard/src/app/api/insights/history/route.ts",
    "dashboard/src/app/api/projects/route.ts",
  ],
  "database-and-connections.mdc": [
    "dashboard/src/lib/datatalkMetaDb.ts",
    "dashboard/src/lib/datatalkCrypto.ts",
    "dashboard/src/lib/uploads/materializeToPostgres.ts",
    "dashboard/src/app/api/datatalk/connections/route.ts",
    "datatalk-db-init/postgres/02_init_idempotent.sql",
  ],
  "testing.mdc": [
    "dashboard/src/lib/semantic/__tests__/planner.golden.test.ts",
    "dashboard/e2e/filters-date.spec.ts",
    "datatalk-agent/test/rolePolicy.test.ts",
  ],
};

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("match-globs.mjs")) {
  const rulesDir = path.join(ROOT, ".cursor/rules");
  let failed = 0;
  for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".mdc"))) {
    const globs = parseRuleGlobs(readFileSync(path.join(rulesDir, file), "utf8"));
    const expected = EXPECTED[file] ?? [];
    const missing = expected.filter((p) => !matchesAny(p, globs));
    console.log(`[globs] ${file}: ${globs.join(" | ") || "(none)"}`);
    if (missing.length) {
      failed += 1;
      console.log(`  MISSING coverage: ${missing.join(", ")}`);
    } else {
      console.log(`  ok (${expected.length} probe files)`);
    }
  }
  process.exit(failed ? 1 : 0);
}
