import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import net from "net";

type DbType = "clickhouse" | "postgres" | "mysql" | "mssql";

type Role = "user" | "business" | "admin";

type ConnectionConfig = {
  type: DbType;
  host: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
};

type QueryRequest = {
  connection: ConnectionConfig;
  sql: string;
  role?: Role;
  maxRows?: number;
  timeoutMs?: number;
};

type QueryResponse = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
};

function normalizeRole(role: unknown): Role {
  if (role === "admin" || role === "business" || role === "user") return role;
  return "user";
}

function normalizeDbType(type: unknown): DbType {
  if (type === "clickhouse" || type === "postgres" || type === "mysql" || type === "mssql") return type;
  throw new Error("Unsupported connection type");
}

// TCP connection testing
async function testTcpConnection(
  host: string,
  port: number,
  timeout: number = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on("error", () => {
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

// List databases for PostgreSQL
async function listPostgresDatabases(connection: ConnectionConfig): Promise<string[]> {
  const { Client } = await import("pg");
  const client = new Client({
    host: connection.host,
    port: connection.port ?? 5432,
    user: connection.user,
    password: connection.password,
    database: "postgres",
  });
  
  await client.connect();
  
  const result = await client.query(`
    SELECT datname FROM pg_database 
    WHERE datistemplate = false 
    AND datname != 'postgres'
    ORDER BY datname
  `);
  
  await client.end();
  
  return result.rows.map((row: { datname: string }) => row.datname);
}

// List databases for MySQL
async function listMySqlDatabases(connection: ConnectionConfig): Promise<string[]> {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({
    host: connection.host,
    port: connection.port ?? 3306,
    user: connection.user,
    password: connection.password,
  });
  
  const [rows] = await pool.query("SHOW DATABASES");
  await pool.end();
  
  return (rows as { Database: string }[])
    .map(row => row.Database)
    .filter(db => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db));
}

// List databases for MSSQL
async function listMsSqlDatabases(connection: ConnectionConfig): Promise<string[]> {
  const sql = await import("mssql");
  const pool = await sql.connect({
    server: connection.host,
    port: connection.port ?? 1433,
    user: connection.user,
    password: connection.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  });
  
  const result = await pool.request().query(`
    SELECT name FROM sys.databases 
    WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
    ORDER BY name
  `);
  
  await pool.close();
  
  return result.recordset.map((row: { name: string }) => row.name);
}

function isProbablyMultiStatement(sql: string): boolean {
  const trimmed = sql.trim();
  const withoutTrailing = trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
  return withoutTrailing.includes(";");
}

function enforceRolePolicy(sql: string, role: Role): void {
  const cleaned = sql.trim().toLowerCase();

  if (role === "admin") {
    return;
  }

  // Allow read-only operations for user/business.
  const allowedPrefixes = ["select", "with", "show", "describe", "desc", "explain"];
  if (!allowedPrefixes.some((p) => cleaned.startsWith(p))) {
    throw new Error("Only read-only queries are allowed for this role");
  }

  // Extra hard-blocks.
  const forbidden = ["insert", "update", "delete", "alter", "drop", "truncate", "create", "grant", "revoke"]; 
  if (forbidden.some((kw) => cleaned.includes(kw))) {
    throw new Error("Query contains forbidden keywords for this role");
  }
}

async function queryClickHouse(req: QueryRequest): Promise<QueryResponse> {
  const cfg = req.connection;
  const host = cfg.host;
  const port = cfg.port ?? 8123;
  const database = cfg.database ?? "default";
  const user = cfg.user ?? "default";
  const password = cfg.password ?? "";

  const timeoutMs = Math.max(1000, Math.min(60_000, req.timeoutMs ?? 10_000));
  const maxRows = Math.max(1, Math.min(50_000, req.maxRows ?? 1000));

  const u = new URL(`http://${host}:${port}/`);
  u.searchParams.set("database", database);
  u.searchParams.set("user", user);
  if (password) u.searchParams.set("password", password);
  u.searchParams.set("default_format", "JSONCompact");
  u.searchParams.set("max_result_rows", String(maxRows));
  u.searchParams.set("max_execution_time", String(Math.ceil(timeoutMs / 1000)));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: req.sql,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ClickHouse error (${res.status}): ${text}`);
    }

    const parsed = JSON.parse(text) as { meta?: Array<{ name: string }>; data?: unknown[][]; rows?: number };
    const columns = (parsed.meta ?? []).map((m) => m.name);
    const rows = parsed.data ?? [];

    return {
      columns,
      rows,
      rowCount: typeof parsed.rows === "number" ? parsed.rows : rows.length,
    };
  } finally {
    clearTimeout(t);
  }
}

async function queryPostgres(req: QueryRequest): Promise<QueryResponse> {
  const { Client } = await import("pg");

  const cfg = req.connection;
  const timeoutMs = Math.max(1000, Math.min(60_000, req.timeoutMs ?? 10_000));
  const maxRows = Math.max(1, Math.min(50_000, req.maxRows ?? 1000));

  const client = new Client({
    host: cfg.host,
    port: cfg.port ?? 5432,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    statement_timeout: timeoutMs,
  });

  await client.connect();
  try {
    // Ensure maxRows without rewriting SQL: rely on server-side statement_timeout + client-side slicing.
    const result = await client.query(req.sql);
    const columns = result.fields.map((f: { name: string }) => f.name);
    const rows = result.rows
      .slice(0, maxRows)
      .map((r: Record<string, unknown>) => columns.map((c: string) => r[c]));
    return { columns, rows, rowCount: rows.length };
  } finally {
    await client.end();
  }
}

async function queryMySql(req: QueryRequest): Promise<QueryResponse> {
  const mysql = await import("mysql2/promise");

  const cfg = req.connection;
  const timeoutMs = Math.max(1000, Math.min(60_000, req.timeoutMs ?? 10_000));
  const maxRows = Math.max(1, Math.min(50_000, req.maxRows ?? 1000));

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port ?? 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectTimeout: timeoutMs,
  });

  try {
    const [rows, fields] = await conn.query(req.sql);
    const cols = (fields as Array<{ name: string }>).map((f) => f.name);
    const arr = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const sliced = arr.slice(0, maxRows).map((r) => cols.map((c) => r[c]));
    return { columns: cols, rows: sliced, rowCount: sliced.length };
  } finally {
    await conn.end();
  }
}

async function queryMsSql(req: QueryRequest): Promise<QueryResponse> {
  const sql = await import("mssql");

  const cfg = req.connection;
  const timeoutMs = Math.max(1000, Math.min(60_000, req.timeoutMs ?? 10_000));
  const maxRows = Math.max(1, Math.min(50_000, req.maxRows ?? 1000));

  const pool = await sql.connect({
    server: cfg.host,
    port: cfg.port ?? 1433,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: {
      enableArithAbort: true,
      trustServerCertificate: true,
    },
    requestTimeout: timeoutMs,
  });

  try {
    const result = await pool.request().query(req.sql);
    const recordset = (result.recordset ?? []) as Record<string, unknown>[];
    const columns = recordset.length > 0 ? Object.keys(recordset[0]) : [];
    const rows = recordset.slice(0, maxRows).map((r) => columns.map((c) => r[c]));
    return { columns, rows, rowCount: rows.length };
  } finally {
    await pool.close();
  }
}

async function runQuery(req: QueryRequest): Promise<QueryResponse> {
  const type = normalizeDbType(req.connection.type);
  const role = normalizeRole(req.role);

  if (isProbablyMultiStatement(req.sql)) {
    throw new Error("Multi-statement queries are not allowed");
  }

  enforceRolePolicy(req.sql, role);

  switch (type) {
    case "clickhouse":
      return queryClickHouse(req);
    case "postgres":
      return queryPostgres(req);
    case "mysql":
      return queryMySql(req);
    case "mssql":
      return queryMsSql(req);
    default:
      throw new Error("Unsupported connection type");
  }
}

async function schemaClickHouse(connection: ConnectionConfig) {
  const host = connection.host;
  const port = connection.port ?? 8123;
  const database = connection.database ?? "default";
  const user = connection.user ?? "default";
  const password = connection.password ?? "";

  const u = new URL(`http://${host}:${port}/`);
  u.searchParams.set("database", database);
  u.searchParams.set("user", user);
  if (password) u.searchParams.set("password", password);

  const sql = `
    SELECT database, table, name, type
    FROM system.columns
    WHERE database = {db:String}
    ORDER BY database, table, position
    FORMAT JSONEachRow
  `;

  u.searchParams.set("query", sql);
  u.searchParams.set("param_db", database);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse schema error (${res.status}): ${text}`);
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { database: string; table: string; name: string; type: string });

  return { database, columns: lines };
}

async function schemaPostgres(connection: ConnectionConfig) {
  const { Client } = await import("pg");

  const host = connection.host;
  const port = connection.port ?? 5432;
  const database = connection.database;
  const user = connection.user;
  const password = connection.password;

  if (!database) throw new Error("Postgres connection.database is required for schema introspection");
  if (!user) throw new Error("Postgres connection.user is required for schema introspection");

  const client = new Client({
    host,
    port,
    database,
    user,
    password,
  });

  await client.connect();
  try {
    const sql = `
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_catalog = $1
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name, ordinal_position
    `;

    const result = await client.query(sql, [database]);
    const columns = result.rows.map((r: Record<string, unknown>) => ({
      database,
      schema: String(r["table_schema"] ?? ""),
      table: String(r["table_name"] ?? ""),
      name: String(r["column_name"] ?? ""),
      type: String(r["data_type"] ?? ""),
      nullable: String(r["is_nullable"] ?? "").toUpperCase() === "YES",
    }));

    return { database, columns };
  } finally {
    await client.end();
  }
}

async function schemaMySql(connection: ConnectionConfig) {
  const mysql = await import("mysql2/promise");

  const host = connection.host;
  const port = connection.port ?? 3306;
  const database = connection.database;
  const user = connection.user;
  const password = connection.password;

  if (!database) throw new Error("MySQL connection.database is required for schema introspection");
  if (!user) throw new Error("MySQL connection.user is required for schema introspection");

  const conn = await mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
  });

  try {
    const sql = `
      SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        COLUMN_TYPE AS column_type,
        IS_NULLABLE AS is_nullable
      FROM information_schema.columns
      WHERE table_schema = ?
      ORDER BY table_name, ordinal_position
    `;

    const [rows] = await conn.query(sql, [database]);
    const arr = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];

    const columns = arr.map((r) => ({
      database,
      schema: String(r["table_schema"] ?? ""),
      table: String(r["table_name"] ?? ""),
      name: String(r["column_name"] ?? ""),
      type: String(r["column_type"] ?? ""),
      nullable: String(r["is_nullable"] ?? "").toUpperCase() === "YES",
    }));

    return { database, columns };
  } finally {
    await conn.end();
  }
}

async function schemaMsSql(connection: ConnectionConfig) {
  const mssqlMod = await import("mssql");
  const sql = (mssqlMod as unknown as { default?: any }).default ?? (mssqlMod as any);

  const host = connection.host;
  const port = connection.port ?? 1433;
  const database = connection.database;
  const user = connection.user;
  const password = connection.password;

  if (!database) throw new Error("MSSQL connection.database is required for schema introspection");
  if (!user) throw new Error("MSSQL connection.user is required for schema introspection");

  const pool = await sql.connect({
    server: host,
    port,
    database,
    user,
    password,
    options: {
      enableArithAbort: true,
      trustServerCertificate: true,
    },
  });

  try {
    const q = `
      SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        DATA_TYPE AS data_type,
        IS_NULLABLE AS is_nullable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_CATALOG = DB_NAME()
      ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
    `;

    const result = await pool.request().query(q);
    const recordset = (result.recordset ?? []) as Record<string, unknown>[];

    const columns = recordset.map((r) => ({
      database,
      schema: String(r["table_schema"] ?? ""),
      table: String(r["table_name"] ?? ""),
      name: String(r["column_name"] ?? ""),
      type: String(r["data_type"] ?? ""),
      nullable: String(r["is_nullable"] ?? "").toUpperCase() === "YES",
    }));

    return { database, columns };
  } finally {
    await pool.close();
  }
}

const fastify = Fastify({ logger: true });

const sharedSecret = process.env.DATATALK_AGENT_SHARED_SECRET;
if (sharedSecret) {
  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const got = request.headers["x-datatalk-agent-secret"];
    const gotValue = Array.isArray(got) ? got[0] : got;

    if (typeof gotValue !== "string" || gotValue !== sharedSecret) {
      reply.code(401);
      return reply.send({ error: "Unauthorized" });
    }
  });
}

fastify.get("/health", async () => {
  return {
    status: "ok",
    service: "datatalk-agent",
    version: "0.1.0",
  };
});

fastify.post<{ Body: QueryRequest }>("/query", async (request, reply) => {
  try {
    const body = request.body;
    const result = await runQuery(body);
    return { data: result };
  } catch (err: unknown) {
    reply.code(400);
    const message = err instanceof Error ? err.message : "Query failed";
    return { error: message };
  }
});

fastify.post<{ Body: { connection: ConnectionConfig } }>("/schema", async (request, reply) => {
  try {
    const body = request.body;
    const type = normalizeDbType(body.connection.type);

    switch (type) {
      case "clickhouse": {
        const result = await schemaClickHouse(body.connection);
        return { data: result };
      }
      case "postgres": {
        const result = await schemaPostgres(body.connection);
        return { data: result };
      }
      case "mysql": {
        const result = await schemaMySql(body.connection);
        return { data: result };
      }
      case "mssql": {
        const result = await schemaMsSql(body.connection);
        return { data: result };
      }
      default:
        reply.code(501);
        return { error: "Schema introspection is not implemented for this connection type" };
    }
  } catch (err: unknown) {
    reply.code(400);
    const message = err instanceof Error ? err.message : "Schema failed";
    return { error: message };
  }
});

// Discover available databases on localhost and network
fastify.get("/discover", async (request: any) => {
  const query = request.query as { mode?: string };
  const mode = query.mode || 'quick'; // 'quick' or 'full'

  // 1. Quick scan localhost with standard and alternate ports
  let networkDatabases: any[] = [];
  try {
    const { quickScan } = await import('./networkScanner.js');
    networkDatabases = await quickScan();
  } catch (err) {
    console.error('[Discover] Network scan failed:', err);
  }

  // 2. Docker container discovery
  let dockerDatabases: any[] = [];
  try {
    const { findDatabaseContainers } = await import('./dockerDiscovery.js');
    dockerDatabases = await findDatabaseContainers();
  } catch (err) {
    console.error('[Discover] Docker discovery failed:', err);
  }

  // 3. File-based databases (SQLite, Access)
  let fileDatabases: any[] = [];
  try {
    const { findDatabaseFiles, getDefaultSearchPaths } = await import('./fileDiscovery.js');
    const searchPaths = getDefaultSearchPaths();
    const foundFiles = await findDatabaseFiles(searchPaths, 2, 20);
    
    fileDatabases = foundFiles.map((file: any) => ({
      type: file.type,
      path: file.path,
      name: file.name,
      size: file.size,
      modified: file.modified,
      accessible: file.accessible,
      available: file.accessible,
    }));
  } catch (err) {
    console.error('[Discover] File discovery failed:', err);
  }

  // 4. Full network scan (if requested)
  let remoteDatabases: any[] = [];
  if (mode === 'full') {
    try {
      const { fullNetworkScan } = await import('./networkScanner.js');
      console.log('[Discover] Starting full network scan...');
      remoteDatabases = await fullNetworkScan();
      console.log(`[Discover] Found ${remoteDatabases.length} remote databases`);
    } catch (err) {
      console.error('[Discover] Full network scan failed:', err);
    }
  }

  return { 
    network: networkDatabases,
    docker: dockerDatabases,
    files: fileDatabases,
    remote: remoteDatabases,
    mode,
  };
});

// Test connection and list available databases
fastify.post<{ Body: { connection: ConnectionConfig } }>("/test-connection", async (request, reply) => {
  try {
    const body = request.body;
    const type = normalizeDbType(body.connection.type);

    let databases: string[] = [];

    switch (type) {
      case "postgres":
        databases = await listPostgresDatabases(body.connection);
        break;
      case "mysql":
        databases = await listMySqlDatabases(body.connection);
        break;
      case "mssql":
        databases = await listMsSqlDatabases(body.connection);
        break;
      default:
        reply.code(501);
        return { error: "Database type not supported" };
    }

    return { success: true, databases };
  } catch (err: unknown) {
    reply.code(400);
    const message = err instanceof Error ? err.message : "Connection test failed";
    return { success: false, error: message };
  }
});

const port = Number(process.env.DATATALK_AGENT_PORT ?? "9010");
const host = process.env.DATATALK_AGENT_HOST ?? "0.0.0.0";

fastify
  .listen({ port, host })
  .then(() => {
    fastify.log.info(`datatalk-agent listening on http://${host}:${port}`);
  })
  .catch((err: unknown) => {
    fastify.log.error(err);
    process.exit(1);
  });
