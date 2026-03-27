# PocketAnalyst

PocketAnalyst is a monorepo for an analytics product with:

- **ClickHouse-backed event analytics** (REST endpoints under `dashboard/src/app/api/rest/*`)
- **A PowerBI-like dashboard canvas** with:
  - **Database Explorer** (connect/disconnect DB tables to a chart)
  - **Chart Configuration (Build)** panel (X / Values mapping)
  - **Fields / Filters** panels
- **DataTalk Agent** for external DB introspection and query execution
- Optional **ingest** pipeline and **AI** service

This `README.md` is the main technical entry point. Deep dives live in:

- `START.md` (quick start)
- `HOW_IT_WORKS.md` (DB auto-discovery)
- `CHART_BUILDER_FIX.md` (fallback / mock modes for schema & queries)
- `DATALENS_INTEGRATION.md` (chart styling library)

## Repository Layout

- `dashboard/` — Next.js 15 application (UI + API routes)
- `datatalk-agent/` — TypeScript service for DB discovery/introspection/query execution
- `storage/` — ClickHouse init + dump
- `ingest/` — Vector ingest configuration
- `ai-service/` — AI service (Python)
- `docker-compose.yml`, `docker-compose.dev.yml` — local stack orchestration

## Runtime Architecture (High Level)

### Services

- `dashboard` (Next.js)
  - UI: React client components
  - Server: Next.js route handlers (`/api/*`)
  - Proxies requests to `datatalk-agent` for DB-related operations

- `datatalk-agent` (Fastify/TS)
  - `/discover` — find local/network/docker databases
  - schema + query execution endpoints (used by `/api/datatalk/*` in dashboard)

- `storage` (ClickHouse)
  - OLAP store for event analytics

### Key Data Flows

#### 1) ClickHouse analytics

Browser UI
-> `dashboard` API (`/api/rest/*`)
-> ClickHouse HTTP
-> JSON
-> UI modules (home/analytics/users)

#### 2) External DB (PowerBI-like) charts

Browser UI (Dashboard Canvas)
-> `dashboard` API (`/api/datatalk/schema`, `/api/datatalk/query`)
-> `datatalk-agent`
-> External DB
-> Chart preview (ECharts/Table)

## Local Development

### Option A: Fast dev (recommended)

Run infra in Docker, run UI locally.

1) Start ClickHouse:

```bash
docker-compose up -d storage
```

2) Start DataTalk Agent:

```bash
cd datatalk-agent
npm install
npm run dev
```

3) Start Dashboard:

```bash
cd dashboard
npm install
npm run dev
```

URLs:

- Dashboard UI: `http://localhost:3000`
- ClickHouse: `http://localhost:8123`
- DataTalk Agent: `http://localhost:9010`

### Option B: Full stack via Docker Compose

```bash
docker-compose up -d
```

Note: the first build can be slow depending on your machine.

## Environment

See `.env.example` for the canonical list.

Common groups:

- ClickHouse: `CLICKHOUSE_HOST`, `CLICKHOUSE_PORT`, `CLICKHOUSE_DATABASE`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`
- DataTalk Agent: `DATATALK_AGENT_URL` (used by dashboard server to proxy)
- AI: `AI_SERVICE_URL` (and optional client override)

## Product / UI Technical Notes

### Dashboard Canvas (PowerBI-like)

The Dashboard page provides:

- **Database Explorer**: connect/disconnect a DB table to the active chart
- **Chart Configuration**: defaults to **Build** mode, edits `chartData.columnMapping`
- **Fields panel**: schema-based list of fields with checkboxes; checkboxes reflect current `columnMapping` for the active chart
- **Filters panel**: independent panel (separate button)

Internal synchronization uses window-level custom events (high level):

- `dashboard:active-chart-id` — emitted when the selected chart changes
- `dashboard:update-chart-data` — patches chart node data (including `columnMapping`)
- `dashboard:connect-to-chart` — connect/disconnect table to a chart
- `dashboard:chart-sources-changed` — authoritative notification of connected sources per chart

The authoritative state for chart nodes lives in the dashboard canvas component.

### Schema Intelligence

Schema is loaded via `POST /api/datatalk/schema` and then classified into:

- time fields
- dimensions
- measures

The Fields panel renders the semantic model grouped by table.

## API Surface (Dashboard)

### Analytics REST

Endpoints are under `/api/rest/*`.

### DataTalk proxy

- `/api/datatalk/schema`
- `/api/datatalk/query`

These proxy to the DataTalk Agent, and are used by the PowerBI-like dashboard features.

## Troubleshooting

### 502 Bad Gateway when loading schema/query

- Ensure `datatalk-agent` is running and `DATATALK_AGENT_URL` is correct
- See `CHART_BUILDER_FIX.md` for mock/fallback behavior

### Charts not updating after mapping changes

- Ensure the chart has:
  - `connectionId`
  - `tableKey`
  - `columnMapping` (for non-table viz)

### DB auto-discovery

See `HOW_IT_WORKS.md`.

## License

MIT
