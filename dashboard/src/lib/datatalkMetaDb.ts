import { Pool } from "pg";
import { canUseEncryption, decryptString, encryptString } from "./datatalkCrypto";

type PgConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

function getPgConfig(): PgConfig {
  const host = process.env.DATATALK_META_PG_HOST ?? "localhost";
  const port = Number(process.env.DATATALK_META_PG_PORT ?? "15432");
  const database = process.env.DATATALK_META_PG_DATABASE ?? "datatalk";
  const user = process.env.DATATALK_META_PG_USER ?? "datatalk";
  const password = process.env.DATATALK_META_PG_PASSWORD ?? "datatalk";

  return { host, port, database, user, password };
}

let pool: Pool | null = null;

export function getDataTalkMetaPool(): Pool {
  if (pool) return pool;

  const cfg = getPgConfig();

  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return pool;
}

export type ConnectionType = "clickhouse" | "postgres" | "mysql" | "mssql";

export type DataTalkConnection = {
  id: string;
  name: string;
  type: ConnectionType;
  host: string;
  port: number | null;
  database: string | null;
  username: string | null;
  password: string | null;
  password_enc?: string | null;
  created_at: string;
  updated_at: string;
};

export type DataTalkConnectionPublic = Omit<DataTalkConnection, "password" | "password_enc"> & {
  password: null;
};

export async function listConnections(): Promise<DataTalkConnectionPublic[]> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, type, host, port, database, username, created_at, updated_at
    FROM datatalk_meta.connections
    ORDER BY name ASC
    `
  );
  return (res.rows as Array<Omit<DataTalkConnectionPublic, "password">>).map((r) => ({ ...r, password: null }));
}

export async function getConnectionById(id: string): Promise<DataTalkConnectionPublic | null> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, type, host, port, database, username, created_at, updated_at
    FROM datatalk_meta.connections
    WHERE id = $1
    `,
    [id]
  );
  const row = res.rows[0] as Omit<DataTalkConnectionPublic, "password"> | undefined;
  return row ? { ...row, password: null } : null;
}

type DataTalkConnectionSecretRow = Omit<DataTalkConnection, "password"> & {
  password: string | null;
  password_enc: string | null;
};

async function maybeMigratePasswordToEnc(id: string, passwordPlain: string) {
  if (!canUseEncryption()) return;
  const enc = encryptString(passwordPlain);
  await getDataTalkMetaPool().query(
    `UPDATE datatalk_meta.connections SET password_enc = $2, password = NULL, updated_at = now() WHERE id = $1`,
    [id, enc]
  );
}

export type QueryAuditRow = {
  id: string;
  created_at: string;
  connection_id: string | null;
  connection_name: string | null;
  db_type: string | null;
  role: string | null;
  sql_preview: string | null;
  sql_sha256: string | null;
  status: QueryAuditStatus;
  duration_ms: number | null;
  row_count: number | null;
  error_message: string | null;
};

export type ListQueryAuditParams = {
  limit?: number;
  status?: QueryAuditStatus;
  connectionId?: string;
};

