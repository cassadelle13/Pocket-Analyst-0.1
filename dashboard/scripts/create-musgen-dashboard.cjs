/**
 * Creates the "Musgen Analytics" dashboard project with 9 charts.
 * Run: node scripts/create-musgen-dashboard.cjs
 */
const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
  host: process.env.DATATALK_META_PG_HOST || "localhost",
  port: Number(process.env.DATATALK_META_PG_PORT || "15432"),
  database: process.env.DATATALK_META_PG_DATABASE || "postgres",
  user: process.env.DATATALK_META_PG_USER || "postgres",
  password: process.env.DATATALK_META_PG_PASSWORD || "postgres",
  connectionTimeoutMillis: 8000,
});

function uid() {
  return crypto.randomUUID();
}

async function main() {
  // ── 1. Find Musgen connection ──────────────────────────────────────────────
  const connRes = await pool.query(
    `SELECT id, name, type FROM datatalk_meta.connections ORDER BY
      CASE WHEN lower(name) LIKE '%musgen%' THEN 0 ELSE 1 END, name LIMIT 20`
  );
  console.log("Available connections:");
  for (const r of connRes.rows) console.log(" ", r.id, r.name, r.type);

  if (connRes.rows.length === 0) {
    throw new Error("No connections found. Please add a connection first.");
  }

  const musgenConn =
    connRes.rows.find((r) => /musgen/i.test(r.name)) || connRes.rows[0];
  const connectionId = musgenConn.id;
  const connectionType = musgenConn.type || "postgres";
  console.log(`\nUsing connection: "${musgenConn.name}" (${connectionId})`);

  // ── 2. Define table references ──────────────────────────────────────────────
  // Musgen data lives in schema "musgen" inside the postgres db
  const T = {
    chat: "musgen.chat",
    generation: "musgen.music_generation",
    payment: "musgen.payment",
    cost: "musgen.user_music_generation_cost",
    balance: "musgen.balance",
    userTariff: "musgen.user_tariff",
    tariff: "musgen.tariff",
  };

  // ── 3. Build chart nodes ────────────────────────────────────────────────────
  // Layout: 3 columns × 3 rows, each chart 560×380, gap 24
  const W = 560;
  const H = 380;
  const GAP = 24;
  const COLS = 3;

  function pos(col, row) {
    return { x: col * (W + GAP), y: row * (H + GAP) };
  }

  function makeNode({ id, title, chartName, vizType, tableKey, mapping, position }) {
    return {
      id,
      type: "chart",
      name: chartName,
      title,
      position,
      size: { width: W, height: H },
      data: {
        kind: "db-table",
        connectionId,
        connectionType,
        tableKey,
        chartName,
        columnMapping: mapping,
        chartConfig: {
          general: { vizType },
        },
        columnsMeta: [],
      },
    };
  }

  const nodes = [
    // ── Row 0 ──────────────────────────────────────────────────────────────
    // [0,0] KPI: Total users
    makeNode({
      id: uid(),
      title: "Всего пользователей",
      chartName: "KPI: Total Users",
      vizType: "kpi",
      tableKey: T.chat,
      position: pos(0, 0),
      mapping: {
        yColumns: [{ col: "id", agg: "COUNT" }],
        detailsColumns: [],
      },
    }),

    // [1,0] KPI: Total generations
    makeNode({
      id: uid(),
      title: "Всего генераций",
      chartName: "KPI: Total Generations",
      vizType: "kpi",
      tableKey: T.generation,
      position: pos(1, 0),
      mapping: {
        yColumns: [{ col: "id", agg: "COUNT" }],
        detailsColumns: [],
      },
    }),

    // [2,0] KPI: Total revenue
    makeNode({
      id: uid(),
      title: "Выручка (сумма)",
      chartName: "KPI: Total Revenue",
      vizType: "kpi",
      tableKey: T.payment,
      position: pos(2, 0),
      mapping: {
        yColumns: [{ col: "amount_value", agg: "SUM" }],
        detailsColumns: [],
      },
    }),

    // ── Row 1 ──────────────────────────────────────────────────────────────
    // [0,1] Line: New users per day
    makeNode({
      id: uid(),
      title: "Новые пользователи (по дням)",
      chartName: "Line Chart: New Users per Day",
      vizType: "line",
      tableKey: T.chat,
      position: pos(0, 1),
      mapping: {
        xColumn: "created_at",
        yColumns: [{ col: "id", agg: "COUNT" }],
        groupBy: "",
      },
    }),

    // [1,1] Line: Generations per day
    makeNode({
      id: uid(),
      title: "Генерации (по дням)",
      chartName: "Line Chart: Generations per Day",
      vizType: "line",
      tableKey: T.generation,
      position: pos(1, 1),
      mapping: {
        xColumn: "created_at",
        yColumns: [{ col: "id", agg: "COUNT" }],
        groupBy: "",
      },
    }),

    // [2,1] Line: Revenue per day
    makeNode({
      id: uid(),
      title: "Выручка (по дням)",
      chartName: "Line Chart: Revenue per Day",
      vizType: "line",
      tableKey: T.payment,
      position: pos(2, 1),
      mapping: {
        xColumn: "created_at",
        yColumns: [{ col: "amount_value", agg: "SUM" }],
        groupBy: "",
      },
    }),

    // ── Row 2 ──────────────────────────────────────────────────────────────
    // [0,2] Bar: Generations by status
    makeNode({
      id: uid(),
      title: "Генерации по статусу",
      chartName: "Bar Chart: Generations by Status",
      vizType: "bar",
      tableKey: T.generation,
      position: pos(0, 2),
      mapping: {
        xColumn: "status",
        yColumns: [{ col: "id", agg: "COUNT" }],
        groupBy: "",
      },
    }),

    // [1,2] Bar: Errors by type
    makeNode({
      id: uid(),
      title: "Ошибки по типу",
      chartName: "Bar Chart: Errors by Type",
      vizType: "bar",
      tableKey: T.generation,
      position: pos(1, 2),
      mapping: {
        xColumn: "error_type",
        yColumns: [{ col: "id", agg: "COUNT" }],
        groupBy: "",
      },
    }),

    // [2,2] Pie: Generations free vs paid
    makeNode({
      id: uid(),
      title: "Free vs Paid генерации",
      chartName: "Pie Chart: Free vs Paid",
      vizType: "pie",
      tableKey: T.cost,
      position: pos(2, 2),
      mapping: {
        groupBy: "is_free",
        xColumn: "is_free",
        yColumns: [{ col: "music_generation_id", agg: "COUNT" }],
      },
    }),
  ];

  // ── 4. Insert project ──────────────────────────────────────────────────────
  const projectId = `project_musgen_${Date.now()}`;
  const projectName = "Musgen Analytics (DataLens parity)";

  const insertRes = await pool.query(
    `INSERT INTO datatalk_meta.projects
       (id, name, description, thumbnail, nodes, viewport, semantic_artifacts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           nodes = EXCLUDED.nodes,
           updated_at = now()
     RETURNING id, name`,
    [
      projectId,
      projectName,
      "Дашборд Musgen: пользователи, генерации, выручка, статусы — аналог DataLens dywbxwlualpix",
      "",
      JSON.stringify(nodes),
      JSON.stringify({ pan: { x: -12, y: -12 }, zoom: 0.75 }),
      null,
    ]
  );

  const created = insertRes.rows[0];
  console.log(`\n✅ Project created:`);
  console.log(`   ID:   ${created.id}`);
  console.log(`   Name: ${created.name}`);
  console.log(`   Charts: ${nodes.length}`);
  console.log(`\nOpen: http://localhost:3000  → My Projects → "${projectName}"`);
}

main()
  .catch((e) => {
    console.error("\n❌ FAILED:", e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
