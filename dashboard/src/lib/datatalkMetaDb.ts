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

export type ConnectionType = "clickhouse" | "postgres" | "mysql" | "mssql" | "csv";

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

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
  if (!isUuid(id)) return null;
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

export type SemanticModelRow = {
  id: string;
  name: string;
  description: string | null;
  model_json: any;
  created_at: string;
  updated_at: string;
};

export type UpsertSemanticModelInput = {
  name: string;
  description?: string | null;
  modelJson: any;
};

export async function listSemanticModels(): Promise<Array<Pick<SemanticModelRow, "id" | "name" | "description" | "created_at" | "updated_at">>> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, description, created_at, updated_at
    FROM datatalk_meta.semantic_models
    ORDER BY name ASC
    `
  );
  return res.rows as any;
}

export async function getSemanticModelById(id: string): Promise<SemanticModelRow | null> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, description, model_json, created_at, updated_at
    FROM datatalk_meta.semantic_models
    WHERE id = $1
    `,
    [id]
  );
  const row = (res.rows[0] as SemanticModelRow | undefined) ?? null;
  return row;
}

export async function createSemanticModel(input: UpsertSemanticModelInput): Promise<SemanticModelRow> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("name is required");

  const res = await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.semantic_models (name, description, model_json)
    VALUES ($1, $2, $3)
    RETURNING id, name, description, model_json, created_at, updated_at
    `,
    [name, input.description ?? null, input.modelJson ?? {}]
  );
  return res.rows[0] as SemanticModelRow;
}

export async function updateSemanticModel(id: string, input: UpsertSemanticModelInput): Promise<SemanticModelRow | null> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("name is required");

  const res = await getDataTalkMetaPool().query(
    `
    UPDATE datatalk_meta.semantic_models
    SET name = $2,
        description = $3,
        model_json = $4,
        updated_at = now()
    WHERE id = $1
    RETURNING id, name, description, model_json, created_at, updated_at
    `,
    [id, name, input.description ?? null, input.modelJson ?? {}]
  );
  const row = (res.rows[0] as SemanticModelRow | undefined) ?? null;
  return row;
}

export type SemanticModelBindingRow = {
  id: string;
  scope_type: "project" | "dashboard";
  scope_id: string;
  semantic_model_id: string;
  created_at: string;
  updated_at: string;
};

export async function getSemanticModelBinding(scopeType: "project" | "dashboard", scopeId: string): Promise<SemanticModelBindingRow | null> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, scope_type, scope_id, semantic_model_id, created_at, updated_at
    FROM datatalk_meta.semantic_model_bindings
    WHERE scope_type = $1 AND scope_id = $2
    `,
    [scopeType, scopeId]
  );
  return (res.rows[0] as SemanticModelBindingRow | undefined) ?? null;
}

export async function upsertSemanticModelBinding(scopeType: "project" | "dashboard", scopeId: string, semanticModelId: string): Promise<SemanticModelBindingRow> {
  const res = await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.semantic_model_bindings (scope_type, scope_id, semantic_model_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (scope_type, scope_id)
    DO UPDATE SET semantic_model_id = EXCLUDED.semantic_model_id, updated_at = now()
    RETURNING id, scope_type, scope_id, semantic_model_id, created_at, updated_at
    `,
    [scopeType, scopeId, semanticModelId]
  );
  return res.rows[0] as SemanticModelBindingRow;
}

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
  if (!isUuid(id)) return null;
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

  // CSV connections are represented as ClickHouse-backed imported datasets.
  // For agent calls we proxy them as ClickHouse credentials.
  const agentType: ConnectionType = row.type === "csv" ? "clickhouse" : row.type;
  const agentHost = row.host || "storage";
  const agentPort = row.port ?? 8123;
  const agentDatabase = row.database ?? "analytics";
  const agentUser = row.username ?? "default";

  return {
    name: row.name,
    connection: {
      type: agentType,
      host: agentHost,
      port: agentPort,
      database: agentDatabase,
      user: agentUser,
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

// ============================================================================
// Projects (persistent storage replacing localStorage)
// ============================================================================

export type Project = {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  created_at: string;
  updated_at: string;
  nodes: any;
  viewport: any;
  semantic_artifacts: any;
};

export async function listProjects(): Promise<Project[]> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, description, thumbnail, created_at, updated_at, nodes, viewport, semantic_artifacts
    FROM datatalk_meta.projects
    ORDER BY updated_at DESC
    `
  );
  return res.rows as Project[];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const res = await getDataTalkMetaPool().query(
    `
    SELECT id, name, description, thumbnail, created_at, updated_at, nodes, viewport, semantic_artifacts
    FROM datatalk_meta.projects
    WHERE id = $1
    `,
    [id]
  );
  return (res.rows[0] as Project | undefined) ?? null;
}

