const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    host: process.env.DATATALK_META_PG_HOST || "localhost",
    port: Number(process.env.DATATALK_META_PG_PORT || "15432"),
    database: process.env.DATATALK_META_PG_DATABASE || "datatalk",
    user: process.env.DATATALK_META_PG_USER || "datatalk",
    password: process.env.DATATALK_META_PG_PASSWORD || "datatalk",
    connectionTimeoutMillis: 5000,
  });
  try {
    const r = await pool.query(
      "SELECT id, name, type FROM datatalk_meta.connections ORDER BY name"
    );
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error("DB ERROR:", e.message);
    console.error("Stack:", e.stack);
  } finally {
    try { await pool.end(); } catch {}
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
