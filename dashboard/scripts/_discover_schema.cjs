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
  // 1. All tables
  const tables = await q(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='musgen' ORDER BY table_name;`);
  console.log("=== TABLES ===");
  for (const r of tables.rows) console.log(" ", r[0]);

  // 2. Schema of key tables
  const keyTables = ["chat", "payment", "music_generation", "balance", "user_tariff", "tariff"];
  for (const t of keyTables) {
    const schema = await q(`SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='musgen' AND table_name='${t}' ORDER BY ordinal_position;`);
    console.log(`\n=== musgen.${t} ===`);
    for (const r of schema.rows) console.log(`  ${r[0]} : ${r[1]}`);

    // sample
    const sample = await q(`SELECT * FROM musgen.${t} LIMIT 3;`);
    console.log(`  columns: ${sample.columns.join(", ")}`);
    for (const r of sample.rows) console.log(`  sample: ${JSON.stringify(r).slice(0, 200)}`);
  }

  // 3. Event name distribution
  const events = await q(`SELECT event_name, count(*) as cnt FROM musgen.analytics_event GROUP BY 1 ORDER BY 2 DESC;`);
  console.log("\n=== EVENT NAMES ===");
  for (const r of events.rows) console.log(`  ${r[0]}: ${r[1]}`);

  // 4. Check if chat table has blocked status
  const chatSample = await q(`SELECT * FROM musgen.chat LIMIT 5;`);
  console.log("\n=== CHAT sample ===");
  console.log("  cols:", chatSample.columns.join(", "));
  for (const r of chatSample.rows) console.log(`  ${JSON.stringify(r).slice(0, 300)}`);

  // 5. Payment sample
  const paySample = await q(`SELECT * FROM musgen.payment LIMIT 5;`);
  console.log("\n=== PAYMENT sample ===");
  console.log("  cols:", paySample.columns.join(", "));
  for (const r of paySample.rows) console.log(`  ${JSON.stringify(r).slice(0, 300)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
