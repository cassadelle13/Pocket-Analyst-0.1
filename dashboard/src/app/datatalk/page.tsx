"use client";

import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Card, Text, Title, Button, Select, SelectItem, TextInput, Badge } from "@tremor/react";
import { RequireRole } from "../../components/auth";
import { useRole } from "../../providers";

type DbType = "clickhouse" | "postgres" | "mysql" | "mssql";

type ConnectionConfig = {
  type: DbType;
  host: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
};

type AgentRole = "user" | "business" | "admin";

type QueryResponse = {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
};

type SchemaColumn = {
  database: string;
  schema?: string;
  table: string;
  name: string;
  type: string;
  nullable?: boolean;
};

type SchemaResponse = {
  database: string;
  columns: SchemaColumn[];
};

type SavedConnection = {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number | null;
  database: string | null;
  username: string | null;
  password: null;
};

const STORAGE_KEY_CONN = "datatalk_conn_v1";
const STORAGE_KEY_SQL = "datatalk_sql_v1";

function roleToAgentRole(appRole: string): AgentRole {
  if (appRole === "data-admin") return "admin";
  if (appRole === "business") return "business";
  return "user";
}

function defaultConnection(type: DbType): ConnectionConfig {
  switch (type) {
    case "clickhouse":
      return { type, host: "storage", port: 8123, database: "analytics", user: "default", password: "" };
    case "postgres":
      return { type, host: "postgres", port: 5432, database: "datatalk", user: "datatalk", password: "datatalk" };
    case "mysql":
      return { type, host: "mysql", port: 3306, database: "datatalk", user: "datatalk", password: "datatalk" };
    case "mssql":
      return { type, host: "mssql", port: 1433, database: "datatalk", user: "sa", password: "YourStrong!Passw0rd" };
    default:
      return { type, host: "localhost" };
  }
}

function normalizeSchemaColumn(raw: any, fallbackDatabase: string): SchemaColumn {
  return {
    database: String(raw?.database ?? fallbackDatabase),
    schema: raw?.schema ? String(raw.schema) : undefined,
    table: String(raw?.table ?? ""),
    name: String(raw?.name ?? ""),
    type: String(raw?.type ?? ""),
    nullable: typeof raw?.nullable === "boolean" ? raw.nullable : undefined,
  };
}

