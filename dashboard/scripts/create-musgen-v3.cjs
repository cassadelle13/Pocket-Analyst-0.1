/**
 * Creates/updates Musgen DataLens parity project (v3) with 12 charts.
 * Run: node scripts/create-musgen-v3.cjs
 */
const http = require("http");
const https = require("https");

const PROJECT_ID = "project_musgen_datalens_v3";
const PROJECT_NAME = "Musgen Analytics DataLens v3";
const CONNECTION_ID = "9e676718-1cf4-408d-b54f-11b881941e6d";
const CONNECTION_TYPE = "postgres";

const W = 560;
const H = 380;
const GAP = 24;

const T = {
  chat: "musgen.chat",
  generation: "musgen.music_generation",
  payment: "musgen.payment",
  cost: "musgen.user_music_generation_cost",
  balance: "musgen.balance",
  analytics: "musgen.analytics_event",
};

function pos(col, row) {
  return { x: col * (W + GAP), y: row * (H + GAP) };
}

function nodeSql(id, title, chartName, vizType, tableKey, customSql, col, row) {
  return {
    id,
    type: "chart",
    name: chartName,
    title,
    position: pos(col, row),
    size: { width: W, height: H },
    data: {
      kind: "db-table",
      connectionId: CONNECTION_ID,
      connectionType: CONNECTION_TYPE,
      tableKey,
      chartName,
      customSql,
      columnMapping: {},
      chartConfig: { general: { vizType } },
      columnsMeta: [],
    },
  };
}

