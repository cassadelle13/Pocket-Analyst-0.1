const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    host: "localhost",
    port: 15432,
    database: "datatalk",
    user: "datatalk",
    password: "datatalk",
  });
  try {
    const r = await pool.query(
      "SELECT id, name, type FROM datatalk_meta.connections ORDER BY name"
    );
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await pool.end();
  }
}

main();
