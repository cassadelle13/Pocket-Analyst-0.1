// Shared git helpers for scripts/agent. No dependencies beyond Node 20 stdlib.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const ROOT = path.resolve(process.env.PA_ROOT || DEFAULT_ROOT);

export function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

// Paths never treated as part of the change set (local state, toolchain, build output).
// Do not ignore all of `.cursor/` or `scripts/` — only local runtime state.
const IGNORED_PREFIXES = [".cursor/state/", ".tools/", ".next/", "dashboard/.next/", "node_modules/"];
const isIgnored = (p) => IGNORED_PREFIXES.some((pre) => p.startsWith(pre) || p.includes(`/${pre}`));

/** Report-only text: may change without invalidating a successful check (including build). */
export const REPORT_PATHS = new Set(["SETUP_REPORT.md", "SETUP_REVIEW.md"]);

const CHECK_CONFIG_PREFIXES = [
  "scripts/agent/",
  ".cursor/hooks/",
  ".cursor/rules/",
  ".cursor/skills/",
  ".cursor/agents/",
];
const CHECK_CONFIG_FILES = new Set([
  ".cursor/hooks.json",
  ".github/workflows/verify.yml",
  "AGENTS.md",
  "dashboard/package.json",
  "datatalk-agent/package.json",
  "dashboard/tsconfig.typecheck.json",
  "dashboard/vitest.config.ts",
  "dashboard/eslint.config.js",
]);

export function classifyPath(p) {
  if (REPORT_PATHS.has(p)) return "report";
  if (CHECK_CONFIG_FILES.has(p) || CHECK_CONFIG_PREFIXES.some((pre) => p.startsWith(pre))) return "checkConfig";
  return "content";
}

function walkCheckConfigFiles() {
  const out = [];
  const visit = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (name === "." || name === "..") continue;
        visit(`${rel.replaceAll("\\", "/")}/${name}`);
      }
      return;
    }
    out.push(rel.replaceAll("\\", "/"));
  };
  for (const pre of CHECK_CONFIG_PREFIXES) visit(pre.replace(/\/$/, ""));
  for (const f of CHECK_CONFIG_FILES) if (existsSync(path.join(ROOT, f))) out.push(f);
  return [...new Set(out)].filter((p) => !isIgnored(p)).sort();
}

/**
 * Parses `git diff -U0` output into { files: Map<path, {status, added: [{line, text}]}> }.
 * Uses --ignore-cr-at-eol so that CRLF<->LF-only rewrites (present in the owner's WIP) do not
 * appear as changed lines or changed files.
 */
export function parseUnifiedDiff(text) {
  const files = new Map();
  let cur = null;
  let newLine = 0;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = raw.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/);
      cur = { path: m ? m[2] : raw.slice(11), status: "M", added: [], hasHunk: false };
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith("new file mode")) cur.status = "A";
    else if (raw.startsWith("deleted file mode")) cur.status = "D";
    else if (raw.startsWith("Binary files")) cur.hasHunk = true;
    else if (raw.startsWith("@@")) {
      const m = raw.match(/\+(\d+)(?:,(\d+))?/);
      newLine = m ? Number(m[1]) : 0;
      cur.hasHunk = true;
    } else if (raw.startsWith("+") && !raw.startsWith("+++")) {
      cur.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    }
    if (cur && (cur.hasHunk || cur.status === "D")) files.set(cur.path, cur);
  }
  return files;
}

function unquote(p) {
  if (p.startsWith('"') && p.endsWith('"')) {
    // git quotes non-ASCII paths with octal escapes; decode to UTF-8.
    const bytes = [];
    const s = p.slice(1, -1);
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === "\\" && /[0-7]{3}/.test(s.slice(i + 1, i + 4))) {
        bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
        i += 3;
      } else bytes.push(s.charCodeAt(i));
    }
    return Buffer.from(bytes).toString("utf8");
  }
  return p;
}

