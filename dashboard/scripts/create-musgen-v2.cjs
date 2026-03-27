/**
 * Creates "Musgen Analytics" dashboard project with 9 charts.
 * Run: node scripts/create-musgen-v2.cjs
 */
const https = require("https");
const http = require("http");

const CONNECTION_ID = "9e676718-1cf4-408d-b54f-11b881941e6d";
const CONNECTION_TYPE = "postgres";
const W = 580, H = 400, GAP = 24;

function pos(col, row) {
  return { x: col * (W + GAP), y: row * (H + GAP) };
}

function node(id, title, chartName, vizType, tableKey, mapping, col, row) {
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
      columnMapping: mapping,
      chartConfig: { general: { vizType } },
      columnsMeta: [],
    },
  };
}

const nodes = [
  // Row 0 — KPI
  node("node_kpi_users", "Total Users",       "KPI: Total Users",       "kpi",  "musgen.chat",
       { yColumns: [{ col: "id", agg: "COUNT" }], detailsColumns: [] }, 0, 0),

  node("node_kpi_gen",   "Total Generations", "KPI: Total Generations", "kpi",  "musgen.music_generation",
       { yColumns: [{ col: "id", agg: "COUNT" }], detailsColumns: [] }, 1, 0),

  node("node_kpi_rev",   "Total Revenue RUB", "KPI: Total Revenue",     "kpi",  "musgen.payment",
       { yColumns: [{ col: "amount_value", agg: "SUM" }], detailsColumns: [] }, 2, 0),

  // Row 1 — Line charts
  node("node_line_users", "New Users per Day",   "Line Chart: New Users per Day",   "line", "musgen.chat",
       { xColumn: "created_at", yColumns: [{ col: "id", agg: "COUNT" }], groupBy: "" }, 0, 1),

  node("node_line_gen",   "Generations per Day", "Line Chart: Generations per Day", "line", "musgen.music_generation",
       { xColumn: "created_at", yColumns: [{ col: "id", agg: "COUNT" }], groupBy: "" }, 1, 1),

  node("node_line_rev",   "Revenue per Day",     "Line Chart: Revenue per Day",     "line", "musgen.payment",
       { xColumn: "created_at", yColumns: [{ col: "amount_value", agg: "SUM" }], groupBy: "" }, 2, 1),

  // Row 2 — Bar + Pie
  node("node_bar_status", "Generations by Status", "Bar Chart: Generations by Status", "bar", "musgen.music_generation",
       { xColumn: "status",     yColumns: [{ col: "id", agg: "COUNT" }], groupBy: "" }, 0, 2),

  node("node_bar_err",    "Errors by Type",        "Bar Chart: Errors by Type",        "bar", "musgen.music_generation",
       { xColumn: "error_type", yColumns: [{ col: "id", agg: "COUNT" }], groupBy: "" }, 1, 2),

  node("node_pie_free",   "Free vs Paid",          "Pie Chart: Free vs Paid",          "pie", "musgen.user_music_generation_cost",
       { groupBy: "is_free", xColumn: "is_free", yColumns: [{ col: "music_generation_id", agg: "COUNT" }] }, 2, 2),
];

const projectId = "project_musgen_datalens_v2";
const body = JSON.stringify({
  id: projectId,
  name: "Musgen Analytics",
  description: "Musgen dashboard: users, generations, revenue, statuses. DataLens dywbxwlualpix parity.",
  thumbnail: "",
  nodes,
  viewport: { pan: { x: -12, y: -12 }, zoom: 0.75 },
});

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const res = await postJson("http://localhost:3000/api/projects", body);
  if (res.body && res.body.ok) {
    console.log("\nProject created!");
    console.log("  ID:     " + res.body.project.id);
    console.log("  Name:   " + res.body.project.name);
    console.log("  Charts: " + nodes.length);
    console.log("\nOpen: http://localhost:3000  -> My Projects -> Musgen Analytics");
  } else {
    console.error("ERROR:", JSON.stringify(res.body, null, 2));
    process.exit(1);
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
