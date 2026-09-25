import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPORT_PATHS, classifyPath } from "./git.mjs";

/** Mapped affected areas. Suite ids must match `record_suite` in check.sh. */
const MAPPED = [
  { prefix: "dashboard/src/lib/semantic/", suite: "vitest:src/lib/semantic/__tests__" },
  { prefix: "dashboard/src/lib/schema-intelligence/", suite: "vitest:src/lib/schema-intelligence/__tests__" },
  { prefix: "dashboard/src/store/", suite: "vitest:src/store/__tests__" },
  { prefix: "dashboard/src/components/dashboard/", suite: "vitest:src/components/dashboard/__tests__" },
  { prefix: "dashboard/src/lib/projects/", suite: "vitest:src/lib/projects/__tests__" },
  { prefix: "dashboard/src/app/api/projects/", suite: "vitest:src/lib/projects/__tests__" },
  { prefix: "dashboard/src/app/api/rest/", suite: "vitest:src/app/api/rest/__tests__" },
  { prefix: "dashboard/src/lib/uploads/", suite: "vitest:src/lib/uploads/__tests__" },
  { prefix: "datatalk-agent/", suite: "datatalk-agent" },
];

const COMPONENT_SCOPE_SUITE = "vitest:src/lib/semantic/__tests__/scopeConsistency.test.ts";

const HARNESS_SUITES = [
  "hook-self-test",
  "stamp-self-test",
  "task-scope-self-test",
  "affected-filters-self-test",
  "required-suites-self-test",
  "rollback-check",
];

function mappedSuitesFor(p) {
  const suites = [];
  for (const m of MAPPED) {
    if (p.startsWith(m.prefix)) suites.push(m.suite);
  }
  if (p.startsWith("dashboard/src/components/dashboard/")) suites.push(COMPONENT_SCOPE_SUITE);
  return suites;
}

function isDocs(p, kind) {
  return kind === "report" || REPORT_PATHS.has(p) || (/^[^/]+\.md$/.test(p) && kind !== "checkConfig");
}

function isHarnessConfig(p, kind) {
  return kind === "checkConfig" || p.startsWith(".cursor/") || p.startsWith("scripts/agent/");
}

function uncoveredAction(paths) {
  const sample = paths[0] || "";
  if (sample.startsWith("ai-service/")) {
    return "No mapped unit suite. Full only parses syntax (`ai-service-syntax`); that is not unit confirmation. Do not treat an affected stamp as complete. Do not add a harness-only product test.";
  }
  if (sample.startsWith("dashboard/src/app/api/semantic/")) {
    return "No mapped affected suite. Store or other dashboard suites do not cover this path. Run `scripts/agent/check.sh full` for existing tests, or add a real suite next to the route. Do not invent a product test only to satisfy the harness.";
  }
  return "No mapped unit suite for this area. Suites that ran for other paths do not cover it. Task remains incomplete. Do not invent a product test only to satisfy the harness.";
}

function areaId(p) {
  if (p.startsWith("ai-service/")) return "ai-service";
  if (p.startsWith("dashboard/src/app/api/semantic/")) return "dashboard-semantic-api";
  const parts = p.split("/");
  return parts.slice(0, Math.min(3, parts.length)).join("/");
}

/** Suite ids and explicitly uncovered changed areas. */
export function requiredSuites(paths) {
  const need = new Set();
  const uncoveredMap = new Map();
  let docs = 0;
  let logic = 0;
  let config = 0;
  for (const p of paths) {
    const kind = classifyPath(p);
    if (isDocs(p, kind)) {
      docs += 1;
      continue;
    }
    if (isHarnessConfig(p, kind)) {
      config += 1;
      if (p.startsWith(".cursor/hooks") || p.startsWith("scripts/agent/")) {
        for (const s of HARNESS_SUITES) need.add(s);
      }
      continue;
    }
    logic += 1;
    const mapped = mappedSuitesFor(p);
    if (mapped.length) {
      for (const s of mapped) need.add(s);
      continue;
    }
    const id = areaId(p);
    if (!uncoveredMap.has(id)) uncoveredMap.set(id, []);
    uncoveredMap.get(id).push(p);
  }
  const uncovered = [...uncoveredMap.entries()].map(([area, areaPaths]) => ({
    area,
    paths: areaPaths,
    action: uncoveredAction(areaPaths),
  }));
  return {
    need: [...need],
    uncovered,
    docsOnly: logic === 0 && config === 0 && uncovered.length === 0,
    counts: { docs, logic, config, uncovered: uncovered.length },
  };
}

/** vitest:all covers only dashboard vitest:* suites, never datatalk-agent or harness suites. */
export function suiteCovered(suite, ran, mode) {
  const list = Array.isArray(ran) ? ran : [];
  if (list.includes(suite)) return true;
  if (suite.startsWith("vitest:") && list.includes("vitest:all")) return true;
  if (mode === "full" && suite.startsWith("vitest:") && list.includes("vitest:all")) return true;
  return false;
}

export function suitesSatisfied(required, ran, mode, extras = {}) {
  const uncovered = extras.uncovered || [];
  if (uncovered.length) return false;
  const need = Array.isArray(required) ? required : required?.need || [];
  if (need.length === 0 && (extras.logic || 0) > 0) return false;
  return need.every((s) => suiteCovered(s, ran, mode));
}

export function evaluateCoverage(paths, ran, mode) {
  const req = requiredSuites(paths);
  if (req.docsOnly) {
    return {
      ok: true,
      docsOnly: true,
      need: [],
      missing: [],
      uncovered: [],
      message: "docs-only",
    };
  }
  const missing = req.need.filter((s) => !suiteCovered(s, ran, mode));
  const uncovered = req.uncovered;
  const quickBlocks =
    mode === "quick" && (req.counts.logic > 0 || uncovered.length > 0 || req.need.length > 0);
  const ok = !quickBlocks && missing.length === 0 && uncovered.length === 0;
  return {
    ok,
    docsOnly: false,
    need: req.need,
    missing,
    uncovered,
    counts: req.counts,
    message: formatCoverage({ ok, missing, uncovered, mode, quickBlocks }),
  };
}

export function formatCoverage({ ok, missing, uncovered, mode, quickBlocks }) {
  if (ok) return `coverage ok (mode=${mode})`;
  const lines = [`INCOMPLETE mode=${mode} — uncovered or unsatisfied areas; not a successful check`];
  if (quickBlocks) lines.push("  quick does not confirm required unit tests");
  if (missing.length) {
    lines.push("  missing suites (run these; one suite does not cover another area):");
    for (const s of missing) lines.push(`    - ${s}`);
  }
  if (uncovered.length) {
    lines.push("  uncovered paths (absence of a suite is not a PASS):");
    for (const u of uncovered) {
      for (const p of u.paths) lines.push(`    - ${p}`);
      lines.push(`      action: ${u.action}`);
    }
  }
  return lines.join("\n");
}

function cli(argv) {
  const opt = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const changedFile = opt("changed-file");
  const mode = opt("mode") || "affected";
  const suites = String(opt("suites") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const paths = changedFile
    ? readFileSync(changedFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
    : [];
  const report = evaluateCoverage(paths, suites, mode);
  if (report.ok) {
    console.log(`[coverage] ${report.message}`);
    process.exit(0);
  }
  console.error(`[coverage] ${report.message}`);
  process.exit(1);
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  cli(process.argv);
}
