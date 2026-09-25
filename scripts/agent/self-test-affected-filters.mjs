#!/usr/bin/env node
// Confirms dashboard affected passes two Vitest filters as separate args, not a "|" regex.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const checkSh = readFileSync(path.join(REPO, "scripts/agent/check.sh"), "utf8");
if (checkSh.includes("src/components/dashboard/__tests__|")) {
  console.error("FAIL check.sh still passes a single '|' vitest filter");
  process.exit(1);
}
if (
  !checkSh.includes("run_dashboard_tests src/components/dashboard/__tests__ src/lib/semantic/__tests__/scopeConsistency.test.ts")
) {
  console.error("FAIL check.sh missing two separate dashboard affected filters");
  process.exit(1);
}

const out = execFileSync(
  "npm",
  [
    "test",
    "--",
    "src/components/dashboard/__tests__",
    "src/lib/semantic/__tests__/scopeConsistency.test.ts",
  ],
  { cwd: path.join(REPO, "dashboard"), encoding: "utf8" },
);

const hasChart = /chartPreviewScope\.test\.ts/.test(out);
const hasScope = /scopeConsistency\.test\.ts/.test(out);
if (!hasChart || !hasScope) {
  console.error("FAIL both suites did not run\n", out.slice(-800));
  process.exit(1);
}
const filesLine = out.split("\n").find((l) => /Test Files/.test(l)) || "";
console.log("OK  two filters:", filesLine.trim());
console.log("PASS");
