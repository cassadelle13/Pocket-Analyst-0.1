/**
 * End-to-end test simulating exactly what ChartPreview.tsx does:
 *   1. Read project nodes from /api/projects
 *   2. For each chart with customSql, call injectTemplateVars (replicate logic)
 *   3. Send to /api/query
 *   4. Verify columns + rows
 */
const BASE = "http://127.0.0.1:3000";
const PROJECT_ID = process.argv[2] || "musgen_dau_ret_1774372420505";

function injectTemplateVars(sql, dateRange) {
  const toDateLiteral = (v, fallback) => {
    if (v == null || v === "") return fallback ? `'${fallback}'` : "null";
    const d = v instanceof Date ? v : new Date(String(v));
    if (isNaN(d.getTime())) return fallback ? `'${fallback}'` : "null";
    return `'${d.toISOString().slice(0, 10)}'`;
  };
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return sql
    .replace(/\{\{interval_from\}\}/g, toDateLiteral(dateRange?.start, defaultStart))
    .replace(/\{\{interval_to\}\}/g, toDateLiteral(dateRange?.end, defaultEnd));
}

async function main() {
  // 1. Load project
  console.log(`Loading project: ${PROJECT_ID}`);
  const projRes = await fetch(`${BASE}/api/projects?id=${PROJECT_ID}`);
  const projJson = await projRes.json();
  if (!projRes.ok || !projJson.ok) {
    console.error("Failed to load project:", projJson);
    process.exit(1);
  }

  const nodes = projJson.project?.nodes_json ?? projJson.project?.nodes ?? [];
  console.log(`Found ${nodes.length} chart node(s)\n`);

  for (const node of nodes) {
    const name = node.name || node.title || node.id;
    const data = node.data || {};
    const customSql = String(data.customSql || "").trim();
    const connectionId = String(data.connectionId || "").trim();
    const vizType = data.chartConfig?.general?.vizType || "unknown";

    console.log(`=== ${name} (vizType: ${vizType}) ===`);

    if (!customSql) {
      console.log("  No customSql — skipped\n");
      continue;
    }
    if (!connectionId) {
      console.log("  No connectionId — skipped\n");
      continue;
    }

    // 2. Inject template vars (no dateRange = defaults)
    const injected = injectTemplateVars(customSql, { start: undefined, end: undefined });
    console.log("  Injected SQL (first 120):", injected.slice(0, 120).replace(/\n/g, " "));

    // 3. Call /api/query
    const res = await fetch(`${BASE}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, sql: injected, maxRows: 5000 }),
    });
    const json = await res.json();
    const payload = json?.data ?? json;
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    console.log("  HTTP:", res.status);
    console.log("  Columns:", columns.join(", "));
    console.log("  Rows returned:", rows.length);

    if (rows.length > 0) {
      console.log("  First row:", JSON.stringify(rows[0]));
      console.log("  Last row:", JSON.stringify(rows[rows.length - 1]));
      console.log("  VERDICT: PASS — data will render");
    } else {
      console.log("  VERDICT: FAIL — no data, chart will show 'No rows'");
    }
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
