/**
 * Creates full MusGen Analytics dashboard with all 12 widgets
 * matching the DataLens screenshots.
 *
 * Usage:  node dashboard/scripts/create-full-dashboard.cjs
 */

const CONNECTION_ID = "9e676718-1cf4-408d-b54f-11b881941e6d";
const TK = "musgen.analytics_event";
const PROJECT_ID = `musgen_full_${Date.now()}`;
const BASE = "http://127.0.0.1:3000";
const TV = "{{interval_from}}";
const TE = "{{interval_to}}";

// ─── SQL for all 12 widgets ───

const SQL_DAU = `SELECT event_time::date AS day, count(DISTINCT chat_id) AS dau
FROM musgen.analytics_event
WHERE event_time::date >= ${TV} AND event_time::date <= ${TE}
GROUP BY 1 ORDER BY 1;`;

const SQL_ERRORS = `SELECT event_time::date AS day, count(*) AS errors_count
FROM musgen.analytics_event
WHERE event_name = 'ERROR'
  AND event_time::date >= ${TV} AND event_time::date <= ${TE}
GROUP BY 1 ORDER BY 1;`;

const SQL_NEW_USERS = `WITH first_start AS (
  SELECT chat_id, min(event_time)::date AS first_day
  FROM musgen.analytics_event WHERE event_name = 'BOT_START' GROUP BY chat_id
)
SELECT first_day AS day, count(*) AS new_users
FROM first_start
WHERE first_day >= ${TV} AND first_day <= ${TE}
GROUP BY first_day ORDER BY first_day;`;

const SQL_PAYMENTS = `SELECT p.created_at::date AS day, count(*) AS payments_count
FROM musgen.payment p
WHERE p.status = 'SUCCEEDED'
  AND p.created_at::date >= ${TV} AND p.created_at::date <= ${TE}
GROUP BY 1 ORDER BY 1;`;

const SQL_BLOCKS = `SELECT c.created_at::date AS day,
  count(*) FILTER (WHERE c.is_blocked = true) AS blocked_count,
  count(*) FILTER (WHERE c.is_blocked = false) AS unblocked_count
FROM musgen.chat c
WHERE c.created_at::date >= ${TV} AND c.created_at::date <= ${TE}
GROUP BY 1 ORDER BY 1;`;

const SQL_CLICKS = `SELECT event_name, count(*) AS clicks
FROM musgen.analytics_event
WHERE event_time::date >= ${TV} AND event_time::date <= ${TE}
GROUP BY event_name
ORDER BY clicks DESC;`;

const SQL_CTR = `SELECT
  (SELECT count(*) FROM musgen.analytics_event
   WHERE event_name = 'BOT_START'
     AND event_time::date >= ${TV} AND event_time::date <= ${TE}) AS new_song_clicks,
  (SELECT count(*) FROM musgen.analytics_event
   WHERE event_name = 'GENERATION'
     AND event_time::date >= ${TV} AND event_time::date <= ${TE}) AS converted_clicks,
  CASE WHEN (SELECT count(*) FROM musgen.analytics_event
   WHERE event_name = 'BOT_START'
     AND event_time::date >= ${TV} AND event_time::date <= ${TE}) > 0
  THEN round(
    (SELECT count(*) FROM musgen.analytics_event
     WHERE event_name = 'GENERATION'
       AND event_time::date >= ${TV} AND event_time::date <= ${TE})::numeric
    / (SELECT count(*) FROM musgen.analytics_event
       WHERE event_name = 'BOT_START'
         AND event_time::date >= ${TV} AND event_time::date <= ${TE}) * 100, 2
  )::text || '%'
  ELSE '0%' END AS conversion_percent;`;

const SQL_SUMMARY = `WITH first_start AS (
  SELECT chat_id, min(event_time)::date AS first_day
  FROM musgen.analytics_event WHERE event_name = 'BOT_START' GROUP BY chat_id
)
SELECT
  d.day AS "Дата",
  coalesce(s.new_users, 0) AS "Новые пользователи",
  coalesce(g.generations, 0) AS "Генерации",
  coalesce(p.payments, 0) AS "Оплаты",
  coalesce(b.bans, 0) AS "Бан"
FROM (
  SELECT DISTINCT event_time::date AS day
  FROM musgen.analytics_event
  WHERE event_time::date >= ${TV} AND event_time::date <= ${TE}
) d
LEFT JOIN (
  SELECT first_day AS day, count(*) AS new_users
  FROM first_start GROUP BY first_day
) s ON s.day = d.day
LEFT JOIN (
  SELECT event_time::date AS day, count(*) AS generations
  FROM musgen.analytics_event WHERE event_name='GENERATION' GROUP BY 1
) g ON g.day = d.day
LEFT JOIN (
  SELECT created_at::date AS day, count(*) AS payments
  FROM musgen.payment WHERE status='SUCCEEDED' GROUP BY 1
) p ON p.day = d.day
LEFT JOIN (
  SELECT created_at::date AS day, count(*) FILTER (WHERE is_blocked) AS bans
  FROM musgen.chat GROUP BY 1
) b ON b.day = d.day
ORDER BY d.day DESC;`;

