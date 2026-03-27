DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'datatalk') THEN
    CREATE ROLE datatalk LOGIN PASSWORD 'datatalk';
  END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER %I', 'datatalk', 'datatalk')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'datatalk');
\gexec

\connect datatalk

CREATE SCHEMA IF NOT EXISTS datatalk AUTHORIZATION datatalk;

CREATE TABLE IF NOT EXISTS datatalk.sample_events (
  id SERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE datatalk.sample_events OWNER TO datatalk;
GRANT USAGE ON SCHEMA datatalk TO datatalk;
GRANT SELECT ON datatalk.sample_events TO datatalk;

INSERT INTO datatalk.sample_events (event_name)
SELECT 'hello-postgres'
WHERE NOT EXISTS (
  SELECT 1 FROM datatalk.sample_events WHERE event_name = 'hello-postgres'
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS datatalk_meta AUTHORIZATION datatalk;

CREATE TABLE IF NOT EXISTS datatalk_meta.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('clickhouse','postgres','mysql','mssql','csv')),
  host TEXT NOT NULL,
  port INT,
  database TEXT,
  username TEXT,
  password TEXT,
  password_enc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE datatalk_meta.connections DROP CONSTRAINT IF EXISTS connections_type_check;
ALTER TABLE datatalk_meta.connections
  ADD CONSTRAINT connections_type_check
  CHECK (type IN ('clickhouse','postgres','mysql','mssql','csv'));

ALTER TABLE datatalk_meta.connections ADD COLUMN IF NOT EXISTS password_enc TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS connections_name_unique ON datatalk_meta.connections (name);

ALTER TABLE datatalk_meta.connections OWNER TO datatalk;
GRANT USAGE ON SCHEMA datatalk_meta TO datatalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON datatalk_meta.connections TO datatalk;

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'Local ClickHouse', 'clickhouse', 'storage', 8123, 'analytics', 'default', ''
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'Local ClickHouse');

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'Local Postgres', 'postgres', 'postgres', 5432, 'datatalk', 'datatalk', 'datatalk'
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'Local Postgres');

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'MusGen 2', 'postgres', 'postgres', 5432, 'musgen_2', 'postgres', 'postgres'
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'MusGen 2');

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'Online_retail', 'csv', 'storage', 8123, 'analytics', 'default', ''
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'Online_retail');

UPDATE datatalk_meta.connections
SET type = 'csv',
    host = COALESCE(NULLIF(host, ''), 'storage'),
    port = COALESCE(port, 8123),
    database = COALESCE(NULLIF(database, ''), 'analytics'),
    username = COALESCE(NULLIF(username, ''), 'default'),
    updated_at = now()
WHERE name = 'Online_retail' AND type <> 'csv';

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'Local MySQL', 'mysql', 'mysql', 3306, 'datatalk', 'datatalk', 'datatalk'
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'Local MySQL');

INSERT INTO datatalk_meta.connections (name, type, host, port, database, username, password)
SELECT 'Local MSSQL', 'mssql', 'mssql', 1433, 'datatalk', 'sa', 'YourStrong!Passw0rd'
WHERE NOT EXISTS (SELECT 1 FROM datatalk_meta.connections WHERE name = 'Local MSSQL');

CREATE TABLE IF NOT EXISTS datatalk_meta.query_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  connection_id UUID NULL REFERENCES datatalk_meta.connections(id) ON DELETE SET NULL,
  connection_name TEXT NULL,
  db_type TEXT NULL,
  role TEXT NULL,
  sql_preview TEXT NULL,
  sql_sha256 TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','error')),
  duration_ms INT NULL,
  row_count INT NULL,
  error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS query_audit_created_at_idx ON datatalk_meta.query_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS query_audit_connection_idx ON datatalk_meta.query_audit (connection_id, created_at DESC);

ALTER TABLE datatalk_meta.query_audit OWNER TO datatalk;
GRANT SELECT, INSERT ON datatalk_meta.query_audit TO datatalk;

CREATE TABLE IF NOT EXISTS datatalk_meta.semantic_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  model_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_models_name_unique ON datatalk_meta.semantic_models (name);

ALTER TABLE datatalk_meta.semantic_models OWNER TO datatalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON datatalk_meta.semantic_models TO datatalk;

CREATE TABLE IF NOT EXISTS datatalk_meta.semantic_model_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project','dashboard')),
  scope_id TEXT NOT NULL,
  semantic_model_id UUID NOT NULL REFERENCES datatalk_meta.semantic_models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id)
);

ALTER TABLE datatalk_meta.semantic_model_bindings OWNER TO datatalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON datatalk_meta.semantic_model_bindings TO datatalk;

CREATE TABLE IF NOT EXISTS datatalk_meta.semantic_model_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_model_id UUID NOT NULL REFERENCES datatalk_meta.semantic_models(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project','dashboard')),
  scope_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES datatalk_meta.connections(id) ON DELETE CASCADE,
  table_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semantic_model_id, scope_type, scope_id, model_name)
);

CREATE INDEX IF NOT EXISTS semantic_model_sources_scope_idx ON datatalk_meta.semantic_model_sources (scope_type, scope_id);

ALTER TABLE datatalk_meta.semantic_model_sources OWNER TO datatalk;
GRANT SELECT, INSERT, UPDATE, DELETE ON datatalk_meta.semantic_model_sources TO datatalk;
