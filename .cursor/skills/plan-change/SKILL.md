---
name: plan-change
description: Plans a Pocket Analyst change against real query paths, duplicated representations, and required checks. Use before implementing semantic, filter, SQL, connection, or dashboard-state work.
---

# plan-change

## When

Any non-trivial change to planner, filters, API query routes, connections, uploads, or canvas state. Skip for typo-only edits.

## Steps

1. Name the AI danger zone from `AGENTS.md` (planner, filters, ChartPreview, role/SQL path, connections, schema, types/dialects, rest/synthetic, dead docs, ai-service contract).
2. List every representation of the same concept (table in `AGENTS.md` «Меняешь X — синхронизируй Y»). Search callers with Grep; do not stop at the first file.
3. List existing tests under `dashboard/src/**/__tests__` and gaps (negative cases, dialects, persist).
4. If the change touches `lib/semantic`, filters, field types, dialects, or `ChartPreview`, invoke the `semantic-architect` subagent with the plan. Reviewers must not edit code.
5. Output a plan: files from `scripts/agent/changed-files.mjs` (not `git diff HEAD` alone), checks (`scripts/agent/check.sh affected` / `full`), rollback via `scripts/agent/rollback-check.sh` first, and what will remain untested.

## Success

Plan names concrete paths that exist in this repo (not audit shorthand). Reviewer remarks, if any, are unresolved until the implementer addresses them.

## On error

If a path from the audit is missing, search the repo and record the actual path. Do not invent files. If `semantic-architect` is unavailable, say so and continue with the plan marked incomplete.
