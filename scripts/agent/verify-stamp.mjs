#!/usr/bin/env node
// Writes / checks a verification stamp against the working-tree snapshot.
// Official write is only for `scripts/agent/check.sh` (PA_CHECK_RUNNING=1).
// Isolated tests may write to --stamp-file outside .cursor/state.
//   node scripts/agent/verify-stamp.mjs check [--require-mode full] [--require-build]
// Exit: 0 stamp matches requirements, 1 stale/missing/insufficient, 2 usage.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT, collectTaskScope, diffSnapshots, reportOnlyDiff, snapshot } from "./lib/git.mjs";
import { evaluateCoverage } from "./lib/requiredSuites.mjs";

const MODE_RANK = { quick: 1, affected: 2, full: 3 };

const cmd = process.argv[2];
const opt = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (n) => process.argv.includes(`--${n}`);
const officialStamp = path.join(ROOT, ".cursor/state/verify-stamp.json");
const stampFile = path.resolve(opt("stamp-file", officialStamp));
const isOfficialStamp = path.resolve(stampFile) === path.resolve(officialStamp);

if (cmd === "write") {
  if (isOfficialStamp && process.env.PA_CHECK_RUNNING !== "1") {
    console.error(
      "[stamp] refuse write: official stamp can only be written by scripts/agent/check.sh (PA_CHECK_RUNNING=1). Do not re-affirm an old PASS with write --mode/--build.",
    );
    process.exit(2);
  }
  mkdirSync(path.dirname(stampFile), { recursive: true });
  const snap = snapshot();
  const suites = String(opt("suites", ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const payload = {
    writtenAt: new Date().toISOString(),
    mode: opt("mode", "affected"),
    exitCode: Number(opt("exit", "0")),
    build: opt("build", "0") === "1",
    suites,
    source: isOfficialStamp ? "check.sh" : "test",
    head: snap.head,
    fingerprint: snap.fingerprint,
    fingerprints: snap.fingerprints,
    files: [
      ...Object.keys(snap.entries.content),
      ...Object.keys(snap.entries.checkConfig),
    ],
    entries: snap.entries,
  };
  writeFileSync(stampFile, JSON.stringify(payload, null, 2) + "\n");
  const lastCheck = path.join(ROOT, ".cursor/state/last-check.json");
  if (isOfficialStamp) {
    mkdirSync(path.dirname(lastCheck), { recursive: true });
    writeFileSync(
      lastCheck,
      JSON.stringify({
        mode: payload.mode,
        exitCode: payload.exitCode,
        build: payload.build ? 1 : 0,
        suites: payload.suites,
        at: payload.writtenAt,
      }) + "\n",
    );
  }
  console.log(
    `[stamp] wrote ${path.relative(ROOT, stampFile)} mode=${payload.mode} build=${payload.build ? 1 : 0} fingerprint=${snap.fingerprint.slice(0, 12)} files=${payload.files.length}`,
  );
  process.exit(0);
}

if (cmd === "check") {
  if (!existsSync(stampFile)) {
    console.log("[stamp] missing — verification has not been recorded");
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(stampFile, "utf8"));
  const now = snapshot();
  if (stamp.exitCode !== 0) {
    console.log(`[stamp] last recorded check failed (exit ${stamp.exitCode})`);
    process.exit(1);
  }

  const requireMode = opt("require-mode", "");
  if (requireMode) {
    const have = MODE_RANK[stamp.mode] || 0;
    const need = MODE_RANK[requireMode] || 99;
    if (have < need) {
      console.log(`[stamp] INSUFFICIENT mode=${stamp.mode || "?"} required=${requireMode} (PASS ${stamp.mode} does not satisfy ${requireMode})`);
      process.exit(1);
    }
  }
  if (flag("require-build") && !stamp.build) {
    console.log(`[stamp] INSUFFICIENT build=false required=true (full without build does not satisfy pre-merge build)`);
    process.exit(1);
  }

  const stale = stamp.fingerprints?.content
    ? stamp.fingerprints.content !== now.fingerprints.content || stamp.fingerprints.checkConfig !== now.fingerprints.checkConfig
    : stamp.fingerprint !== now.fingerprint;

  if (stale) {
    const changed = diffSnapshots(stamp, now, { includeReports: false });
    console.log(`[stamp] STALE after ${changed.length} path(s): ${changed.slice(0, 20).join(", ")}`);
    process.exit(1);
  }

  const reports = reportOnlyDiff(stamp, now);
  if (flag("for-task")) {
    const task = collectTaskScope({ base: opt("base", "") || undefined });
    if (task.unknown && task.files.size === 0) {
      console.log("[stamp] INSUFFICIENT task base unknown and change set empty — not a PASS for the task");
      process.exit(1);
    }
    const cov = evaluateCoverage([...task.files.keys()], stamp.suites || [], stamp.mode);
    if (cov.docsOnly) {
      console.log(`[stamp] current docs-only (mode=${stamp.mode} at=${stamp.writtenAt}; build not required)`);
      process.exit(0);
    }
    if (!cov.ok) {
      console.log(`[stamp] INCOMPLETE for-task\n${cov.message}`);
      process.exit(1);
    }
    console.log(`[stamp] current for-task (mode=${stamp.mode} suites-ok at=${stamp.writtenAt})`);
    process.exit(0);
  }
  if (reports.length) {
    console.log(`[stamp] current (mode=${stamp.mode} build=${stamp.build ? 1 : 0} at=${stamp.writtenAt}; report-only ${reports.join(", ")} — rebuild not required)`);
    process.exit(0);
  }
  console.log(`[stamp] current (mode=${stamp.mode} build=${stamp.build ? 1 : 0} at=${stamp.writtenAt})`);
  process.exit(0);
}

console.error("usage: verify-stamp.mjs check [--require-mode full] [--require-build] [--for-task]");
console.error("write: only from check.sh (official) or --stamp-file for isolated tests");
process.exit(2);
