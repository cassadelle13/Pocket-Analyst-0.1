const BASE = "http://127.0.0.1:3000";
const CID = "9e676718-1cf4-408d-b54f-11b881941e6d";

async function run() {
  const sql = "SELECT min(event_time)::date as min_date, max(event_time)::date as max_date, count(*) as total FROM musgen.analytics_event;";
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql, maxRows: 1 }),
  });
  const j = await r.json();
  console.log("columns:", j?.data?.columns);
  console.log("rows:", JSON.stringify(j?.data?.rows));

  // Also check event names
  const sql2 = "SELECT event_name, count(*) as cnt FROM musgen.analytics_event GROUP BY event_name ORDER BY cnt DESC LIMIT 20;";
  const r2 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: sql2, maxRows: 20 }),
  });
  const j2 = await r2.json();
  console.log("\nevent_names:", j2?.data?.columns);
  for (const row of (j2?.data?.rows ?? [])) {
    console.log("  ", row[0], ":", row[1]);
  }

  // Raw sample  
  const sql3 = "SELECT chat_id, event_name, event_time FROM musgen.analytics_event ORDER BY event_time DESC LIMIT 5;";
  const r3 = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: CID, sql: sql3, maxRows: 5 }),
  });
  const j3 = await r3.json();
  console.log("\nSample rows:");
  for (const row of (j3?.data?.rows ?? [])) {
    console.log("  ", row);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
