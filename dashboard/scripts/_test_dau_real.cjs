const BASE = "http://127.0.0.1:3000";
const CID = "9e676718-1cf4-408d-b54f-11b881941e6d";

async function run() {
  // DAU with real date range
  const dauSql = `SELECT event_time::date as day, count(distinct chat_id) as dau
    FROM musgen.analytics_event
    WHERE event_time::date >= '2025-12-05' AND event_time::date <= '2026-02-07'
    GROUP BY 1 ORDER BY 1;`;
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: dauSql, maxRows: 200 }),
  });
  const j = await r.json();
  console.log("DAU cols:", j?.data?.columns);
  console.log("DAU rows:", (j?.data?.rows ?? []).length);
  for (const row of (j?.data?.rows ?? []).slice(0, 8)) {
    console.log("  ", row[0], "dau:", row[1]);
  }

  // Retention with real date range
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
  WHERE fs.cohort_day >= '2025-12-05' AND fs.cohort_day <= '2026-02-07'
  GROUP BY fs.cohort_day ORDER BY fs.cohort_day;`;

  const r2 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: retSql, maxRows: 200 }),
  });
  const j2 = await r2.json();
  console.log("\nRetention cols:", j2?.data?.columns);
  console.log("Retention rows:", (j2?.data?.rows ?? []).length);
  for (const row of (j2?.data?.rows ?? []).slice(0, 5)) {
    console.log("  cohort:", row[0], "size:", row[1], "d1%:", row[5], "d7%:", row[6], "d30%:", row[7]);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
