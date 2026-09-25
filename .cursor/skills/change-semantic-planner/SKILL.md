---
name: change-semantic-planner
description: Changes compileSemanticQuery, validator, or dialects with a failing test first and per-dialect SQL checks. Use when editing dashboard/src/lib/semantic or schema-intelligence.
---

# change-semantic-planner

## When

Editing `dashboard/src/lib/semantic/**` or `dashboard/src/lib/schema-intelligence/**`, especially `planner.ts`, `validator.ts`, formula parsing, RLS, or ORDER BY.

## Steps

1. Read the exact block and all callers (`/api/semantic/query`, `values`, `retention`).
2. Add a failing test for the intended behavior in each affected dialect (`postgres`, `clickhouse`, `mssql`). Use `it.fails` + `KNOWN DEFECT` only for pre-existing bugs you are not fixing.
3. Change the planner/validator as little as possible. Do not swallow errors.
4. Run `scripts/agent/check.sh affected` from repo root (or `cd dashboard && npm test -- src/lib/semantic` while iterating). Do not treat that as `full`.
5. If a `.snap` changes, print the SQL diff and explain every line. The golden snapshot currently pins a missing ORDER BY for an explicit measure sort — do not “fix” the snap without fixing or documenting the planner.

## Success

New tests fail before the fix and pass after (unless marked `KNOWN DEFECT`). No new tsc/eslint keys. Callers still compile.

## On error

If vitest fails for an unrelated snapshot, stop and do not refresh snaps wholesale. If a dialect is not implemented (`mysql`), say so; do not add a fake passing test.
