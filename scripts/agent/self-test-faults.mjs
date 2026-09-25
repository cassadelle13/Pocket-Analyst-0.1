#!/usr/bin/env node
// Isolated fault-injection: a new diagnostic is detected even when the total count is unchanged.
// Writes only under .cursor/state/fault-injection/ and deletes it afterwards.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/git.mjs";

const dir = path.join(ROOT, ".cursor/state/fault-injection");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const target = path.join(dir, "injected.ts");
writeFileSync(target, "const faultInjectionUnique: number = 'not-a-number';\n");

const tscBin = path.join(ROOT, "dashboard/node_modules/typescript/bin/tsc");
let out = "";
try {
  execFileSync(process.execPath, [tscBin, "--noEmit", "--pretty", "false", "--isolatedModules", "false", target], {
    encoding: "utf8",
  });
} catch (e) {
  out = String(e.stdout ?? "") + String(e.stderr ?? "");
}

const hasTs2322 = /error TS2322/.test(out);
rmSync(dir, { recursive: true, force: true });

if (!hasTs2322) {
  console.error("[fault] expected TS2322 on isolated file, got:\n" + out.slice(0, 500));
  process.exit(1);
}
console.log("[fault] isolated TS2322 detected; artifact removed");
