#!/usr/bin/env node
// Isolated stamp semantics. Does not update the official .cursor/state/verify-stamp.json.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync(path.join(tmpdir(), "pa-stamp-"));
const stamp = path.join(dir, "verify-stamp.json");
const script = path.join(REPO, "scripts/agent/verify-stamp.mjs");
const childEnv = { ...process.env, PA_ROOT: REPO };

function run(args, { expect = 0 } = {}) {
  try {
    const out = execFileSync(process.execPath, [script, ...args, "--stamp-file", stamp], {
      cwd: REPO,
      encoding: "utf8",
      env: childEnv,
    });
    if (expect !== 0) {
      console.error("FAIL expected exit", expect, "got 0", args.join(" "), out);
      return false;
    }
    return { ok: true, out };
  } catch (e) {
    const code = e.status ?? 1;
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    if (code !== expect) {
      console.error("FAIL expected", expect, "got", code, args.join(" "), out);
      return false;
    }
    return { ok: true, out };
  }
}

let ok = true;
const check = (cond, msg) => {
  if (!cond) {
    console.error("FAIL", msg);
    ok = false;
  } else console.log("OK  ", msg);
};

check(run(["write", "--mode", "affected", "--exit", "0", "--build", "0"]).ok, "write affected");
check(run(["check", "--require-mode", "full"], { expect: 1 }).ok, "affected does not satisfy full");
check(run(["check"]).ok, "affected satisfies plain check");

check(run(["write", "--mode", "full", "--exit", "0", "--build", "0"]).ok, "write full no-build");
check(run(["check", "--require-mode", "full", "--require-build"], { expect: 1 }).ok, "full without build does not satisfy require-build");
check(run(["check", "--require-mode", "full"]).ok, "full without build satisfies mode full");

check(run(["write", "--mode", "full", "--exit", "0", "--build", "1", "--suites", "tsc-dashboard,next-build"]).ok, "write full+build");
check(run(["check", "--require-mode", "full", "--require-build"]).ok, "full+build satisfies pre-merge");
check(run(["check", "--require-mode", "affected"]).ok, "full satisfies affected requirement");

const raw = JSON.parse(readFileSync(stamp, "utf8"));
raw.fingerprints = { ...raw.fingerprints, content: "deadbeef" };
writeFileSync(stamp, JSON.stringify(raw, null, 2));
check(run(["check"], { expect: 1 }).ok, "content fingerprint mismatch is STALE");

check(run(["write", "--mode", "full", "--exit", "0", "--build", "1"]).ok, "rewrite after content fault");
const raw2 = JSON.parse(readFileSync(stamp, "utf8"));
raw2.fingerprints = { ...raw2.fingerprints, checkConfig: "cafebabe" };
writeFileSync(stamp, JSON.stringify(raw2, null, 2));
check(run(["check"], { expect: 1 }).ok, "check-config fingerprint mismatch is STALE");

check(run(["write", "--mode", "full", "--exit", "0", "--build", "1"]).ok, "rewrite after config fault");
const raw3 = JSON.parse(readFileSync(stamp, "utf8"));
raw3.entries = { ...raw3.entries, reports: { "SETUP_REVIEW.md": "old" } };
writeFileSync(stamp, JSON.stringify(raw3, null, 2));
const r = run(["check"]);
check(r.ok && /report-only/.test(r.out || ""), "report-only change stays current");

try {
  execFileSync(process.execPath, [script, "write", "--mode", "full", "--exit", "0", "--build", "1"], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PA_ROOT: REPO, PA_CHECK_RUNNING: "" },
  });
  check(false, "official write without PA_CHECK_RUNNING must fail");
} catch (e) {
  check(e.status === 2 && /refuse write/.test(String(e.stderr ?? "") + String(e.stdout ?? "")), "official write without check.sh is refused");
}

rmSync(dir, { recursive: true, force: true });
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
