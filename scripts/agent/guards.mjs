#!/usr/bin/env node
// Forbidden-pattern guards on ADDED lines only (existing debt is reported by the audit, not here).
// Usage:
//   node scripts/agent/guards.mjs                    # task scope: merge-base + staged/unstaged/untracked
//   node scripts/agent/guards.mjs --base origin/main  # CI: base...HEAD + dirty/untracked
//   node scripts/agent/guards.mjs --files a.ts,b.ts   # restrict to files (used by the edit hook)
// Exit: 0 ok (warnings allowed), 1 at least one error.
import path from "node:path";
import { collectTaskScope, ROOT } from "./lib/git.mjs";

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const base = opt("base");
const only = (opt("files") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((f) => path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join("/"));

const CODE = /\.(ts|tsx|js|mjs|cjs|py|sql|sh)$/;
const TEST_PATH = /(__tests__|__integration__|\/test\/|\/e2e\/|\.test\.|\.spec\.)/;
// Documentation, rules and the guard implementation itself legitimately mention the patterns.
const EXEMPT = /^(scripts\/agent\/|\.cursor\/|\.github\/)|\.md$/;

const RULES = [
  {
    id: "debug-ingest-leak",
    level: "error",
    applies: (p) => CODE.test(p),
    re: /127\.0\.0\.1:7891/,
    msg: "request payloads must not be sent to the local debug ingest endpoint (audit S11)",
  },
  {
    id: "client-admin-role",
    level: "error",
    applies: (p) => CODE.test(p) && !TEST_PATH.test(p),
    re: /\brole\s*:\s*["'`]admin["'`]/,
    msg: "new literal role \"admin\": role must not be chosen by client code (audit S1/I6)",
  },
  {
    id: "new-queryClickHouse-copy",
    level: "error",
    applies: (p) => p.startsWith("dashboard/src/app/api/"),
    re: /\bfunction\s+queryClickHouse\b|\bconst\s+queryClickHouse\s*=/,
    msg: "new private queryClickHouse copy in a route (16 already exist); reuse a shared client",
  },
  {
    id: "empty-catch",
    level: "error",
    applies: (p) => /^dashboard\/src\/(app\/api|lib\/semantic)\//.test(p) && !TEST_PATH.test(p),
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    msg: "empty catch in API/semantic code hides source errors (audit I10, planner ORDER BY)",
  },
  {
    id: "hardcoded-secret",
    level: "error",
    applies: (p) => CODE.test(p) && !TEST_PATH.test(p),
    re: /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    msg: "looks like a hard-coded credential; use env variables (.env.example lists names only)",
  },
  {
    id: "private-key",
    level: "error",
    applies: () => true,
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    msg: "private key material",
  },
  {
    id: "focused-test",
    level: "error",
    applies: (p) => TEST_PATH.test(p),
    re: /\b(it|test|describe)\.only\s*\(/,
    msg: ".only disables the rest of the suite",
  },
  {
    id: "skipped-test",
    level: "warn",
    applies: (p) => TEST_PATH.test(p),
    re: /\b(it|test|describe)\.skip\s*\(/,
    msg: "skipped test: explain in PR or use it.fails with a KNOWN DEFECT label",
  },
  {
    id: "waitForTimeout",
    level: "warn",
    applies: (p) => p.startsWith("dashboard/e2e/"),
    re: /waitForTimeout\s*\(/,
    msg: "fixed sleeps make E2E flaky; wait for a condition",
  },
];

const scope = collectTaskScope({ base });
const changes = scope.files;
const findings = [];

for (const [p, f] of changes) {
  if (only.length && !only.includes(p)) continue;
  const base = path.basename(p);
  if (f.status !== "D" && /^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) {
    findings.push({ level: "error", id: "env-file", file: p, line: 0, msg: "environment file must not be committed" });
  }
  if (/\.snap$/.test(p)) {
    findings.push({ level: "warn", id: "snapshot-changed", file: p, line: 0, msg: "snapshot changed: explain every SQL line in the PR (golden snapshot pins a known ORDER BY defect)" });
  }
  if (EXEMPT.test(p) || f.status === "D") continue;
  for (const { line, text } of f.added) {
    for (const r of RULES) {
      if (r.applies(p) && r.re.test(text)) findings.push({ level: r.level, id: r.id, file: p, line, msg: r.msg, text: text.trim().slice(0, 160) });
    }
  }
}

const errors = findings.filter((x) => x.level === "error");
const warns = findings.filter((x) => x.level === "warn");
const label = scope.unknown
  ? `UNKNOWN base (dirty-only, source=${scope.source})`
  : `${scope.source}:${scope.base || "-"} + staged/unstaged/untracked`;
console.log(`[guards] ${label}: files=${only.length ? only.length : changes.size} errors=${errors.length} warnings=${warns.length}`);
for (const x of [...errors, ...warns]) {
  console.log(`  ${x.level.toUpperCase()} [${x.id}] ${x.file}${x.line ? `:${x.line}` : ""} — ${x.msg}${x.text ? `\n      > ${x.text}` : ""}`);
}
process.exit(errors.length ? 1 : 0);
