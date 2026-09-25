---
name: verify-change
description: Verifies a Pocket Analyst change with the shared check scripts and a stale-stamp check. Use before claiming a task is done or after implementing a plan.
---

# verify-change

## When

Before saying the work is done, after a reviewer round, or when the `stop` hook reports a stale stamp.

## Steps

1. Incremental: `scripts/agent/check.sh affected` from the repo root (Node 20 via `scripts/agent/env.sh` / `.tools/node`). This is not a pre-merge result.
2. Before claiming merge-ready: `scripts/agent/check.sh full` (build is included by default). `PA_CHECK_BUILD=0` is debug-only; that stamp fails `--require-build`. Do not run a full build after every file edit — use `affected` while iterating.
3. For UI: open the affected route, check console and network. Real rows, not `[]` and not Ghost Data.
4. Invoke the `verifier` subagent with the file list and check output. Verifier must not edit product code.
5. After checks: `node scripts/agent/verify-stamp.mjs check --for-task`. A current `quick` stamp does not complete a task that required units. `affected` without a mapped suite for logic files is not enough. Docs-only may stay on `quick`. If the task base is unknown and the change set is empty, that is not a PASS. For a PR: add `--require-mode full --require-build`. Do not run `verify-stamp.mjs write` by hand — only `check.sh` may write the official stamp. Report-only edits (`SETUP_REPORT.md`, `SETUP_REVIEW.md`) do not stale the stamp. Changes to rules, skills, hooks, or `scripts/agent/*` do.

## Success

Check exit 0, stamp current, verifier report lists what passed and what was NOT RUN. Known defects stay labeled; they are not “verified behavior”.

## On error

Do not update `scripts/agent/baselines/*` unless the user asked and you pass `--reason`. Do not disable checks. If Node is missing, report BLOCKED and continue with independent parts.