export function untrackedFiles() {
  return git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter((p) => !isIgnored(p));
}

function revExists(ref) {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function mergeBase(cand) {
  try {
    return git(["merge-base", "HEAD", cand]).trim();
  } catch {
    return null;
  }
}

function isAncestor(a, b) {
  try {
    git(["merge-base", "--is-ancestor", a, b]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Task base: explicit PA_CHECK_BASE / --base, else the merge-base closest to HEAD
 * among local `main` and `origin/main`. A stale origin/main behind local main is
 * not used — that would treat the snapshot commit as the task. unknown=true when
 * no reliable base exists — an empty change set is not a task PASS.
 */
export function resolveTaskBase({ explicit } = {}) {
  const given = (explicit || process.env.PA_CHECK_BASE || "").trim();
  if (given) {
    if (!revExists(given)) return { base: null, source: "explicit-missing", unknown: true };
    const mb = mergeBase(given);
    return { base: mb || given, source: given, unknown: false };
  }
  const candidates = [];
  for (const cand of ["main", "origin/main"]) {
    if (!revExists(cand)) continue;
    const mb = mergeBase(cand);
    if (mb) candidates.push({ cand, mb });
  }
  if (!candidates.length) return { base: null, source: "none", unknown: true };
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (c.mb === best.mb) continue;
    if (isAncestor(best.mb, c.mb)) best = c;
    else if (isAncestor(c.mb, best.mb)) continue;
    const bestDist = Number(git(["rev-list", "--count", `${best.mb}..HEAD`]).trim() || "0");
    const cDist = Number(git(["rev-list", "--count", `${c.mb}..HEAD`]).trim() || "0");
    if (cDist < bestDist) best = c;
  }
  return { base: best.mb, source: best.cand, unknown: false };
}

const DIFF_ARGS = ["-c", "core.quotepath=false", "diff", "-U0", "--no-color", "--ignore-cr-at-eol", "--no-ext-diff"];

function ingestDiff(files, diffText) {
  for (const [p, f] of parseUnifiedDiff(diffText)) {
    const clean = unquote(p);
    const rec = { ...f, path: clean };
    const prev = files.get(clean);
    if (!prev) files.set(clean, rec);
    else {
      files.set(clean, {
        ...rec,
        added: [...prev.added, ...rec.added],
        hasHunk: prev.hasHunk || rec.hasHunk,
        status: rec.status === "D" || prev.status === "D" ? rec.status : prev.status,
      });
    }
  }
}

function ingestUntracked(files) {
  for (const p of untrackedFiles()) {
    let text = "";
    try {
      text = readFileSync(path.join(ROOT, p), "utf8");
    } catch {
      text = "";
    }
    const added = text.split("\n").map((t, i) => ({ line: i + 1, text: t }));
    files.set(p, { path: p, status: "A", added, hasHunk: true });
  }
}

/**
 * Task change set: branch commits from a reliable base plus staged, unstaged, and untracked.
 * CI (explicit base): three-dot base...HEAD plus any dirty/untracked on the runner.
 */
export function collectTaskScope({ base } = {}) {
  const resolved = resolveTaskBase({ explicit: base });
  const files = new Map();
  if (resolved.base && !resolved.unknown) {
    const explicit = Boolean((base || process.env.PA_CHECK_BASE || "").trim());
    if (explicit) {
      ingestDiff(files, git([...DIFF_ARGS, `${resolved.base}...HEAD`]));
      ingestDiff(files, git([...DIFF_ARGS, "HEAD"]));
    } else {
      ingestDiff(files, git([...DIFF_ARGS, resolved.base]));
    }
  } else {
    ingestDiff(files, git([...DIFF_ARGS, "HEAD"]));
  }
  ingestUntracked(files);
  for (const p of [...files.keys()]) if (isIgnored(p)) files.delete(p);
  return { files, ...resolved };
}

export function collectChanges({ base } = {}) {
  return collectTaskScope({ base }).files;
}

function hashPaths(paths) {
  const entries = {};
  const existing = [];
  for (const p of paths) {
    if (existsSync(path.join(ROOT, p))) existing.push(p);
    else entries[p] = "DELETED";
  }
  if (existing.length) {
    const hashes = git(["hash-object", "--stdin-paths"], { input: existing.join("\n") + "\n", stdio: ["pipe", "pipe", "pipe"] })
      .trim()
      .split("\n");
    existing.forEach((p, i) => {
      entries[p] = hashes[i];
    });
  }
  return entries;
}

function fpOf(head, entries) {
  return createHash("sha256")
    .update(head + "\n" + Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}\t${v}`).join("\n"))
    .digest("hex");
}

/** Content snapshot used to detect stale verification. Reports are separate from content/config. */
export function snapshot() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const tracked = git(["diff", "--name-only", "-z", "HEAD"]).split("\0").filter(Boolean);
  const dirty = [...new Set([...tracked, ...untrackedFiles()])].filter((p) => !isIgnored(p)).sort();
  const contentPaths = dirty.filter((p) => classifyPath(p) === "content");
  const reportPaths = dirty.filter((p) => classifyPath(p) === "report");
  const configPaths = [...new Set([...walkCheckConfigFiles(), ...dirty.filter((p) => classifyPath(p) === "checkConfig")])].sort();

  const content = hashPaths(contentPaths);
  const checkConfig = hashPaths(configPaths);
  const reports = hashPaths(reportPaths);

  const fingerprints = {
    content: fpOf(head, content),
    checkConfig: fpOf(head, checkConfig),
    reports: fpOf(head, reports),
  };
  // Primary freshness: product + check config. Report-only edits do not change this.
  const fingerprint = createHash("sha256")
    .update(`${fingerprints.content}\n${fingerprints.checkConfig}\n`)
    .digest("hex");
  return {
    head,
    fingerprint,
    fingerprints,
    entries: { content, checkConfig, reports },
  };
}

function flatEntries(snap) {
  if (!snap) return {};
  if (snap.entries && !snap.entries.content && !snap.entries.checkConfig) return snap.entries;
  return {
    ...(snap.entries?.content ?? {}),
    ...(snap.entries?.checkConfig ?? {}),
    ...(snap.entries?.reports ?? {}),
  };
}

/** Paths whose content differs between two snapshots (HEAD change counts as full re-check of both sets). */
export function diffSnapshots(a, b, { includeReports = false } = {}) {
  const classNames = includeReports ? ["content", "checkConfig", "reports"] : ["content", "checkConfig"];
  const keys = new Set();
  const out = [];
  if (a?.entries?.content || b?.entries?.content) {
    for (const cls of classNames) {
      const ae = a?.entries?.[cls] ?? {};
      const be = b?.entries?.[cls] ?? {};
      for (const k of new Set([...Object.keys(ae), ...Object.keys(be)])) {
        if (ae[k] !== be[k]) out.push(k);
        keys.add(k);
      }
    }
  } else {
    const ae = flatEntries(a);
    const be = flatEntries(b);
    for (const k of new Set([...Object.keys(ae), ...Object.keys(be)])) {
      if (!includeReports && classifyPath(k) === "report") continue;
      if (ae[k] !== be[k]) out.push(k);
    }
  }
  if (a && b && a.head !== b.head) {
    for (const p of git(["diff", "--name-only", "-z", a.head, b.head]).split("\0").filter(Boolean)) {
      if (!includeReports && classifyPath(p) === "report") continue;
      out.push(p);
    }
  }
  return [...new Set(out)].filter((p) => !isIgnored(p)).sort();
}

export function reportOnlyDiff(a, b) {
  const ae = a?.entries?.reports ?? {};
  const be = b?.entries?.reports ?? {};
  const keys = new Set([...Object.keys(ae), ...Object.keys(be)]);
  return [...keys].filter((k) => ae[k] !== be[k]).sort();
}
