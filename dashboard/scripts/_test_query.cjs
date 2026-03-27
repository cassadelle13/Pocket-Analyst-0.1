const BASE = "http://127.0.0.1:3000";
const CID = "9e676718-1cf4-408d-b54f-11b881941e6d";

async function run() {
  // DAU test (no template vars — direct dates)
  const dauSql = `SELECT event_time::date as day, count(distinct chat_id) as dau
    FROM musgen.analytics_event
    WHERE event_time::date >= '2026-02-23' AND event_time::date <= '2026-03-24'
    GROUP BY 1 ORDER BY 1;`;

  console.log("=== DAU query ===");
  const r1 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: dauSql, maxRows: 100 }),
  });
  const j1 = await r1.json();
  console.log("status:", r1.status);
  console.log("columns:", j1?.data?.columns);
  console.log("rows (first 5):", JSON.stringify((j1?.data?.rows ?? []).slice(0, 5)));
  console.log("total rows:", (j1?.data?.rows ?? []).length);

  // Retention test
  const retSql = `WITH first_start AS (
    SELECT chat_id, min(event_time)::date AS cohort_day
    FROM musgen.analytics_event WHERE event_name = 'BOT_START' GROUP BY chat_id
  ), activity AS (
    SELECT DISTINCT chat_id, event_time::date AS activity_day FROM musgen.analytics_event
  )
  SELECT fs.cohort_day,
    count(distinct fs.chat_id) AS cohort_size,
    count(distinct CASE WHEN a.activity_day = fs.cohort_day + 1 THEN fs.chat_id END) AS d1,
    count(distinct CASE WHEN a.activity_day = fs.cohort_day + 7 THEN fs.chat_id END) AS d7,
    count(distinct CASE WHEN a.activity_day = fs.cohort_day + 30 THEN fs.chat_id END) AS d30,
    round(count(distinct CASE WHEN a.activity_day = fs.cohort_day + 1 THEN fs.chat_id END)::numeric / nullif(count(distinct fs.chat_id),0)*100, 2) AS d1_percent,
    round(count(distinct CASE WHEN a.activity_day = fs.cohort_day + 7 THEN fs.chat_id END)::numeric / nullif(count(distinct fs.chat_id),0)*100, 2) AS d7_percent,
    round(count(distinct CASE WHEN a.activity_day = fs.cohort_day + 30 THEN fs.chat_id END)::numeric / nullif(count(distinct fs.chat_id),0)*100, 2) AS d30_percent
  FROM first_start fs LEFT JOIN activity a ON a.chat_id = fs.chat_id
  WHERE fs.cohort_day >= '2026-02-23' AND fs.cohort_day <= '2026-03-24'
  GROUP BY fs.cohort_day ORDER BY fs.cohort_day;`;

  console.log("\n=== Retention query ===");
  const r2 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: retSql, maxRows: 100 }),
  });
  const j2 = await r2.json();
  console.log("status:", r2.status);
  console.log("columns:", j2?.data?.columns);
  console.log("rows (first 5):", JSON.stringify((j2?.data?.rows ?? []).slice(0, 5)));
  console.log("total rows:", (j2?.data?.rows ?? []).length);

  // injectTemplateVars test
  console.log("\n=== injectTemplateVars test ===");
  const dauWithTemplate = `SELECT event_time::date as day, count(distinct chat_id) as dau
    FROM musgen.analytics_event
    WHERE event_time::date >= {{interval_from}} AND event_time::date <= {{interval_to}}
    GROUP BY 1 ORDER BY 1;`;
  const injected = dauWithTemplate
    .replace(/\{\{interval_from\}\}/g, "'2026-02-23'")
    .replace(/\{\{interval_to\}\}/g, "'2026-03-24'");
  console.log("injected SQL (first 200 chars):", injected.slice(0, 200));
  const r3 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: injected, maxRows: 5 }),
  });
  const j3 = await r3.json();
  console.log("status:", r3.status);
  console.log("rows (first 3):", JSON.stringify((j3?.data?.rows ?? []).slice(0, 3)));
}

run().catch(e => { console.error(e); process.exit(1); });
