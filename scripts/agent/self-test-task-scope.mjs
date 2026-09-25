#!/usr/bin/env node
// Isolated git repo — does not touch the owner working tree.
// Parent PA_CHECK_BASE / PA_ROOT must not leak into auto-base scenarios.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const REAL = path.resolve(path.dirname(SELF), "../..");
const node = process.execPath;

function isolatedEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.PA_CHECK_BASE;
  delete env.PA_ROOT;
  delete env.PA_ROLLBACK_BACKUP;
  delete env.PA_ROLLBACK_ROOT;
  delete env.PA_ROLLBACK_MANIFEST;
  delete env.PA_ROLLBACK_EXCLUDES;
  return { ...env, ...overrides };
}

if (process.env.PA_SCOPE_CASE !== "inner") {
  const cases = [
    ["without PA_CHECK_BASE", { stripBase: true }],
    ["with PA_CHECK_BASE=origin/main", { PA_CHECK_BASE: "origin/main" }],
  ];
  let all = true;
  for (const [name, spec] of cases) {
    console.log(`=== self-test-task-scope ${name} ===`);
    const env = { ...process.env, PA_SCOPE_CASE: "inner" };
    if (spec.stripBase) delete env.PA_CHECK_BASE;
    else env.PA_CHECK_BASE = spec.PA_CHECK_BASE;
    const r = spawnSync(node, [SELF], { env, encoding: "utf8" });
    process.stdout.write(r.stdout || "");
    process.stderr.write(r.stderr || "");
    if (r.status !== 0) {
      console.error("FAIL case", name);
      all = false;
    }
  }
  console.log(all ? "PASS both PA_CHECK_BASE cases" : "FAIL a PA_CHECK_BASE case");
  process.exit(all ? 0 : 1);
}

const tmpBase = process.env.PA_ISOLATED_TMP || tmpdir();
mkdirSync(tmpBase, { recursive: true });
const dir = mkdtempSync(path.join(tmpBase, "pa-scope-"));