export type CreateProjectInput = {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  nodes: any;
  viewport?: any;
  semantic_artifacts?: any;
};

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const res = await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.projects (id, name, description, thumbnail, nodes, viewport, semantic_artifacts)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name, description, thumbnail, created_at, updated_at, nodes, viewport, semantic_artifacts
    `,
    [
      input.id,
      input.name,
      input.description ?? '',
      input.thumbnail ?? '',
      JSON.stringify(input.nodes),
      input.viewport ? JSON.stringify(input.viewport) : null,
      input.semantic_artifacts ? JSON.stringify(input.semantic_artifacts) : null,
    ]
  );
  return res.rows[0] as Project;
}

export type UpdateProjectInput = {
  name?: string;
  description?: string;
  thumbnail?: string;
  nodes?: any;
  viewport?: any;
  semantic_artifacts?: any;
};

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(input.description);
  }
  if (input.thumbnail !== undefined) {
    sets.push(`thumbnail = $${idx++}`);
    values.push(input.thumbnail);
  }
  if (input.nodes !== undefined) {
    sets.push(`nodes = $${idx++}`);
    values.push(JSON.stringify(input.nodes));
  }
  if (input.viewport !== undefined) {
    sets.push(`viewport = $${idx++}`);
    values.push(input.viewport ? JSON.stringify(input.viewport) : null);
  }
  if (input.semantic_artifacts !== undefined) {
    sets.push(`semantic_artifacts = $${idx++}`);
    values.push(input.semantic_artifacts ? JSON.stringify(input.semantic_artifacts) : null);
  }

  if (sets.length === 0) {
    return getProjectById(id);
  }

  sets.push(`updated_at = now()`);
  values.push(id);

  const res = await getDataTalkMetaPool().query(
    `
    UPDATE datatalk_meta.projects
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING id, name, description, thumbnail, created_at, updated_at, nodes, viewport, semantic_artifacts
    `,
    values
  );

  return (res.rows[0] as Project | undefined) ?? null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const res = await getDataTalkMetaPool().query(
    `
    DELETE FROM datatalk_meta.projects
    WHERE id = $1
    `,
    [id]
  );
  return (res.rowCount ?? 0) > 0;
}

type DistributedQueryCacheRow = {
  cache_key: string;
  value_json: any;
  soft_expires_at: string;
  hard_expires_at: string;
  updated_at: string;
};

let queryCacheTableEnsured = false;

async function ensureDistributedQueryCacheTable(): Promise<void> {
  if (queryCacheTableEnsured) return;
  await getDataTalkMetaPool().query(`
    CREATE TABLE IF NOT EXISTS datatalk_meta.query_result_cache (
      cache_key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL,
      soft_expires_at TIMESTAMPTZ NOT NULL,
      hard_expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await getDataTalkMetaPool().query(`
    CREATE INDEX IF NOT EXISTS idx_query_result_cache_hard_exp
    ON datatalk_meta.query_result_cache (hard_expires_at);
  `);
  queryCacheTableEnsured = true;
}

export async function getDistributedQueryCache(cacheKey: string): Promise<DistributedQueryCacheRow | null> {
  await ensureDistributedQueryCacheTable();
  const key = String(cacheKey ?? "").trim();
  if (!key) return null;
  const res = await getDataTalkMetaPool().query(
    `
    SELECT cache_key, value_json, soft_expires_at, hard_expires_at, updated_at
    FROM datatalk_meta.query_result_cache
    WHERE cache_key = $1
    `,
    [key]
  );
  return (res.rows[0] as DistributedQueryCacheRow | undefined) ?? null;
}

export async function upsertDistributedQueryCache(params: {
  cacheKey: string;
  valueJson: any;
  softExpiresAt: Date;
  hardExpiresAt: Date;
}): Promise<void> {
  await ensureDistributedQueryCacheTable();
  const key = String(params.cacheKey ?? "").trim();
  if (!key) return;
  await getDataTalkMetaPool().query(
    `
    INSERT INTO datatalk_meta.query_result_cache (cache_key, value_json, soft_expires_at, hard_expires_at, updated_at)
    VALUES ($1, $2::jsonb, $3, $4, now())
    ON CONFLICT (cache_key) DO UPDATE
    SET value_json = EXCLUDED.value_json,
        soft_expires_at = EXCLUDED.soft_expires_at,
        hard_expires_at = EXCLUDED.hard_expires_at,
        updated_at = now()
    `,
    [key, JSON.stringify(params.valueJson ?? null), params.softExpiresAt, params.hardExpiresAt]
  );
}

export async function purgeExpiredDistributedQueryCache(): Promise<number> {
  await ensureDistributedQueryCacheTable();
  const res = await getDataTalkMetaPool().query(
    `
    DELETE FROM datatalk_meta.query_result_cache
    WHERE hard_expires_at < now()
    `
  );
  return Number(res.rowCount ?? 0);
}
