#!/usr/bin/env node
// Rollback *mechanism* on an isolated git repo. Does not use or require
// backup/pre-agent-env-20260925 and does not apply a rollback.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkSh = path.join(REPO, "scripts/agent/rollback-check.sh");
const tmpBase = process.env.PA_ISOLATED_TMP || tmpdir();
mkdirSync(tmpBase, { recursive: true });
const GIT_IDENT = ["-c", "commit.gpgsign=false", "-c", "user.email=rb@test", "-c", "user.name=rb"];

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

function git(args, cwd) {
  const r = spawnSync("git", [...(args[0] === "commit" ? GIT_IDENT : []), ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `git ${args.join(" ")}`);
  return r.stdout || "";
}

function runCheck(fixture, extraEnv = {}, args = [], expect) {
  const r = spawnSync("bash", [checkSh, ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    env: isolatedEnv({
      PA_ROLLBACK_ROOT: fixture.root,
      PA_ROLLBACK_BACKUP: extraEnv.PA_ROLLBACK_BACKUP ?? fixture.backup,
      PA_ROLLBACK_MANIFEST: extraEnv.PA_ROLLBACK_MANIFEST ?? fixture.manifest,
      PA_ROLLBACK_EXCLUDES: extraEnv.PA_ROLLBACK_EXCLUDES ?? fixture.excludes,
      ...extraEnv,
    }),
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const code = r.status ?? 1;
  if (code !== expect) {
    console.error("FAIL expected", expect, "got", code, args.join(" "), out.slice(0, 500));
    return { ok: false, out, code };
  }
  return { ok: true, out, code };
}

function makeFixture() {
  const root = mkdtempSync(path.join(tmpBase, "pa-rb-"));
  git(["init", "-b", "main", "--template="], root);
  git(["commit", "--allow-empty", "-m", "root"], root);
  writeFileSync(path.join(root, "AGENTS.md"), "fixture\n");
  mkdirSync(path.join(root, ".cursor/hooks"), { recursive: true });
  writeFileSync(path.join(root, ".cursor/hooks/stop.py"), "# fixture\n");
  git(["add", "AGENTS.md", ".cursor/hooks/stop.py"], root);
  git(["commit", "-m", "setup"], root);
  git(["branch", "backup/test-fixture"], root);
  const manifest = path.join(root, "manifest.txt");
  writeFileSync(manifest, "AGENTS.md\n.cursor/hooks/stop.py\n");
  const excludes = path.join(REPO, "scripts/agent/secret-excludes");
  return { root, backup: "backup/test-fixture", manifest, excludes };
}

let ok = true;
const check = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    ok = false;
  } else console.log("OK  ", m);
};

const happy = makeFixture();
const good = runCheck(happy, {}, [], 0);
check(good.ok && /CHECK ok/.test(good.out), "fixture with backup + exact manifest PASSes mechanism check");

const apply = runCheck(happy, {}, ["--apply"], 2);
check(apply.ok && /refuse/.test(apply.out), "--apply is refused and is not a rollback");

writeFileSync(path.join(happy.root, ".cursor/hooks/extra.py"), "# unexpected\n");
const unexpected = runCheck(happy, {}, [], 1);
check(unexpected.ok && /UNEXPECTED/.test(unexpected.out), "unexpected setup file is not a PASS");
rmSync(happy.root, { recursive: true, force: true });

const missing = makeFixture();
const noBackup = runCheck(missing, { PA_ROLLBACK_BACKUP: "backup/does-not-exist" }, [], 1);
check(noBackup.ok && /backup ref missing/.test(noBackup.out), "missing backup ref is FAIL, not PASS");

const defaultName = runCheck(missing, { PA_ROLLBACK_BACKUP: "" }, [], 1);
check(
  defaultName.ok && /backup\/pre-agent-env-20260925/.test(defaultName.out) && /missing/.test(defaultName.out),
  "default owner backup name missing on fixture is FAIL, not PASS",
);
rmSync(missing.root, { recursive: true, force: true });

const secretFix = makeFixture();
writeFileSync(secretFix.manifest, "AGENTS.md\n.env\n");
const secret = runCheck(secretFix, {}, [], 1);
check(secret.ok && /secret path/.test(secret.out), "manifest naming a secret is FAIL");
rmSync(secretFix.root, { recursive: true, force: true });

console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