const GIT_IDENT = ["-c", "commit.gpgsign=false", "-c", "user.email=scope@test", "-c", "user.name=scope"];
function git(args, cwd = dir) {
  const r = spawnSync("git", [...(args[0] === "commit" ? GIT_IDENT : []), ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `git ${args.join(" ")}`);
  return r.stdout || "";
}
function run(rel, args, { env = {}, expect = 0, cwd = dir } = {}) {
  const r = spawnSync(node, [path.join(REAL, rel), ...args], {
    cwd,
    encoding: "utf8",
    env: isolatedEnv({ PA_ROOT: cwd, ...env }),
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const code = r.status ?? 1;
  if (code !== expect) {
    console.error("FAIL expected", expect, "got", code, rel, args.join(" "), out.slice(0, 400));
    return { ok: false, out };
  }
  return { ok: true, out };
}

let ok = true;
const check = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    ok = false;
  } else console.log("OK  ", m);
};

git(["init", "-b", "main", "--template="]);
git(["commit", "--allow-empty", "-m", "root"]);
writeFileSync(path.join(dir, "keep.ts"), "export const n = 1;\n");
git(["add", "keep.ts"]);
git(["commit", "-m", "base"]);
git(["checkout", "-b", "feat"]);
mkdirSync(path.join(dir, "src"), { recursive: true });
writeFileSync(path.join(dir, "src/client.ts"), 'export const auth = { role: "admin" };\n');
git(["add", "src/client.ts"]);
git(["commit", "-m", "admin literal"]);
const staleOrigin = git(["rev-parse", "HEAD~2"]).trim();
git(["update-ref", "refs/remotes/origin/main", staleOrigin]);

const listed = run("scripts/agent/changed-files.mjs", []).out || "";
check(listed.includes("src/client.ts"), "committed feature change is in task scope after clean commit");
check(!listed.includes("keep.ts"), "stale origin/main behind local main is not the task base");
check(/source=main/.test(listed), "auto base selects local main, not inherited PA_CHECK_BASE");

const viaFlag = run("scripts/agent/changed-files.mjs", ["--base", "origin/main"]).out || "";
check(viaFlag.includes("keep.ts") && viaFlag.includes("src/client.ts"), "explicit --base origin/main is applied");

const viaEnv = run("scripts/agent/changed-files.mjs", [], { env: { PA_CHECK_BASE: "origin/main" } }).out || "";
check(viaEnv.includes("keep.ts") && viaEnv.includes("src/client.ts"), "explicit PA_CHECK_BASE=origin/main is applied");

const guards = run("scripts/agent/guards.mjs", [], { expect: 1 });
check(guards.ok && /client-admin-role/.test(guards.out), "guards violation remains visible after commit");

writeFileSync(path.join(dir, "staged.ts"), "export const s = 1;\n");
git(["add", "staged.ts"]);
writeFileSync(path.join(dir, "keep.ts"), "export const n = 2;\n");
writeFileSync(path.join(dir, "untracked.ts"), "export const u = 1;\n");
const trio = run("scripts/agent/changed-files.mjs", []).out || "";
check(trio.includes("staged.ts"), "staged file is in task scope");
check(trio.includes("keep.ts"), "unstaged file is in task scope");
check(trio.includes("untracked.ts"), "untracked file is in task scope");

const unknown = mkdtempSync(path.join(tmpBase, "pa-unknown-"));
spawnSync("git", ["init", "-b", "onlyfeat", "--template="], { cwd: unknown, encoding: "utf8" });
spawnSync("git", [...GIT_IDENT, "commit", "--allow-empty", "-m", "x"], { cwd: unknown, encoding: "utf8" });
const emptyUnknown = run(
  "scripts/agent/changed-files.mjs",
  ["--fail-if-unknown-empty"],
  { env: { PA_ROOT: unknown }, cwd: unknown, expect: 2 },
);
check(emptyUnknown.ok && /unknown/.test(emptyUnknown.out), "unknown empty scope is not a PASS");
const unknownStamp = path.join(tmpBase, "stamp-unknown.json");
run(
  "scripts/agent/verify-stamp.mjs",
  ["write", "--mode", "quick", "--exit", "0", "--build", "0", "--stamp-file", unknownStamp],
  { env: { PA_ROOT: unknown, PA_CHECK_RUNNING: "1" }, cwd: unknown },
);
const unknownTask = run(
  "scripts/agent/verify-stamp.mjs",
  ["check", "--for-task", "--stamp-file", unknownStamp],
  { env: { PA_ROOT: unknown }, cwd: unknown, expect: 1 },
);
check(unknownTask.ok && /unknown/.test(unknownTask.out), "unknown empty stamp is not a task PASS");
rmSync(unknown, { recursive: true, force: true });

const stamp = path.join(tmpBase, "stamp-quick.json");
run(
  "scripts/agent/verify-stamp.mjs",
  ["write", "--mode", "quick", "--exit", "0", "--build", "0", "--stamp-file", stamp],
  { env: { PA_CHECK_RUNNING: "1" } },
);
const quickTask = run(
  "scripts/agent/verify-stamp.mjs",
  ["check", "--for-task", "--stamp-file", stamp],
  { expect: 1 },
);
check(quickTask.ok && /quick/.test(quickTask.out), "quick does not satisfy task with required units");

writeFileSync(path.join(dir, "SETUP_REPORT.md"), "docs only\n");
const docsDir = mkdtempSync(path.join(tmpBase, "pa-docs-"));
spawnSync("git", ["init", "-b", "main", "--template="], { cwd: docsDir, encoding: "utf8" });
spawnSync("git", [...GIT_IDENT, "commit", "--allow-empty", "-m", "r"], { cwd: docsDir, encoding: "utf8" });
writeFileSync(path.join(docsDir, "SETUP_REPORT.md"), "hello\n");
const docsStamp = path.join(tmpBase, "stamp-docs.json");
run(
  "scripts/agent/verify-stamp.mjs",
  ["write", "--mode", "quick", "--exit", "0", "--build", "0", "--stamp-file", docsStamp],
  { env: { PA_ROOT: docsDir, PA_CHECK_RUNNING: "1" }, cwd: docsDir },
);
const docsTask = run(
  "scripts/agent/verify-stamp.mjs",
  ["check", "--for-task", "--stamp-file", docsStamp],
  { env: { PA_ROOT: docsDir }, cwd: docsDir },
);
check(docsTask.ok && /docs-only/.test(docsTask.out), "docs-only allows lightweight stamp");
rmSync(docsDir, { recursive: true, force: true });

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "PASS inner" : "FAIL inner");
process.exit(ok ? 0 : 1);