export async function listQueryAudit(params: ListQueryAuditParams): Promise<QueryAuditRow[]> {
  const limit = Math.max(1, Math.min(500, params.limit ?? 100));

  const where: string[] = [];
  const values: unknown[] = [];

  if (params.status) {
    values.push(params.status);
    where.push(`status = $${values.length}`);
  }

  if (params.connectionId) {
    values.push(params.connectionId);
    where.push(`connection_id = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  values.push(limit);

  const res = await getDataTalkMetaPool().query(
    `
    SELECT
      id,
      created_at,
      connection_id,
      connection_name,
      db_type,
      role,
      sql_preview,
      sql_sha256,
      status,
      duration_ms,
      row_count,
      error_message
    FROM datatalk_meta.query_audit
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${values.length}
    `,
    values
  );

  return res.rows as QueryAuditRow[];
}

export async function getConnectionSecretForAgent(id: string): Promise<{ connection: {
  type: ConnectionType;
  host: string;
  port: number | null;
  database: string | null;
  user: string | null;
  password: string | null;
}; name: string } | null> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, type, host, port, database, username, password, password_enc
    FROM datatalk_meta.connections
    WHERE id = $1
    `,
    [id]
  );

  const row = (res.rows[0] as DataTalkConnectionSecretRow | undefined) ?? null;
  if (!row) return null;

  let password: string | null = null;

  if (row.password_enc) {
    password = decryptString(row.password_enc);
  } else if (row.password) {
    password = row.password;
    await maybeMigratePasswordToEnc(row.id, row.password);
  }

  return {
    name: row.name,
    connection: {
      type: row.type,
      host: row.host,
      port: row.port,
      database: row.database,
      user: row.username,
      password,
    },
  };
}

export type UpsertConnectionInput = {
  name: string;
  type: ConnectionType;
  host: string;
  port?: number | null;
  database?: string | null;
  username?: string | null;
  password?: string | null;
};

export async function createConnection(input: UpsertConnectionInput): Promise<DataTalkConnectionPublic> {
  const useEnc = canUseEncryption();
  const passwordEnc = input.password && useEnc ? encryptString(input.password) : null;
  const passwordPlain = input.password && !useEnc ? input.password : null;

  const res = await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password, password_enc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, name, type, host, port, database, username, created_at, updated_at
    `,
    [
      input.name,
      input.type,
      input.host,
      input.port ?? null,
      input.database ?? null,
      input.username ?? null,
      passwordPlain,
      passwordEnc,
    ]
  );

  const row = res.rows[0] as Omit<DataTalkConnectionPublic, "password">;
  return { ...row, password: null };
}

export async function updateConnection(id: string, input: UpsertConnectionInput): Promise<DataTalkConnectionPublic | null> {
  const useEnc = canUseEncryption();
  const passwordEnc = input.password && useEnc ? encryptString(input.password) : null;
  const passwordPlain = input.password && !useEnc ? input.password : null;

  const res = await getDataTalkMetaPool().query(
    `
    UPDATE datatalk_meta.connections
    SET
      name = $2,
      type = $3,
      host = $4,
      port = $5,
      database = $6,
      username = $7,
      password = $8,
      password_enc = $9,
      updated_at = now()
    WHERE id = $1
    RETURNING id, name, type, host, port, database, username, created_at, updated_at
    `,
    [
      id,
      input.name,
      input.type,
      input.host,
      input.port ?? null,
      input.database ?? null,
      input.username ?? null,
      passwordPlain,
      passwordEnc,
    ]
  );

  const row = res.rows[0] as Omit<DataTalkConnectionPublic, "password"> | undefined;
  return row ? { ...row, password: null } : null;
}

export async function deleteConnection(id: string): Promise<boolean> {
  const res = await getDataTalkMetaPool().query(
    `DELETE FROM datatalk_meta.connections WHERE id = $1`,
    [id]
  );

  return res.rowCount === 1;
}

export type QueryAuditStatus = "ok" | "error";

export type QueryAuditInsert = {
  connectionId?: string | null;
  connectionName?: string | null;
  dbType?: ConnectionType | null;
  role?: string | null;
  sqlPreview?: string | null;
  sqlSha256?: string | null;
  status: QueryAuditStatus;
  durationMs?: number | null;
  rowCount?: number | null;
  errorMessage?: string | null;
};

export async function insertQueryAudit(row: QueryAuditInsert): Promise<void> {
  await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.query_audit (
      connection_id,
      connection_name,
      db_type,
      role,
      sql_preview,
      sql_sha256,
      status,
      duration_ms,
      row_count,
      error_message
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      row.connectionId ?? null,
      row.connectionName ?? null,
      row.dbType ?? null,
      row.role ?? null,
      row.sqlPreview ?? null,
      row.sqlSha256 ?? null,
      row.status,
      row.durationMs ?? null,
      row.rowCount ?? null,
      row.errorMessage ?? null,
    ]
  );
}
