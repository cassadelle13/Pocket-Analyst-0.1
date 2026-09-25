---
name: prepare-pr
description: Prepares a Pocket Analyst pull request from a feature branch using shared checks and reviewers. Use when the user asks for a PR, a merge-ready branch, or a PR description.
---

# prepare-pr

## When

User asks to open or draft a PR, or the change is ready to review. Do not push or merge unless the user explicitly asked.

## Steps

1. Confirm the branch is not `main` (`git branch --show-current`). Refuse to commit to `main`.
2. Task scope is `scripts/agent/changed-files.mjs` / `.cursor/state/scope.json`: reliable `base...HEAD` or merge-base plus staged, unstaged, and untracked. Do not use `git diff HEAD` alone. If `unknown` and the list is empty, that is not a successful empty review.
3. `scripts/agent/check.sh full` (includes `next build`). Then `node scripts/agent/verify-stamp.mjs check --require-mode full --require-build --for-task`.
4. If the task-scope list touches query/agent/ai-service globs or contains `role`, `tableKey`, `password`, invoke `query-path-reviewer` (read-only) with that same list.
5. Invoke `verifier` with the same task-scope list. Do not let reviewers patch the same tree they review.
6. Draft the PR in plain language: what changed, how it was checked, what was not checked, how to roll back. Include `it.fails` / KNOWN DEFECT items. C4 project-load hydrate is uncovered unless a real canvas test exists.

## Success

Description can be pasted into `gh pr create`. Checks are green or failures are explained. No secrets in the diff.

## On error

If remote/GitHub is unavailable, stop at a local description and mark CI as BLOCKED. Do not force-push, do not merge.
