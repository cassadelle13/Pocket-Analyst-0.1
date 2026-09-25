#!/usr/bin/env node
// Structural discovery: rules, skills, agents, hooks exist and have required fields.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/git.mjs";

const errors = [];
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => {
  errors.push(m);
  console.log(`  BAD ${m}`);
};

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

console.log("[discover] Cursor project components");

const rulesDir = path.join(ROOT, ".cursor/rules");
const rules = existsSync(rulesDir) ? readdirSync(rulesDir).filter((f) => f.endsWith(".mdc")) : [];
if (rules.length !== 6) bad(`expected 6 rules, found ${rules.length}`);
else ok(`rules: ${rules.join(", ")}`);
for (const f of rules) {
  const fm = frontmatter(readFileSync(path.join(rulesDir, f), "utf8"));
  if (!fm.description) bad(`${f}: missing description`);
  if (fm.alwaysApply === "true") bad(`${f}: should be file-scoped, not alwaysApply`);
  if (!fm.globs) bad(`${f}: missing globs`);
}

const skillsRoot = path.join(ROOT, ".cursor/skills");
const expectedSkills = ["plan-change", "change-semantic-planner", "debug-empty-chart", "verify-change", "prepare-pr"];
for (const name of expectedSkills) {
  const skill = path.join(skillsRoot, name, "SKILL.md");
  if (!existsSync(skill)) {
    bad(`missing skill ${name}/SKILL.md`);
    continue;
  }
  const fm = frontmatter(readFileSync(skill, "utf8"));
  if (fm.name !== name) bad(`${name}: frontmatter name '${fm.name}' must match folder`);
  if (!fm.description) bad(`${name}: missing description`);
  else ok(`skill ${name}`);
}

const agentsDir = path.join(ROOT, ".cursor/agents");
const expectedAgents = ["semantic-architect.md", "query-path-reviewer.md", "verifier.md"];
for (const f of expectedAgents) {
  const p = path.join(agentsDir, f);
  if (!existsSync(p)) {
    bad(`missing agent ${f}`);
    continue;
  }
  const fm = frontmatter(readFileSync(p, "utf8"));
  if (!fm.name || !fm.description) bad(`${f}: name/description required`);
  else ok(`agent ${fm.name} readonly=${fm.readonly ?? "false"}`);
}

const hooksJson = path.join(ROOT, ".cursor/hooks.json");
if (!existsSync(hooksJson)) bad("missing .cursor/hooks.json");
else {
  const cfg = JSON.parse(readFileSync(hooksJson, "utf8"));
  if (cfg.version !== 1) bad("hooks.json version must be 1");
  const events = Object.keys(cfg.hooks ?? {});
  for (const ev of ["beforeShellExecution", "beforeReadFile", "afterFileEdit", "stop"]) {
    if (!events.includes(ev)) bad(`hooks.json missing ${ev}`);
  }
  ok(`hooks.json events: ${events.join(", ")}`);
  for (const [ev, list] of Object.entries(cfg.hooks ?? {})) {
    for (const h of list) {
      const cmd = h.command;
      if (!cmd) {
        bad(`${ev}: missing command`);
        continue;
      }
      const parts = String(cmd).split(/\s+/).filter(Boolean);
      const scriptRel = parts.find((p) => p.startsWith(".cursor/hooks/")) || parts[parts.length - 1];
      const script = path.join(ROOT, scriptRel);
      if (!existsSync(script)) bad(`${ev}: script missing ${cmd}`);
      else ok(`${ev} -> ${cmd}`);
    }
  }
}

if (errors.length) {
  console.log(`[discover] FAIL ${errors.length}`);
  process.exit(1);
}
console.log("[discover] PASS");
