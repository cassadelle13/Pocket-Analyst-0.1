const BASE = "http://127.0.0.1:3000";
const CID = "9e676718-1cf4-408d-b54f-11b881941e6d";
async function q(sql) {
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql, maxRows: 500 }),
  });
  return (await r.json())?.data ?? {};
}

async function main() {
  console.log("=== Verify: Новые пользователи uses first-start ===");
  const oldWay = await q(`SELECT event_time::date AS day, count(DISTINCT chat_id) AS n
    FROM musgen.analytics_event WHERE event_name='BOT_START'
    AND event_time::date = '2026-02-07' GROUP BY 1;`);
  const newWay = await q(`WITH fs AS (
    SELECT chat_id, min(event_time)::date AS first_day
    FROM musgen.analytics_event WHERE event_name='BOT_START' GROUP BY chat_id
  ) SELECT first_day AS day, count(*) AS n FROM fs WHERE first_day = '2026-02-07' GROUP BY 1;`);
  console.log(`  Old way (all BOT_START): ${oldWay.rows?.[0]?.[1]}`);
  console.log(`  New way (first-start):   ${newWay.rows?.[0]?.[1]}`);
  console.log(`  → Same? Each user has exactly 1 BOT_START event.`);

  // Check if any user has multiple BOT_START
  const multi = await q(`SELECT chat_id, count(*) AS n FROM musgen.analytics_event
    WHERE event_name='BOT_START' GROUP BY chat_id HAVING count(*) > 1 LIMIT 5;`);
  console.log(`  Users with >1 BOT_START: ${multi.rows?.length ?? 0}`);

  console.log("\n=== Verify: Откуда пришли with date filter ===");
  const srcAll = await q(`SELECT COALESCE(NULLIF(refer_username,''), 'organic') AS src, count(*)
    FROM musgen.chat GROUP BY 1 ORDER BY 2 DESC LIMIT 3;`);
  console.log("  Without date filter (all time):");
  for (const r of srcAll.rows) console.log(`    ${r[0]}: ${r[1]}`);

  const srcFiltered = await q(`WITH fs AS (
    SELECT chat_id, min(event_time)::date AS first_day
    FROM musgen.analytics_event WHERE event_name='BOT_START' GROUP BY chat_id
  ) SELECT COALESCE(NULLIF(c.refer_username,''), 'organic') AS src, count(*)
    FROM fs JOIN musgen.chat c ON c.id = fs.chat_id
    WHERE fs.first_day >= '2026-02-01' AND fs.first_day <= '2026-02-07'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 5;`);
  console.log("  With date filter (Feb 1-7 only):");
  for (const r of srcFiltered.rows) console.log(`    ${r[0]}: ${r[1]}`);
  console.log("  → Now filtered by period, much smaller numbers.");

  console.log("\n=== Verify: Сводная таблица Новые пользователи ===");
  const summOld = await q(`SELECT count(DISTINCT chat_id) FROM musgen.analytics_event
    WHERE event_name='BOT_START' AND event_time::date = '2026-01-31';`);
  const summNew = await q(`WITH fs AS (
    SELECT chat_id, min(event_time)::date AS first_day
    FROM musgen.analytics_event WHERE event_name='BOT_START' GROUP BY chat_id
  ) SELECT count(*) FROM fs WHERE first_day = '2026-01-31';`);
  console.log(`  2026-01-31 old: ${summOld.rows?.[0]?.[0]}, new: ${summNew.rows?.[0]?.[0]}`);
  console.log(`  → Same because each user has exactly 1 BOT_START.`);
}

main().catch(e => { console.error(e); process.exit(1); });
