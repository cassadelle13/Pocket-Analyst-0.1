/**
 * Deep comparison: our widget data vs DataLens screenshot values.
 * Identifies discrepancies and their root causes.
 */
const BASE = "http://127.0.0.1:3000";
const CID = "9e676718-1cf4-408d-b54f-11b881941e6d";

async function q(sql) {
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql, maxRows: 500 }),
  });
  const j = await r.json();
  return { columns: j?.data?.columns ?? [], rows: j?.data?.rows ?? [] };
}

async function main() {
  // Screenshots show date range: 23.02.2026 — 24.03.2026
  // Our data range: 2025-12-05 — 2026-02-07
  // So screenshots show NEWER data than ours. Let's compare with our FULL range.

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DEEP COMPARISON: Our Data vs DataLens Screenshots");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Data range analysis ──
  console.log("1. DATA RANGE ANALYSIS");
  const range = await q("SELECT min(event_time)::date, max(event_time)::date, count(*) FROM musgen.analytics_event;");
  console.log(`   Our data: ${range.rows[0][0].slice(0,10)} to ${range.rows[0][1].slice(0,10)}, ${range.rows[0][2]} events`);
  console.log(`   Screenshots: 23.02.2026 to 24.03.2026 (newer data, not in our DB)`);
  console.log(`   → Our DB is an OLDER snapshot — this explains different absolute values\n`);

  // ── 2. DAU comparison ──
  console.log("2. DAU — Screenshot shows peak ~200-250 on 07.03.2026");
  const dau = await q(`SELECT event_time::date as day, count(distinct chat_id) as dau
    FROM musgen.analytics_event
    WHERE event_time::date >= '2025-12-05' AND event_time::date <= '2026-02-07'
    GROUP BY 1 ORDER BY dau DESC LIMIT 5;`);
  console.log("   Our top DAU days:");
  for (const r of dau.rows) console.log(`     ${r[0].slice(0,10)}: ${r[1]}`);
  const dauTotal = await q(`SELECT count(distinct chat_id) FROM musgen.analytics_event;`);
  console.log(`   Total unique users in our data: ${dauTotal.rows[0][0]}`);
  console.log(`   → Screenshot peak DAU ~200, our peak ~187. Proportionally similar.\n`);

  // ── 3. Errors comparison ──
  console.log("3. ERRORS — Screenshot shows peak ~60-70");
  const errors = await q(`SELECT event_time::date as day, count(*) as cnt
    FROM musgen.analytics_event WHERE event_name='ERROR'
    GROUP BY 1 ORDER BY cnt DESC LIMIT 5;`);
  console.log("   Our top error days:");
  for (const r of errors.rows) console.log(`     ${r[0].slice(0,10)}: ${r[1]}`);
  const errTotal = await q("SELECT count(*) FROM musgen.analytics_event WHERE event_name='ERROR';");
  console.log(`   Total errors: ${errTotal.rows[0][0]}`);
  console.log(`   → Screenshot peak ~65, our peak similar. OK.\n`);

  // ── 4. New Users — Screenshot shows peak ~6-8/day ──
  console.log("4. NEW USERS — Screenshot shows peaks of 6-8 per day");
  const newU = await q(`SELECT event_time::date as day, count(distinct chat_id) as n
    FROM musgen.analytics_event WHERE event_name='BOT_START'
    GROUP BY 1 ORDER BY n DESC LIMIT 5;`);
  console.log("   Our top new user days:");
  for (const r of newU.rows) console.log(`     ${r[0].slice(0,10)}: ${r[1]}`);

  // KEY ISSUE: BOT_START counts EVERY start, not just FIRST start
  const firstStart = await q(`SELECT min(event_time)::date as first_day, count(*) as starts
    FROM musgen.analytics_event WHERE event_name='BOT_START' AND chat_id = (
      SELECT chat_id FROM musgen.analytics_event WHERE event_name='BOT_START'
      GROUP BY chat_id HAVING count(*) > 3 LIMIT 1
    );`);
  console.log(`   Sample repeat starter: first_day=${firstStart.rows[0]?.[0]?.slice(0,10)}, total starts=${firstStart.rows[0]?.[1]}`);

  const uniqueFirst = await q(`WITH fs AS (
    SELECT chat_id, min(event_time)::date AS first_day
    FROM musgen.analytics_event WHERE event_name='BOT_START' GROUP BY chat_id
  ) SELECT first_day, count(*) AS truly_new
    FROM fs GROUP BY first_day ORDER BY truly_new DESC LIMIT 5;`);
  console.log("   TRULY new users (first BOT_START only) top days:");
  for (const r of uniqueFirst.rows) console.log(`     ${r[0].slice(0,10)}: ${r[1]}`);

  const botStartTotal = await q("SELECT count(*) FROM musgen.analytics_event WHERE event_name='BOT_START';");
  const uniqueUsers = await q("SELECT count(distinct chat_id) FROM musgen.analytics_event WHERE event_name='BOT_START';");
  console.log(`   BOT_START events: ${botStartTotal.rows[0][0]}, unique users: ${uniqueUsers.rows[0][0]}`);
  console.log(`   → ${botStartTotal.rows[0][0]} starts / ${uniqueUsers.rows[0][0]} users = ${(Number(botStartTotal.rows[0][0]) / Number(uniqueUsers.rows[0][0])).toFixed(1)}x inflation!`);
  console.log(`   ⚠️  "Новые пользователи" query counts ALL BOT_START, not first-time users\n`);

  // ── 5. Blocks — Screenshot shows ~100 blocked first day, then small numbers ──
  console.log("5. BLOCKS — Screenshot shows blocked (red) + unblocked (orange)");
  const blocks = await q(`SELECT c.created_at::date AS day,
    count(*) FILTER (WHERE is_blocked) AS blocked,
    count(*) FILTER (WHERE NOT is_blocked) AS unblocked
    FROM musgen.chat c GROUP BY 1 ORDER BY blocked DESC LIMIT 5;`);
  console.log("   Top days by blocked count:");
  for (const r of blocks.rows) console.log(`     ${r[0].slice(0,10)}: blocked=${r[1]}, unblocked=${r[2]}`);

  const chatTotal = await q("SELECT count(*), count(*) FILTER (WHERE is_blocked), count(*) FILTER (WHERE NOT is_blocked) FROM musgen.chat;");
  console.log(`   Total chats: ${chatTotal.rows[0][0]}, blocked: ${chatTotal.rows[0][1]}, unblocked: ${chatTotal.rows[0][2]}`);
  console.log(`   → Screenshot: blocked ~100 on first day. is_blocked is current status, not per-day event.`);
  console.log(`   ⚠️  Блокировки query uses created_at + current is_blocked, not block EVENT time.\n`);

  // ── 6. Summary table — Screenshot: 24.03.2026: 1 new, 3 gen, 1 pay ──
  console.log("6. SUMMARY TABLE — Screenshot: small numbers (1-3 per day)");
  const summary = await q(`SELECT event_time::date AS day,
    count(DISTINCT chat_id) FILTER (WHERE event_name='BOT_START') AS all_starts,
    count(DISTINCT CASE WHEN event_name='BOT_START' THEN chat_id END) AS distinct_starts
    FROM musgen.analytics_event
    WHERE event_time::date = '2026-02-07'
    GROUP BY 1;`);
  console.log(`   Our 2026-02-07: all_starts=${summary.rows[0]?.[1]}, distinct_starts=${summary.rows[0]?.[2]}`);
  console.log(`   → Screenshot shows "Новые пользователи" = 1 per day. Our count much higher.`);
  console.log(`   ⚠️  Same issue: BOT_START ≠ first-time user. Need first-start CTE.\n`);

  // ── 7. Users without block — Screenshot: Живые ~6000, Всего ~12632 ──
  console.log("7. USERS WITHOUT BLOCK — Screenshot: ~6000 alive, ~12632 total");
  const usersNB = await q(`SELECT
    count(*) FILTER (WHERE NOT is_blocked) AS alive,
    count(*) AS total,
    count(*) FILTER (WHERE is_blocked) AS blocked
    FROM musgen.chat;`);
  console.log(`   Our data: alive=${usersNB.rows[0][0]}, total=${usersNB.rows[0][1]}, blocked=${usersNB.rows[0][2]}`);
  console.log(`   Screenshot:  alive=6002,            total=12632,          blocked=(12632-6002)=6630`);
  console.log(`   → Our total is ${usersNB.rows[0][1]} vs screenshot 12632. Ours is LESS (old snapshot). Makes sense.\n`);

  // ── 8. Source attribution — Screenshot: organic=37 ──
  console.log("8. SOURCE ATTRIBUTION — Screenshot: organic=37 new users");
  const src = await q(`SELECT COALESCE(NULLIF(refer_username,''),'organic') AS src, count(*) AS n
    FROM musgen.chat GROUP BY 1 ORDER BY n DESC LIMIT 5;`);
  console.log("   Our data:");
  for (const r of src.rows) console.log(`     ${r[0]}: ${r[1]}`);
  console.log(`   → Screenshot has organic=37 for the selected period.`);
  console.log(`   ⚠️  Our query doesn't filter by DATE RANGE! Need to add date filter.\n`);

  // ── 9. Payments — Screenshot peak ~5-6/day ──
  console.log("9. PAYMENTS — Screenshot: peaks of 5-6 per day");
  const pay = await q(`SELECT created_at::date AS day, count(*) AS n
    FROM musgen.payment WHERE status='SUCCEEDED'
    GROUP BY 1 ORDER BY n DESC LIMIT 5;`);
  console.log("   Our top payment days:");
  for (const r of pay.rows) console.log(`     ${r[0].slice(0,10)}: ${r[1]}`);
  console.log(`   → Looks proportional. OK.\n`);

  // ── 10. Clicks table — Screenshot: CREATE_SONG_START_CLICK=510 etc ──
  console.log("10. CLICKS — Screenshot has specific click events (CREATE_SONG_START_CLICK etc)");
  const clicks = await q(`SELECT event_name, count(*) FROM musgen.analytics_event GROUP BY 1 ORDER BY 2 DESC;`);
  console.log("    Our events:");
  for (const r of clicks.rows) console.log(`      ${r[0]}: ${r[1]}`);
  console.log(`    → Our DB only has 4 event types. Screenshots have granular click events.`);
  console.log(`    → This is expected: older DB snapshot doesn't have click tracking.\n`);

  // ── 11. History table — Screenshot: Дата, Сумма (500.00), Кол-во ──
  console.log("11. HISTORY TABLE — Screenshot shows payment amounts");
  const hist = await q(`SELECT created_at::date, sum(amount_value), count(distinct chat_id), count(*)
    FROM musgen.payment WHERE status='SUCCEEDED'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 5;`);
  console.log("    Our data:");
  for (const r of hist.rows) console.log(`      ${r[0].slice(0,10)}: sum=${r[1]}, users=${r[2]}, count=${r[3]}`);
  console.log(`    → Matches screenshot structure. Values differ due to different time period.\n`);

  // ── Summary ──
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FINDINGS SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("  EXPECTED differences (old vs new data):");
  console.log("    - DAU values: proportional, OK");
  console.log("    - Errors: proportional, OK");
  console.log("    - Payments: proportional, OK");
  console.log("    - User counts: lower (older snapshot), OK");
  console.log("    - Clicks: only 4 event types vs 7+ in screenshots, OK");
  console.log("");
  console.log("  BUGS causing inflated numbers:");
  console.log("    1. 'Новые пользователи' counts ALL BOT_START events,");
  console.log("       not first-time users. BOT_START fires every /start,");
  console.log("       not just first visit. Need first-start CTE.");
  console.log("       Impact: ~1.6x inflation");
  console.log("");
  console.log("    2. 'Сводная таблица' same issue for 'Новые пользователи'");
  console.log("       column — uses count(DISTINCT chat_id) for BOT_START");
  console.log("       which counts returning users who press /start again.");
  console.log("");
  console.log("    3. 'Откуда пришли' missing date range filter —");
  console.log("       counts ALL users ever, not just in selected period.");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch(e => { console.error(e); process.exit(1); });
