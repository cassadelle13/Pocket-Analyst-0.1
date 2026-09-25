#!/usr/bin/env node
// Prints repo-relative changed paths for the *task* scope, one per line.
//   node scripts/agent/changed-files.mjs
//   node scripts/agent/changed-files.mjs --base origin/main
//   node scripts/agent/changed-files.mjs --meta-out .cursor/state/scope.json
//   node scripts/agent/changed-files.mjs --fail-if-unknown-empty
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { collectTaskScope, ROOT } from "./lib/git.mjs";

const opt = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const base = opt("base");
const scope = collectTaskScope({ base });
const paths = [...scope.files.keys()].sort();
console.error(
  `[scope] base=${scope.base || "-"} source=${scope.source} unknown=${scope.unknown ? 1 : 0} files=${paths.length}`,
);
const metaOut = opt("meta-out");
if (metaOut) {
  const abs = path.isAbsolute(metaOut) ? metaOut : path.join(ROOT, metaOut);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    JSON.stringify(
      { base: scope.base, source: scope.source, unknown: scope.unknown, files: paths },
      null,
      2,
    ) + "\n",
  );
}
for (const p of paths) console.log(p);
if (process.argv.includes("--fail-if-unknown-empty") && scope.unknown && paths.length === 0) {
  console.error("[scope] FAIL: task base unknown and change set is empty — not a successful empty check");
  process.exit(2);
}
