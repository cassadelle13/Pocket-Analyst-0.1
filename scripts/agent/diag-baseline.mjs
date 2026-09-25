#!/usr/bin/env node
// Compares TypeScript / ESLint diagnostics against a committed baseline using stable keys.
//
// Key = "<repo-relative file>|<code or rule>|<normalized message>" (line/column excluded, so moving
// code does not create "new" errors). Keys are a multiset: a new occurrence of an existing key is new.
// A new error is detected even when another baseline error disappeared and the total is unchanged.
//
// Usage:
//   node scripts/agent/diag-baseline.mjs tsc    --project dashboard  [--baseline file]
//   node scripts/agent/diag-baseline.mjs eslint --project dashboard  [--files a.ts,b.tsx]
//   ... --update --reason "why"   (explicit, never automatic; refused when CI=true)
// Exit: 0 no new diagnostics, 1 new diagnostics, 2 tool/config failure.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/git.mjs";

const argv = process.argv.slice(2);
const tool = argv[0];
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);

if (!["tsc", "eslint"].includes(tool)) {
  console.error("usage: diag-baseline.mjs <tsc|eslint> --project <dir> [--baseline f] [--files a,b] [--update --reason r]");
  process.exit(2);
}

const projectDir = path.resolve(ROOT, opt("project", "dashboard"));
const projectName = path.basename(projectDir);
const baselineFile = path.resolve(ROOT, opt("baseline", `scripts/agent/baselines/${tool}-${projectName}.json`));
const onlyFiles = (opt("files", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((f) => path.relative(ROOT, path.resolve(ROOT, f)));

const rel = (abs) => path.relative(ROOT, path.isAbsolute(abs) ? abs : path.resolve(projectDir, abs)).split(path.sep).join("/");
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

function runTsc() {
  const tscBin = path.join(projectDir, "node_modules/typescript/bin/tsc");
  if (!existsSync(tscBin)) {
    console.error(`[diag] BLOCKED: ${rel(tscBin)} missing — run npm ci in ${rel(projectDir)}`);
    process.exit(2);
  }
  const tsconfig = opt("tsconfig", "tsconfig.json");
  let out = "";
  try {
    out = execFileSync(process.execPath, [tscBin, "--noEmit", "-p", tsconfig, "--pretty", "false", "--incremental", "false"], {
      cwd: projectDir,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
    if (!/error TS\d+/.test(out)) {
      console.error("[diag] tsc failed without diagnostics:\n" + out.slice(0, 4000));
      process.exit(2);
    }
  }
  const diags = [];
  let last = null;
  for (const line of out.split("\n")) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/);
    if (m) {
      last = { file: rel(m[1]), line: Number(m[2]), col: Number(m[3]), code: m[5], message: m[6] };
      diags.push(last);
    } else if (/^error TS\d+:/.test(line)) {
      last = { file: "<global>", line: 0, col: 0, code: line.match(/TS\d+/)[0], message: line.replace(/^error TS\d+:\s*/, "") };
      diags.push(last);
    } else if (last && /^\s+\S/.test(line)) {
      last.message += " " + line.trim();
    }
  }
  return diags.map((d) => ({ ...d, key: `${d.file}|${d.code}|${norm(d.message)}` }));
}

function runEslint() {
  const bin = path.join(projectDir, "node_modules/eslint/bin/eslint.js");
  if (!existsSync(bin)) {
    console.error(`[diag] BLOCKED: ${rel(bin)} missing — run npm ci in ${rel(projectDir)}`);
    process.exit(2);
  }
  const targets = onlyFiles.length
    ? onlyFiles.filter((f) => f.startsWith(rel(projectDir) + "/") && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && existsSync(path.join(ROOT, f)))
        .map((f) => path.relative(projectDir, path.join(ROOT, f)))
    : ["."];
  if (targets.length === 0) return [];
  let out = "";
  try {
    out = execFileSync(process.execPath, [bin, "-f", "json", "--no-warn-ignored", ...targets], {
      cwd: projectDir,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (e) {
    out = String(e.stdout ?? "");
    if (!out.trim().startsWith("[")) {
      console.error("[diag] eslint crashed:\n" + String(e.stderr ?? e.message).slice(0, 4000));
      process.exit(2);
    }
  }
  const diags = [];
  for (const file of JSON.parse(out)) {
    for (const m of file.messages) {
      const sev = m.severity === 2 ? "error" : "warn";
      diags.push({
        file: rel(file.filePath),
        line: m.line ?? 0,
        col: m.column ?? 0,
        code: `${m.ruleId ?? "core"}:${sev}`,
        message: m.message,
        fatal: !!m.fatal,
      });
    }
  }
  return diags.map((d) => ({ ...d, key: `${d.file}|${d.code}|${norm(d.message)}` }));
}

const diags = tool === "tsc" ? runTsc() : runEslint();
const counts = {};
for (const d of diags) counts[d.key] = (counts[d.key] ?? 0) + 1;

if (flag("update")) {
  const reason = opt("reason", "");
  if (process.env.CI === "true") {
    console.error("[diag] refusing --update in CI");
    process.exit(2);
  }
  if (!reason) {
    console.error("[diag] --update requires --reason \"...\" (baseline changes must be explained)");
    process.exit(2);
  }
  mkdirSync(path.dirname(baselineFile), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    baselineFile,
    JSON.stringify({ tool, project: rel(projectDir), reason, total: diags.length, entries: sorted }, null, 2) + "\n",
  );
  console.log(`[diag] baseline written: ${rel(baselineFile)} (${diags.length} diagnostics, ${Object.keys(sorted).length} keys)`);
  process.exit(0);
}

let baseline = { entries: {} };
if (existsSync(baselineFile)) baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
else console.error(`[diag] no baseline at ${rel(baselineFile)}: every diagnostic counts as new`);

const inScope = (key) => !onlyFiles.length || onlyFiles.includes(key.split("|")[0]);
const remaining = {};
for (const [k, v] of Object.entries(baseline.entries ?? {})) if (inScope(k)) remaining[k] = v;

const fresh = [];
for (const d of diags) {
  if ((remaining[d.key] ?? 0) > 0) remaining[d.key] -= 1;
  else fresh.push(d);
}
const resolved = Object.entries(remaining).filter(([, v]) => v > 0);
const errorsNotBaselined = fresh.filter((d) => tool === "tsc" || d.code.endsWith(":error"));

const label = `${tool}:${rel(projectDir)}${onlyFiles.length ? ` (${onlyFiles.length} files)` : ""}`;
console.log(`[diag] ${label}: current=${diags.length} baseline=${Object.values(baseline.entries ?? {}).reduce((a, b) => a + b, 0)} new=${fresh.length} resolved=${resolved.reduce((a, [, v]) => a + v, 0)}`);
for (const d of fresh.slice(0, 50)) console.log(`  NEW ${d.file}:${d.line}:${d.col} ${d.code} ${norm(d.message).slice(0, 240)}`);
if (fresh.length > 50) console.log(`  ... ${fresh.length - 50} more`);
for (const [k, v] of resolved.slice(0, 20)) console.log(`  RESOLVED x${v} ${k.slice(0, 240)}`);
if (resolved.length) console.log("  (resolved entries can be removed from the baseline with --update --reason; never done automatically)");

process.exit(fresh.length || errorsNotBaselined.length ? 1 : 0);
