#!/usr/bin/env node
// Regression for suite sufficiency. Isolated git fixtures do not touch owner WIP.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCoverage, suitesSatisfied } from "./lib/requiredSuites.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const tmpBase = process.env.PA_ISOLATED_TMP || tmpdir();
mkdirSync(tmpBase, { recursive: true });
const GIT_IDENT = ["-c", "commit.gpgsign=false", "-c", "user.email=scope@test", "-c", "user.name=scope"];

let ok = true;
const check = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    ok = false;
  } else console.log("OK  ", m);
};

const d1 = evaluateCoverage(["ai-service/main.py"], [], "affected");
check(!d1.ok, "defect 1: ai-service/main.py with no suites is not complete");
check(
  d1.uncovered.some((u) => u.paths.includes("ai-service/main.py")),
  "defect 1: ai-service path is listed as uncovered",
);
check(/ai-service\/main\.py/.test(d1.message) && /action:/.test(d1.message), "defect 1: message lists path and action");

const d2 = evaluateCoverage(
  ["dashboard/src/app/api/semantic/query/route.ts", "dashboard/src/store/biFiltersContext.tsx"],
  ["vitest:src/store/__tests__"],
  "affected",
);
check(!d2.ok, "defect 2: semantic query + store is not complete after store tests only");
check(
  d2.uncovered.some((u) => u.paths.includes("dashboard/src/app/api/semantic/query/route.ts")),
  "defect 2: semantic query route is uncovered",
);
check(d2.need.includes("vitest:src/store/__tests__"), "defect 2: store suite is still required");
check(!d2.missing.includes("vitest:src/store/__tests__"), "defect 2: store suite is satisfied and does not hide the route");

check(
  suitesSatisfied(["datatalk-agent"], ["vitest:all"], "affected") === false,
  "defect 3: vitest:all does not satisfy datatalk-agent",
);

check(
  evaluateCoverage(["SETUP_REPORT.md"], [], "quick").ok,
  "positive: docs-only remains lightweight",
);
check(
  evaluateCoverage(["dashboard/src/store/biFiltersContext.tsx"], ["vitest:src/store/__tests__"], "affected").ok,
  "positive: store file + store suite is complete",
);
check(
  evaluateCoverage(["dashboard/src/store/biFiltersContext.tsx"], ["vitest:all"], "affected").ok,
  "positive: vitest:all covers the store dashboard suite only",
);
check(
  evaluateCoverage(["datatalk-agent/src/index.ts"], ["datatalk-agent"], "affected").ok,
  "positive: datatalk-agent suite covers datatalk-agent paths",
);
check(
  !evaluateCoverage(
    ["dashboard/src/store/x.ts", "dashboard/src/lib/semantic/planner.ts"],
    ["vitest:src/store/__tests__"],
    "affected",
  ).ok,
  "positive: store suite does not cover a changed semantic-lib area",
);
check(
  evaluateCoverage(
    ["dashboard/src/store/x.ts", "dashboard/src/lib/semantic/planner.ts"],
    ["vitest:src/store/__tests__", "vitest:src/lib/semantic/__tests__"],
    "affected",
  ).ok,
  "positive: both mapped dashboard suites together are complete",
);
check(
  evaluateCoverage(["dashboard/src/lib/semantic/planner.ts"], ["vitest:all"], "affected").ok,
  "positive: vitest:all covers dashboard semantic vitest",
);

function git(args, cwd) {
  const r = spawnSync("git", [...(args[0] === "commit" ? GIT_IDENT : []), ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `git ${args.join(" ")}`);
  return r.stdout || "";
}

function runStamp(cwd, args, { expect = 0, stamp } = {}) {
  const r = spawnSync(node, [path.join(REPO, "scripts/agent/verify-stamp.mjs"), ...args, "--stamp-file", stamp], {
    cwd,
    encoding: "utf8",
    env: (() => {
      const env = { ...process.env, PA_ROOT: cwd, PA_CHECK_RUNNING: "1" };
      delete env.PA_CHECK_BASE;
      delete env.PA_ROLLBACK_BACKUP;
      delete env.PA_ROLLBACK_ROOT;
      return env;
    })(),
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const code = r.status ?? 1;
  if (code !== expect) {
    console.error("FAIL stamp", args.join(" "), "expected", expect, "got", code, out.slice(0, 400));
    return { ok: false, out };
  }
  return { ok: true, out };
}

function isolatedRepo(name) {
  const dir = mkdtempSync(path.join(tmpBase, name));
  git(["init", "-b", "main", "--template="], dir);
  git(["commit", "--allow-empty", "-m", "root"], dir);
  return dir;
}

const iso1 = isolatedRepo("pa-rs-ai-");
mkdirSync(path.join(iso1, "ai-service"), { recursive: true });
writeFileSync(path.join(iso1, "ai-service/main.py"), "print(1)\n");
const stamp1 = path.join(tmpBase, "rs-ai.json");
runStamp(iso1, ["write", "--mode", "affected", "--exit", "0", "--build", "0"], { stamp: stamp1 });
const t1 = runStamp(iso1, ["check", "--for-task"], { expect: 1, stamp: stamp1 });
check(t1.ok && /INCOMPLETE/.test(t1.out) && /ai-service\/main\.py/.test(t1.out), "for-task: ai-service affected without suites is incomplete");
rmSync(iso1, { recursive: true, force: true });

const iso2 = isolatedRepo("pa-rs-sem-");
mkdirSync(path.join(iso2, "dashboard/src/app/api/semantic/query"), { recursive: true });
mkdirSync(path.join(iso2, "dashboard/src/store"), { recursive: true });
writeFileSync(path.join(iso2, "dashboard/src/app/api/semantic/query/route.ts"), "export {}\n");
writeFileSync(path.join(iso2, "dashboard/src/store/biFiltersContext.tsx"), "export {}\n");
const stamp2 = path.join(tmpBase, "rs-sem.json");
runStamp(
  iso2,
  ["write", "--mode", "affected", "--exit", "0", "--build", "0", "--suites", "vitest:src/store/__tests__"],
  { stamp: stamp2 },
);
const t2 = runStamp(iso2, ["check", "--for-task"], { expect: 1, stamp: stamp2 });
check(
  t2.ok && /query\/route\.ts/.test(t2.out) && /store tests do not cover|do not cover this path/.test(t2.out),
  "for-task: semantic route remains incomplete after store suite",
);
rmSync(iso2, { recursive: true, force: true });

const iso3 = isolatedRepo("pa-rs-store-");
mkdirSync(path.join(iso3, "dashboard/src/store"), { recursive: true });
writeFileSync(path.join(iso3, "dashboard/src/store/biFiltersContext.tsx"), "export {}\n");
const stamp3 = path.join(tmpBase, "rs-store.json");
runStamp(
  iso3,
  ["write", "--mode", "affected", "--exit", "0", "--build", "0", "--suites", "vitest:src/store/__tests__"],
  { stamp: stamp3 },
);
const t3 = runStamp(iso3, ["check", "--for-task"], { stamp: stamp3 });
check(t3.ok && /for-task/.test(t3.out), "for-task: store-only change with store suite is complete");
rmSync(iso3, { recursive: true, force: true });

console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