const SQL = {
  summaryTable: `
    SELECT
      c.id AS chat_id,
      c.created_at::date AS registration_day,
      COALESCE(mg.total_generations, 0) AS total_generations,
      COALESCE(mg.error_generations, 0) AS error_generations,
      COALESCE(p.total_payments, 0) AS total_payments,
      COALESCE(p.total_revenue, 0) AS total_revenue,
      b.current_balance
    FROM musgen.chat c
    LEFT JOIN (
      SELECT
        chat_id,
        COUNT(*) AS total_generations,
        COUNT(*) FILTER (WHERE status IN ('NOT_DELIVERED', 'ERROR_DELIVERED')) AS error_generations
      FROM musgen.music_generation
      GROUP BY chat_id
    ) mg ON mg.chat_id = c.id
    LEFT JOIN (
      SELECT
        chat_id,
        COUNT(*) AS total_payments,
        SUM(COALESCE(amount_value, 0)) AS total_revenue
      FROM musgen.payment
      GROUP BY chat_id
    ) p ON p.chat_id = c.id
    LEFT JOIN musgen.balance b ON b.chat_id = c.id
    ORDER BY c.created_at DESC
    LIMIT 500
  `,

  historyTable: `
    SELECT
      p.id AS payment_id,
      p.chat_id,
      p.created_at,
      p.amount_value,
      mg.id AS music_generation_id,
      mg.status AS generation_status,
      mg.error_type,
      umgc.is_free
    FROM musgen.payment p
    LEFT JOIN musgen.music_generation mg ON mg.id = p.music_generation_id
    LEFT JOIN musgen.user_music_generation_cost umgc ON umgc.music_generation_id = mg.id
    WHERE p.created_at::date >= {{interval_from}}
      AND p.created_at::date <= {{interval_to}}
    ORDER BY p.created_at DESC
    LIMIT 500
  `,

  usersPerDay: `
    SELECT
      c.created_at::date AS day,
      COUNT(*) AS users_count
    FROM musgen.chat c
    WHERE c.created_at::date >= {{interval_from}}
      AND c.created_at::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  sourceTable: `
    SELECT
      COALESCE(NULLIF(c.refer_username, ''), '(none)') AS refer_username,
      COUNT(*) AS users_count
    FROM musgen.chat c
    WHERE c.created_at::date >= {{interval_from}}
      AND c.created_at::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY users_count DESC
    LIMIT 200
  `,

  dau: `
    SELECT
      event_time::date AS day,
      COUNT(DISTINCT chat_id) AS dau
    FROM musgen.analytics_event
    WHERE event_time::date >= {{interval_from}}
      AND event_time::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  errors: `
    SELECT
      event_time::date AS day,
      COUNT(*) AS errors_count
    FROM musgen.analytics_event
    WHERE event_name = 'ERROR'
      AND event_time::date >= {{interval_from}}
      AND event_time::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  blocks: `
    SELECT
      created_at::date AS day,
      SUM(CASE WHEN status IN ('NOT_DELIVERED', 'ERROR_DELIVERED') THEN 1 ELSE 0 END) AS blocked_count,
      SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS unblocked_count
    FROM musgen.music_generation
    WHERE created_at::date >= {{interval_from}}
      AND created_at::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  newUsers: `
    SELECT
      created_at::date AS day,
      COUNT(*) AS new_users
    FROM musgen.chat
    WHERE created_at::date >= {{interval_from}}
      AND created_at::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  clicks: `
    SELECT
      event_name,
      COUNT(*) AS events_count
    FROM musgen.analytics_event
    WHERE event_time::date >= {{interval_from}}
      AND event_time::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY events_count DESC
  `,

  ctr: `
    WITH totals AS (
      SELECT
        COUNT(DISTINCT c.id) AS total_users,
        COUNT(DISTINCT p.chat_id) AS payers,
        COUNT(mg.id) AS total_generations
      FROM musgen.chat c
      LEFT JOIN musgen.payment p ON p.chat_id = c.id
      LEFT JOIN musgen.music_generation mg ON mg.chat_id = c.id
      WHERE c.created_at::date >= {{interval_from}}
        AND c.created_at::date <= {{interval_to}}
    )
    SELECT
      total_users,
      payers,
      total_generations,
      ROUND(CASE WHEN total_users = 0 THEN 0 ELSE (payers::numeric / total_users) * 100 END, 2) AS payer_conversion_percent,
      ROUND(CASE WHEN total_users = 0 THEN 0 ELSE (total_generations::numeric / total_users) * 100 END, 2) AS generation_ctr_percent
    FROM totals
  `,

  payments: `
    SELECT
      created_at::date AS day,
      COUNT(*) AS payments_count,
      SUM(COALESCE(amount_value, 0)) AS revenue
    FROM musgen.payment
    WHERE created_at::date >= {{interval_from}}
      AND created_at::date <= {{interval_to}}
    GROUP BY 1
    ORDER BY 1
  `,

  retention: `
    WITH first_start AS (
      SELECT chat_id, MIN(event_time)::date AS cohort_day
      FROM musgen.analytics_event
      WHERE event_name = 'BOT_START'
      GROUP BY chat_id
    ),
    activity AS (
      SELECT DISTINCT chat_id, event_time::date AS activity_day
      FROM musgen.analytics_event
    ),
    retention_raw AS (
      SELECT
        fs.cohort_day,
        COUNT(DISTINCT fs.chat_id) AS cohort_size,
        COUNT(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 1  THEN fs.chat_id END) AS d1,
        COUNT(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 7  THEN fs.chat_id END) AS d7,
        COUNT(DISTINCT CASE WHEN a.activity_day = fs.cohort_day + 30 THEN fs.chat_id END) AS d30
      FROM first_start fs
      LEFT JOIN activity a ON a.chat_id = fs.chat_id
      WHERE fs.cohort_day >= {{interval_from}}
        AND fs.cohort_day <= {{interval_to}}
      GROUP BY fs.cohort_day
    )
    SELECT
      cohort_day,
      ROUND(d1::numeric / NULLIF(cohort_size, 0) * 100, 2) AS d1_percent,
      ROUND(d7::numeric / NULLIF(cohort_size, 0) * 100, 2) AS d7_percent,
      ROUND(d30::numeric / NULLIF(cohort_size, 0) * 100, 2) AS d30_percent
    FROM retention_raw
    ORDER BY cohort_day
  `,
};

const nodes = [
  nodeSql("node_01_summary", "Сводная таблица", "Сводная таблица", "table", "musgen.chat", SQL.summaryTable, 0, 0),
  nodeSql("node_02_history", "history", "history", "table", "musgen.payment", SQL.historyTable, 1, 0),
  nodeSql("node_03_users", "Кол-во пользователей", "Кол-во пользователей", "bar", "musgen.chat", SQL.usersPerDay, 2, 0),
  nodeSql("node_04_sources", "Откуда пришли", "Откуда пришли", "table", "musgen.chat", SQL.sourceTable, 3, 0),

  nodeSql("node_05_dau", "DAU", "DAU", "bar", "musgen.analytics_event", SQL.dau, 0, 1),
  nodeSql("node_06_errors", "Ошибки", "Ошибки", "bar", "musgen.analytics_event", SQL.errors, 1, 1),
  nodeSql("node_07_blocks", "Блокировки", "Блокировки", "bar", "musgen.music_generation", SQL.blocks, 2, 1),
  nodeSql("node_08_new_users", "Новые пользователи", "Новые пользователи", "bar", "musgen.chat", SQL.newUsers, 3, 1),

  nodeSql("node_09_clicks", "Клики", "Клики", "table", "musgen.analytics_event", SQL.clicks, 0, 2),
  nodeSql("node_10_ctr", "CTR", "CTR", "table", "musgen.chat", SQL.ctr, 1, 2),
  nodeSql("node_11_payments", "Оплаты", "Оплаты", "bar", "musgen.payment", SQL.payments, 2, 2),
  nodeSql("node_12_retention", "retention", "retention", "line", "musgen.analytics_event", SQL.retention, 3, 2),
];

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : "";

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + (parsed.search || ""),
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const deleteRes = await requestJson("DELETE", `http://localhost:3000/api/projects?id=${encodeURIComponent(PROJECT_ID)}`);
  if (deleteRes.status && deleteRes.status >= 400 && deleteRes.status !== 404) {
    console.warn("WARN: pre-delete failed", deleteRes.body);
  }

  const createBody = {
    id: PROJECT_ID,
    name: PROJECT_NAME,
    description: "Musgen v3: DataLens parity with custom SQL + template vars.",
    thumbnail: "",
    nodes,
    viewport: { pan: { x: -12, y: -12 }, zoom: 0.68 },
  };

  const createRes = await requestJson("POST", "http://localhost:3000/api/projects", createBody);
  if (!createRes.body || !createRes.body.ok) {
    console.error("ERROR:", JSON.stringify(createRes.body, null, 2));
    process.exit(1);
  }

  console.log("\nProject created/updated successfully!");
  console.log("  ID:     " + createRes.body.project.id);
  console.log("  Name:   " + createRes.body.project.name);
  console.log("  Charts: " + nodes.length);
  console.log("\nOpen: http://localhost:3000  -> My Projects -> " + PROJECT_NAME);
}

main().catch((e) => {
  console.error("FATAL:", e && e.message ? e.message : e);
  process.exit(1);
});