const SQL_HISTORY = `SELECT
  p.created_at::date AS "Дата",
  sum(p.amount_value) AS "Сумма",
  count(DISTINCT p.chat_id) AS "Количество пользователей",
  count(*) AS "Количество покупок"
FROM musgen.payment p
WHERE p.status = 'SUCCEEDED'
  AND p.created_at::date >= ${TV} AND p.created_at::date <= ${TE}
GROUP BY 1
ORDER BY 1 DESC;`;

const SQL_USERS_NO_BLOCK = `WITH daily AS (
  SELECT d::date AS day
  FROM generate_series(${TV}::date, ${TE}::date, '1 day') d
)
SELECT
  daily.day,
  (SELECT count(*) FROM musgen.chat WHERE is_blocked = false AND created_at::date <= daily.day) AS "Живые пользователи",
  (SELECT count(*) FROM musgen.chat WHERE created_at::date <= daily.day) AS "Всего пользователей",
  (SELECT count(*) FROM musgen.chat WHERE is_blocked = true AND created_at::date <= daily.day) AS "Заблокированные пользователи"
FROM daily
ORDER BY daily.day DESC
LIMIT 14;`;

const SQL_SOURCE = `WITH first_start AS (
  SELECT chat_id, min(event_time)::date AS first_day
  FROM musgen.analytics_event WHERE event_name = 'BOT_START' GROUP BY chat_id
)
SELECT
  COALESCE(NULLIF(c.refer_username, ''), 'organic') AS "Источник",
  count(*) AS "Новые пользователи"
FROM first_start fs
JOIN musgen.chat c ON c.id = fs.chat_id
WHERE fs.first_day >= ${TV} AND fs.first_day <= ${TE}
GROUP BY 1
ORDER BY 2 DESC;`;

const SQL_RETENTION = `WITH first_start AS (
  SELECT chat_id, min(event_time)::date AS cohort_day
  FROM musgen.analytics_event WHERE event_name = 'BOT_START' GROUP BY chat_id
), activity AS (
  SELECT DISTINCT chat_id, event_time::date AS activity_day
  FROM musgen.analytics_event
)
SELECT fs.cohort_day,
  count(DISTINCT fs.chat_id) AS cohort_size,
  count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 1 THEN fs.chat_id END) AS d1,
  count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 7 THEN fs.chat_id END) AS d7,
  count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 30 THEN fs.chat_id END) AS d30,
  round(count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 1 THEN fs.chat_id END)::numeric
    / nullif(count(DISTINCT fs.chat_id),0)*100, 2) AS d1_percent,
  round(count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 7 THEN fs.chat_id END)::numeric
    / nullif(count(DISTINCT fs.chat_id),0)*100, 2) AS d7_percent,
  round(count(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 30 THEN fs.chat_id END)::numeric
    / nullif(count(DISTINCT fs.chat_id),0)*100, 2) AS d30_percent
FROM first_start fs LEFT JOIN activity a ON a.chat_id = fs.chat_id
WHERE fs.cohort_day >= ${TV} AND fs.cohort_day <= ${TE}
GROUP BY fs.cohort_day ORDER BY fs.cohort_day;`;

// ─── Node layout (3 columns x 4 rows, matching DataLens layout) ───

const W = 480, H = 340, GAP = 20, LEFT = 40, TOP = 40;
function pos(col, row) {
  return { x: LEFT + col * (W + GAP), y: TOP + row * (H + GAP) };
}

