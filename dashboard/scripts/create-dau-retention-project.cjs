/**
 * Creates a project "MusGen Analytics" with DAU (bar) and Retention (line) charts
 * using Direct SQL with {{interval_from}} / {{interval_to}} template variables.
 *
 * Usage:  node dashboard/scripts/create-dau-retention-project.cjs
 */

const CONNECTION_ID = "9e676718-1cf4-408d-b54f-11b881941e6d";
const TABLE_KEY = "musgen.analytics_event";
const PROJECT_ID = `musgen_dau_ret_${Date.now()}`;
const BASE = "http://127.0.0.1:3000";

const DAU_SQL = `select
  event_time::date as day,
  count(distinct chat_id) as dau
from musgen.analytics_event
WHERE event_time::date >= {{interval_from}} and event_time::date <= {{interval_to}}
group by 1
order by 1;`;

const RETENTION_SQL = `with first_start as (
  select
    chat_id,
    min(event_time)::date as cohort_day
  from musgen.analytics_event
  where event_name = 'BOT_START'
  group by chat_id
),
activity as (
  select distinct
    chat_id,
    event_time::date as activity_day
  from musgen.analytics_event
)
select
  fs.cohort_day,
  count(distinct fs.chat_id) as cohort_size,
  count(distinct case when a.activity_day = fs.cohort_day + 1 then fs.chat_id end) as d1,
  count(distinct case when a.activity_day = fs.cohort_day + 7 then fs.chat_id end) as d7,
  count(distinct case when a.activity_day = fs.cohort_day + 30 then fs.chat_id end) as d30,
  round(
    count(distinct case when a.activity_day = fs.cohort_day + 1 then fs.chat_id end)::numeric
    / nullif(count(distinct fs.chat_id), 0) * 100, 2
  ) as d1_percent,
  round(
    count(distinct case when a.activity_day = fs.cohort_day + 7 then fs.chat_id end)::numeric
    / nullif(count(distinct fs.chat_id), 0) * 100, 2
  ) as d7_percent,
  round(
    count(distinct case when a.activity_day = fs.cohort_day + 30 then fs.chat_id end)::numeric
    / nullif(count(distinct fs.chat_id), 0) * 100, 2
  ) as d30_percent
from first_start fs
left join activity a on a.chat_id = fs.chat_id
where fs.cohort_day >= {{interval_from}}
  and fs.cohort_day <= {{interval_to}}
group by fs.cohort_day
order by fs.cohort_day;`;

const nodes = [
  {
    id: "dau-chart",
    type: "chart",
    name: "DAU",
    title: "DAU",
    position: { x: 60, y: 60 },
    size: { width: 640, height: 400 },
    data: {
      kind: "db-table",
      connectionId: CONNECTION_ID,
      connectionType: "postgres",
      tableKey: TABLE_KEY,
      customSql: DAU_SQL,
      chartConfig: {
        general: { vizType: "bar" },
      },
      columnMapping: {
        xColumn: "day",
        yColumns: [{ col: "dau", agg: "none" }],
      },
    },
  },
  {
    id: "retention-chart",
    type: "chart",
    name: "Retention",
    title: "Retention",
    position: { x: 720, y: 60 },
    size: { width: 640, height: 400 },
    data: {
      kind: "db-table",
      connectionId: CONNECTION_ID,
      connectionType: "postgres",
      tableKey: TABLE_KEY,
      customSql: RETENTION_SQL,
      chartConfig: {
        general: { vizType: "line" },
      },
      columnMapping: {
        xColumn: "cohort_day",
        yColumns: [
          { col: "d1_percent", agg: "none" },
          { col: "d7_percent", agg: "none" },
          { col: "d30_percent", agg: "none" },
        ],
        y2Columns: [{ col: "cohort_size", agg: "none" }],
      },
    },
  },
];

async function main() {
  // 1. Verify /api/query works
  console.log("1) Testing /api/query ...");
  const testSql = "SELECT count(*) as cnt FROM musgen.analytics_event LIMIT 1;";
  const testRes = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CONNECTION_ID, sql: testSql, maxRows: 1 }),
  });
  const testJson = await testRes.json();
  if (!testRes.ok) {
    console.error("   /api/query FAILED:", testJson);
    process.exit(1);
  }
  const rows = testJson?.data?.rows ?? [];
  console.log("   OK, analytics_event count:", rows?.[0]?.[0] ?? "?");

  // 2. Delete old project if exists (ignore errors)
  await fetch(`${BASE}/api/projects?id=${PROJECT_ID}`, { method: "DELETE" }).catch(() => {});

  // 3. Create project
  console.log("2) Creating project ...");
  const createRes = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: PROJECT_ID,
      name: "MusGen Analytics — DAU + Retention",
      description: "DAU bar chart + Retention line chart with Direct SQL and {{interval_from}}/{{interval_to}}",
      nodes,
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.ok) {
    console.error("   Failed to create project:", createJson);
    process.exit(1);
  }
  console.log("   Project created:", PROJECT_ID);

  // 4. Print URL
  const url = `${BASE}/dashboard?project=${PROJECT_ID}`;
  console.log("\n====================================================");
  console.log("  Open in browser:");
  console.log(`  ${url}`);
  console.log("");
  console.log("  IMPORTANT: Data range is 2025-12-05 to 2026-02-07");
  console.log("  Set the global date range in the UI, or use the");
  console.log("  Format tab preset 'All time' to see the data.");
  console.log("====================================================\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
