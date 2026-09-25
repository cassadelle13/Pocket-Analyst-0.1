---
name: debug-empty-chart
description: Debugs an empty or synthetic chart by walking filters, scoped query, SQL, and source errors. Use when a visual is blank, shows Ghost Data, or a user reports missing numbers.
---

# debug-empty-chart

## When

A chart is empty, a slicer has no values, or the UI looks fine but the data is wrong. Do not trust the picture alone.

## Steps (stop at the first mismatch)

1. Read `localStorage` key `dashboard:bi-filters:${projectId}` and `dashboard:semantic:projectId`.
2. Compute scoped filters with both `getScopedBiFiltersForChart` and `scopeBiFiltersForRequest`. If they differ, that is C1 — record it.
3. Inspect the `/api/semantic/query` or `/api/query` or `/api/rest/*` request body (role, `globalContext`, `logicalQuery`, `customSql`).
4. Read compiled SQL from the semantic `debug` payload when present.
5. Distinguish: HTTP error, `{ columns, rows: [] }` (real empty), `[]` from a rest route after ClickHouse failure (I10), Ghost Data (I11).
6. Minimal fix + a regression test. If the bug is I9/I10/I11/C4, do not silently refactor; file it as a known defect unless the user asked to fix that defect.

## Success

Root cause names a layer (persist, scope, compile, execute, mask). The test would have failed on the bug.

## On error

If the dashboard is not running, use unit/contract tests and route source — do not start Docker against owner volumes. If network traces are unavailable, say NOT RUN.