const nodes = [
  // ── Row 0: Summary tables ──
  {
    id: "summary-table", type: "chart", name: "Сводная таблица", title: "Сводная таблица",
    position: pos(0, 0), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_SUMMARY,
      chartConfig: { general: { vizType: "table" } },
    },
  },
  {
    id: "history-table", type: "chart", name: "history — Сводная таблица", title: "history — Сводная таблица",
    position: pos(1, 0), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_HISTORY,
      chartConfig: { general: { vizType: "table" } },
    },
  },
  {
    id: "users-no-block", type: "chart", name: "Кол-во пользователей (без блока)", title: "Кол-во пользователей (без блока)",
    position: pos(2, 0), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_USERS_NO_BLOCK,
      chartConfig: { general: { vizType: "table" } },
    },
  },

  // ── Row 1: Blocks, New Users, Clicks table ──
  {
    id: "blocks-chart", type: "chart", name: "Блокировки", title: "Блокировки",
    position: pos(0, 1), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_BLOCKS,
      chartConfig: { general: { vizType: "bar" } },
      columnMapping: {
        xColumn: "day",
        yColumns: [
          { col: "blocked_count", agg: "none" },
          { col: "unblocked_count", agg: "none" },
        ],
      },
    },
  },
  {
    id: "new-users-chart", type: "chart", name: "Новые пользователи", title: "Новые пользователи",
    position: pos(1, 1), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_NEW_USERS,
      chartConfig: { general: { vizType: "bar" } },
      columnMapping: { xColumn: "day", yColumns: [{ col: "new_users", agg: "none" }] },
    },
  },
  {
    id: "clicks-table", type: "chart", name: "Клики за весь выбранный период", title: "Клики за весь выбранный период",
    position: pos(2, 1), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_CLICKS,
      chartConfig: { general: { vizType: "table" } },
    },
  },

  // ── Row 2: CTR, Payments, Retention ──
  {
    id: "ctr-table", type: "chart", name: "CTR Новая песня to Генерация", title: "CTR Новая песня to Генерация",
    position: pos(0, 2), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_CTR,
      chartConfig: { general: { vizType: "table" } },
    },
  },
  {
    id: "payments-chart", type: "chart", name: "Оплаты", title: "Оплаты",
    position: pos(1, 2), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_PAYMENTS,
      chartConfig: { general: { vizType: "bar" } },
      columnMapping: { xColumn: "day", yColumns: [{ col: "payments_count", agg: "none" }] },
    },
  },
  {
    id: "retention-chart", type: "chart", name: "Retention", title: "Retention",
    position: pos(2, 2), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_RETENTION,
      chartConfig: { general: { vizType: "line" } },
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

  // ── Row 3: Source, DAU, Errors ──
  {
    id: "source-table", type: "chart", name: "Откуда пришли", title: "Откуда пришли",
    position: pos(0, 3), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_SOURCE,
      chartConfig: { general: { vizType: "table" } },
    },
  },
  {
    id: "dau-chart", type: "chart", name: "DAU", title: "DAU",
    position: pos(1, 3), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_DAU,
      chartConfig: { general: { vizType: "bar" } },
      columnMapping: { xColumn: "day", yColumns: [{ col: "dau", agg: "none" }] },
    },
  },
  {
    id: "errors-chart", type: "chart", name: "Ошибки", title: "Ошибки",
    position: pos(2, 3), size: { width: W, height: H },
    data: {
      kind: "db-table", connectionId: CONNECTION_ID, connectionType: "postgres", tableKey: TK,
      customSql: SQL_ERRORS,
      chartConfig: { general: { vizType: "bar" } },
      columnMapping: { xColumn: "day", yColumns: [{ col: "errors_count", agg: "none" }] },
    },
  },
];

async function main() {
  // 1. Verify API
  console.log("1) Testing API...");
  const t = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CONNECTION_ID, sql: "SELECT 1 AS ok", maxRows: 1 }),
  });
  if (!t.ok) { console.error("API broken"); process.exit(1); }
  console.log("   API OK");

  // 2. Test each SQL individually
  console.log("2) Testing all 12 queries...");
  const testDate = { from: "'2025-12-05'", to: "'2026-02-07'" };
  for (const node of nodes) {
    const sql = node.data.customSql
      .replace(/\{\{interval_from\}\}/g, testDate.from)
      .replace(/\{\{interval_to\}\}/g, testDate.to);
    const r = await fetch(`${BASE}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: CONNECTION_ID, sql, maxRows: 200 }),
    });
    const j = await r.json();
    const rows = j?.data?.rows ?? [];
    const cols = j?.data?.columns ?? [];
    const status = rows.length > 0 ? "PASS" : "EMPTY";
    console.log(`   ${status} ${node.name}: ${cols.length} cols, ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`      cols: ${cols.join(", ")}`);
      console.log(`      sample: ${JSON.stringify(rows[0]).slice(0, 120)}`);
    }
    if (!r.ok) console.log(`      ERROR: ${JSON.stringify(j).slice(0, 200)}`);
  }

  // 3. Create project
  console.log("\n3) Creating project...");
  const cr = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: PROJECT_ID,
      name: "MusGen Analytics — Full Dashboard",
      description: "All 12 DataLens widgets reproduced with Direct SQL",
      nodes,
    }),
  });
  const cj = await cr.json();
  if (!cr.ok || !cj.ok) { console.error("Failed:", cj); process.exit(1); }

  const url = `${BASE}/dashboard?project=${PROJECT_ID}`;
  console.log("\n" + "=".repeat(60));
  console.log("  Project: " + PROJECT_ID);
  console.log("  URL: " + url);
  console.log("  Widgets: " + nodes.length);
  console.log("=".repeat(60) + "\n");
}

main().catch(e => { console.error(e); process.exit(1); });
