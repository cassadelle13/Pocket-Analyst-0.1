# Query Runtime API

This document describes the operational query API used by the dashboard runtime.

## `POST /api/semantic/query`

Compile and execute a semantic logical query.

- Request fields:
  - `projectId`, `semanticModelId` or inline `semanticModel`
  - `query` (`sourceModel`, `dimensions`, `measures`, `filters`, `orderBy`, `limit`, `offset`)
  - `page`, `pageSize`, `offsetRows` (pagination helpers; converted to `query.limit/query.offset`)
  - `globalContext`, `requestContext`, `ephemeralCalculatedMeasures`
  - `maxRows`, `timeoutMs`, `cacheHint`, `compileOnly`, `debug`
- Response:
  - `{ data: { columns, rows, rowCount? }, debug? }`
  - Header: `x-correlation-id`

## `POST /api/datatalk/query`

Proxy route to DataTalk agent SQL execution.

- Request fields:
  - `connectionId` (optional if full `connection` payload is provided)
  - `sql`, `role`, `maxRows`, `timeoutMs`
  - `stream` (optional, `true` enables NDJSON row streaming)
- Response:
  - JSON payload from DataTalk agent
  - NDJSON stream when `stream=true`
  - Header: `x-correlation-id`

## `POST /api/query`

Compatibility proxy for direct SQL.

- Accepts `connectionId + sql` (or `query` alias)
- Supports `page/pageSize` (mapped to `maxRows`) and `stream`
- Pass-through to `/api/datatalk/query`

## `POST /api/semantic/values`

Fetch distinct values for semantic field filters and slicers.

- Request fields:
  - `projectId`, `field` (`Model.field`)
  - `search`, `limit`, `page`
  - `globalContext`, `requestContext`
- Response:
  - `{ data: { values: string[] }, debug? }`
  - Header: `x-correlation-id`

## `GET /api/metrics/query`

Runtime query observability metrics.

- Default response: JSON aggregate metrics by route (`count`, `errors`, `slow`, `avgMs`, `maxMs`)
- Prometheus format: `GET /api/metrics/query?format=prometheus`
