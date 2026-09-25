## Summary

-

## How verified

Task scope: `scripts/agent/changed-files.mjs` (base + staged/unstaged/untracked), not `git diff HEAD` alone.

- [ ] `scripts/agent/check.sh affected` or `full`
- [ ] No new tsc/eslint diagnostic keys
- [ ] Unit tests for touched modules
- [ ] `query-path-reviewer` if SQL/role/secrets changed
- [ ] `verifier` independent pass

## Not verified

-

## Known defects (do not mark as passing)

-

## Rollback

-