export default function DataTalkPage() {
  const { role } = useRole();

  const [dbType, setDbType] = useState<DbType>("clickhouse");
  const [connection, setConnection] = useState<ConnectionConfig>(() => defaultConnection("clickhouse"));

  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [savedConnectionsLoading, setSavedConnectionsLoading] = useState(false);
  const [savedConnectionsError, setSavedConnectionsError] = useState<string | null>(null);
  const [selectedSavedConnectionId, setSelectedSavedConnectionId] = useState<string>("");
  const [saveName, setSaveName] = useState<string>("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sql, setSql] = useState<string>(
    "SELECT count(*) AS c FROM analytics.events"
  );

  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [schemaFilter, setSchemaFilter] = useState<string>("");

  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);

  useEffect(() => {
    try {
      const rawConn = window.localStorage.getItem(STORAGE_KEY_CONN);
      if (rawConn) {
        const parsed = JSON.parse(rawConn) as ConnectionConfig;
        if (parsed?.type) {
          setDbType(parsed.type);
          setConnection(parsed);
        }
      }

      const rawSql = window.localStorage.getItem(STORAGE_KEY_SQL);
      if (rawSql) {
        setSql(rawSql);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setSavedConnectionsLoading(true);
      setSavedConnectionsError(null);
      try {
        const res = await fetch("/api/datatalk/connections", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load saved connections");
        }
        const data = Array.isArray(json?.data) ? (json.data as SavedConnection[]) : [];
        setSavedConnections(data);
      } catch (err: unknown) {
        setSavedConnections([]);
        setSavedConnectionsError(err instanceof Error ? err.message : "Failed to load saved connections");
      } finally {
        setSavedConnectionsLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_CONN, JSON.stringify(connection));
    } catch {
      // ignore
    }
  }, [connection]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_SQL, sql);
    } catch {
      // ignore
    }
  }, [sql]);

  const schemaGroups = useMemo(() => {
    const cols = schema?.columns ?? [];
    const q = schemaFilter.trim().toLowerCase();

    const filtered = q
      ? cols.filter((c) => {
          const blob = `${c.database}.${c.schema ?? ""}.${c.table}.${c.name}.${c.type}`.toLowerCase();
          return blob.includes(q);
        })
      : cols;

    const map = new Map<string, SchemaColumn[]>();

    for (const c of filtered) {
      const schemaName = c.schema ?? c.database;
      const key = `${schemaName}.${c.table}`;
      const prev = map.get(key);
      if (prev) {
        prev.push(c);
      } else {
        map.set(key, [c]);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, columns: value }));
  }, [schema, schemaFilter]);

  async function loadSchema() {
    setSchemaLoading(true);
    setSchemaError(null);

    try {
      const payload = selectedSavedConnectionId
        ? { connectionId: selectedSavedConnectionId }
        : { connection };

      const res = await fetch("/api/datatalk/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Schema request failed");
      }

      const data = json?.data as { database?: string; columns?: any[] };
      const database = String(data?.database ?? connection.database ?? "");
      const columns = Array.isArray(data?.columns) ? data.columns.map((c) => normalizeSchemaColumn(c, database)) : [];

      setSchema({ database, columns });
    } catch (err: unknown) {
      setSchema(null);
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setSchemaLoading(false);
    }
  }

  async function runQuery() {
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const payload = selectedSavedConnectionId
        ? {
            connectionId: selectedSavedConnectionId,
            sql,
            role: roleToAgentRole(role),
            maxRows: 2000,
            timeoutMs: 20000,
          }
        : {
            connection,
            sql,
            role: roleToAgentRole(role),
            maxRows: 2000,
            timeoutMs: 20000,
          };

      const res = await fetch("/api/datatalk/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Query request failed");
      }

      const data = json?.data as QueryResponse;
      setQueryResult(data);
    } catch (err: unknown) {
      setQueryError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setQueryLoading(false);
    }
  }

  function onDbTypeChange(next: DbType) {
    setDbType(next);
    const nextConn = defaultConnection(next);
    setConnection(nextConn);
    setSelectedSavedConnectionId("");

    if (next === "clickhouse") {
      setSql("SELECT count(*) AS c FROM analytics.events");
    } else {
      setSql("SELECT TOP 10 * FROM datatalk.sample_events");
      if (next === "postgres" || next === "mysql") {
        setSql("SELECT * FROM datatalk.sample_events LIMIT 10");
      }
    }

    setSchema(null);
    setQueryResult(null);
    setSchemaError(null);
    setQueryError(null);
  }

  async function refreshSavedConnections() {
    setSavedConnectionsLoading(true);
    setSavedConnectionsError(null);
    try {
      const res = await fetch("/api/datatalk/connections", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load saved connections");
      }
      const data = Array.isArray(json?.data) ? (json.data as SavedConnection[]) : [];
      setSavedConnections(data);
    } catch (err: unknown) {
      setSavedConnections([]);
      setSavedConnectionsError(err instanceof Error ? err.message : "Failed to load saved connections");
    } finally {
      setSavedConnectionsLoading(false);
    }
  }

  function applySavedConnection(id: string) {
    setSelectedSavedConnectionId(id);
    const item = savedConnections.find((c) => c.id === id);
    if (!item) return;

    setDbType(item.type);
    setConnection({
      type: item.type,
      host: item.host,
      port: item.port ?? undefined,
      database: item.database ?? undefined,
      user: item.username ?? undefined,
      password: undefined,
    });

    setSchema(null);
    setQueryResult(null);
    setSchemaError(null);
    setQueryError(null);
  }

  async function saveCurrentConnection() {
    setSaveLoading(true);
    setSaveError(null);

    try {
      const payload = {
        name: saveName.trim() || `Connection ${new Date().toISOString()}`,
        type: connection.type,
        host: connection.host,
        port: connection.port ?? null,
        database: connection.database ?? null,
        username: connection.user ?? null,
        password: connection.password ?? null,
      };

      const res = await fetch("/api/datatalk/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to save connection");
      }

      const created = json?.data as SavedConnection;
      await refreshSavedConnections();
      setSelectedSavedConnectionId(created.id);
      setSaveName("");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save connection");
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
      <div className="bg-slate-950 min-h-screen">
      <div className="px-8 py-8 space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-white">DataTalk SQL Console</h1>
            <p className="text-slate-300 mt-2">
              Control-plane UI → <span className="font-mono">/api/datatalk/*</span> → on-prem agent.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge color="lime">role: {role}</Badge>
            <Badge color="blue">agent: {roleToAgentRole(role)}</Badge>
          </div>
        </div>

        <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Saved connection</Text>
                <Select
                  value={selectedSavedConnectionId}
                  onValueChange={(v) => applySavedConnection(String(v))}
                  disabled={savedConnectionsLoading}
                >
                  <SelectItem value="">(manual)</SelectItem>
                  {savedConnections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Save as</Text>
                <TextInput
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Connection name"
                />
              </div>

              <div className="md:col-span-2 flex items-end gap-3">
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={savedConnectionsLoading}
                  onClick={refreshSavedConnections}
                >
                  {savedConnectionsLoading ? "Refreshing..." : "Refresh"}
                </Button>

                <Button
                  className="w-full"
                  disabled={saveLoading}
                  onClick={saveCurrentConnection}
                >
                  {saveLoading ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {(savedConnectionsError || saveError) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {savedConnectionsError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                    <Text className="text-red-300">Connections error</Text>
                    <Text className="text-slate-200 mt-2 font-mono text-xs whitespace-pre-wrap">{savedConnectionsError}</Text>
                  </div>
                )}
                {saveError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                    <Text className="text-red-300">Save error</Text>
                    <Text className="text-slate-200 mt-2 font-mono text-xs whitespace-pre-wrap">{saveError}</Text>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-1">
                <Text className="text-slate-300 mb-2">DB</Text>
                <Select value={dbType} onValueChange={(v) => onDbTypeChange(v as DbType)}>
                  <SelectItem value="clickhouse">ClickHouse</SelectItem>
                  <SelectItem value="postgres">Postgres</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mssql">MSSQL</SelectItem>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Host</Text>
                <TextInput
                  value={connection.host}
                  onChange={(e) => setConnection((c) => ({ ...c, host: e.target.value }))}
                  placeholder="storage / postgres / mysql / mssql"
                />
              </div>

              <div className="md:col-span-1">
                <Text className="text-slate-300 mb-2">Port</Text>
                <TextInput
                  value={String(connection.port ?? "")}
                  onChange={(e) =>
                    setConnection((c) => ({
                      ...c,
                      port: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  placeholder="8123"
                />
              </div>

              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Database</Text>
                <TextInput
                  value={connection.database ?? ""}
                  onChange={(e) => setConnection((c) => ({ ...c, database: e.target.value || undefined }))}
                  placeholder="analytics / datatalk"
                />
              </div>

              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">User</Text>
                <TextInput
                  value={connection.user ?? ""}
                  onChange={(e) => setConnection((c) => ({ ...c, user: e.target.value || undefined }))}
                  placeholder="default / datatalk / sa"
                />
              </div>

              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Password</Text>
                <TextInput
                  value={connection.password ?? ""}
                  onChange={(e) => setConnection((c) => ({ ...c, password: e.target.value || undefined }))}
                  placeholder="(empty)"
                  type="password"
                />
              </div>

              <div className="md:col-span-2 flex items-end gap-3">
                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={schemaLoading}
                  onClick={loadSchema}
                >
                  {schemaLoading ? "Loading schema..." : "Load schema"}
                </Button>

                <Button
                  className="w-full"
                  disabled={queryLoading}
                  onClick={runQuery}
                >
                  {queryLoading ? "Running..." : "Run"}
                </Button>
              </div>
            </div>

            {(schemaError || queryError) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {schemaError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                    <Text className="text-red-300">Schema error</Text>
                    <Text className="text-slate-200 mt-2 font-mono text-xs whitespace-pre-wrap">{schemaError}</Text>
                  </div>
                )}
                {queryError && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                    <Text className="text-red-300">Query error</Text>
                    <Text className="text-slate-200 mt-2 font-mono text-xs whitespace-pre-wrap">{queryError}</Text>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl xl:col-span-1">
            <div className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Title className="text-white">Schema</Title>
                <Badge color="slate">{schema?.columns.length ?? 0}</Badge>
              </div>

              <TextInput
                value={schemaFilter}
                onChange={(e) => setSchemaFilter(e.target.value)}
                placeholder="Filter: table / column / type"
              />

              <div className="mt-4 space-y-3 max-h-[520px] overflow-auto pr-1">
                {!schema && (
                  <Text className="text-slate-400 text-sm">Load schema to browse tables.</Text>
                )}

                {schemaGroups.map((g) => (
                  <div key={g.key} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/10">
                      <Text className="text-slate-200 font-mono text-xs">{g.key}</Text>
                    </div>
                    <div className="p-3 space-y-1">
                      {g.columns.map((c, i) => (
                        <div key={`${c.table}.${c.name}.${i}`} className="flex items-center justify-between gap-3">
                          <Text className="text-slate-200 font-mono text-xs">{c.name}</Text>
                          <Text className="text-slate-400 font-mono text-[11px]">{c.type}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl xl:col-span-2">
            <div className="p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <Title className="text-white">SQL</Title>
                {queryResult && <Badge color="emerald">rows: {queryResult.rowCount}</Badge>}
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/10">
                <Editor
                  height="260px"
                  language="sql"
                  value={sql}
                  onChange={(v: string | undefined) => setSql(v ?? "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>

              <div className="mt-4">
                <Title className="text-white">Result</Title>

                {!queryResult && (
                  <Text className="text-slate-400 text-sm mt-2">Run a query to see results.</Text>
                )}

                {queryResult && (
                  <div className="mt-3 overflow-auto rounded-2xl border border-white/10 bg-black/20">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-900/80 backdrop-blur">
                        <tr>
                          {queryResult.columns.map((c) => (
                            <th key={c} className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-2 text-slate-200 border-b border-white/5 align-top">
                                <span className="font-mono whitespace-pre-wrap break-words">
                                  {cell === null || cell === undefined ? "null" : String(cell)}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
          <div className="p-6">
            <Title className="text-white">Notes</Title>
            <Text className="text-slate-300 mt-2">
              Если ты запускаешь dashboard вне docker-compose, меняй host на <span className="font-mono">localhost</span> и
              используй опубликованные порты (ClickHouse 8123, Postgres 15432, MySQL 13306, MSSQL 11433).
            </Text>
          </div>
        </Card>
      </div>
      </div>
    </RequireRole>
  );
}
