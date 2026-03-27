"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {ChevronDown, ChevronRight, Database, FileText, Folder, Link2, Plus, Search, X} from "lucide-react";
import { useDemoMode } from "../../context/DemoContext";
import { useRole } from "../../providers";

type SchemaColumn = {
  database: string;
  schema?: string | null;
  table: string;
  name: string;
  type?: string;
  nullable?: boolean;
};

type DemoNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  children?: DemoNode[];
  meta?: {
    size?: string;
    modified?: string;
    format?: string;
    preview?: string;
  };
};

export function DbExplorerModal({
  isOpen,
  onClose,
  connectionId,
  connectionName,
  connectionType,
  targetChartId,
}: {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  connectionName?: string;
  connectionType?: string;
  targetChartId?: string | null;
}) {
  const { isDemoMode } = useDemoMode();
  const demoMode = isDemoMode;
  const { role } = useRole();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const [dataPreviewLoading, setDataPreviewLoading] = useState(false);
  const [dataPreviewError, setDataPreviewError] = useState<string | null>(null);
  const [dataPreview, setDataPreview] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [expandedDemo, setExpandedDemo] = useState<Record<string, boolean>>({
    "demo:/": true,
    "demo:/Warehouse": true,
    "demo:/Warehouse/Customers": true,
    "demo:/Warehouse/Sales": true,
    "demo:/Staging": true,
  });

  useEffect(() => {
    if (!isOpen) return;
    let aborted = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/datatalk/schema", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({connectionId}),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load schema");
        }

        const payload = json?.data ?? {};
        const database = String(payload?.database ?? "");
        const rawCols = Array.isArray(payload?.columns) ? payload.columns : [];

        const normalized: SchemaColumn[] = rawCols
          .map((c: any) => ({
            database: String(c?.database ?? database ?? ""),
            schema: c?.schema != null ? String(c.schema) : null,
            table: String(c?.table ?? ""),
            name: String(c?.name ?? ""),
            type: c?.type != null ? String(c.type) : undefined,
            nullable: typeof c?.nullable === "boolean" ? c.nullable : undefined,
          }))
          .filter((c: SchemaColumn) => c.table && c.name);

        if (!aborted) {
          setColumns(normalized);
          setSelectedTableKey((prev) => {
            if (prev && normalized.some((c) => {
              const schemaName = c.schema ?? c.database;
              return `${schemaName}.${c.table}` === prev;
            })) {
              return prev;
            }
            const first = normalized[0];
            if (!first) return null;
            const schemaName = first.schema ?? first.database;
            return `${schemaName}.${first.table}`;
          });
        }
      } catch (e: any) {
        if (!aborted) {
          setError(e instanceof Error ? e.message : "Failed to load schema");
          setColumns([]);
          setSelectedTableKey(null);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    load();

    return () => {
      aborted = true;
    };
  }, [connectionId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const filteredColumns = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((c) => {
      const blob = `${c.database}.${c.schema ?? ""}.${c.table}.${c.name}.${c.type ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [columns, filter]);

  const tables = useMemo(() => {
    const map = new Map<string, SchemaColumn[]>();
    for (const c of filteredColumns) {
      const schemaName = c.schema ?? c.database;
      const key = `${schemaName}.${c.table}`;
      const prev = map.get(key);
      if (prev) prev.push(c);
      else map.set(key, [c]);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, cols]) => ({
        key,
        columns: cols.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [filteredColumns]);

  const demoTree = useMemo<DemoNode[]>(() => {
    if (!demoMode) return [];

    return [
      {
        id: "demo:/",
        name: "DB Files",
        kind: "folder",
        children: [
          {
            id: "demo:/Warehouse",
            name: "Warehouse",
            kind: "folder",
            children: [
              {
                id: "demo:/Warehouse/Customers",
                name: "Customers",
                kind: "folder",
                children: [
                  {
                    id: "demo:/Warehouse/Customers/customers.parquet",
                    name: "customers.parquet",
                    kind: "file",
                    meta: {
                      size: "42.8 MB",
                      modified: "2026-02-08 13:04",
                      format: "Parquet",
                      preview: "customer_id, email, country, created_at",
                    },
                  },
                  {
                    id: "demo:/Warehouse/Customers/customer_events.delta",
                    name: "customer_events.delta",
                    kind: "file",
                    meta: {
                      size: "188.1 MB",
                      modified: "2026-02-09 09:21",
                      format: "Delta",
                      preview: "event_time, customer_id, event_name, channel",
                    },
                  },
                ],
              },
              {
                id: "demo:/Warehouse/Sales",
                name: "Sales",
                kind: "folder",
                children: [
                  {
                    id: "demo:/Warehouse/Sales/orders_2026_02.csv",
                    name: "orders_2026_02.csv",
                    kind: "file",
                    meta: {
                      size: "9.6 MB",
                      modified: "2026-02-10 01:12",
                      format: "CSV",
                      preview: "order_id, created_at, amount, currency",
                    },
                  },
                  {
                    id: "demo:/Warehouse/Sales/refunds.jsonl",
                    name: "refunds.jsonl",
                    kind: "file",
                    meta: {
                      size: "1.1 MB",
                      modified: "2026-02-07 20:40",
                      format: "JSONL",
                      preview: "refund_id, order_id, reason, created_at",
                    },
                  },
                ],
              },
            ],
          },
          {
            id: "demo:/Staging",
            name: "Staging",
            kind: "folder",
            children: [
              {
                id: "demo:/Staging/raw_ingest.sqlite",
                name: "raw_ingest.sqlite",
                kind: "file",
                meta: {
                  size: "12.3 MB",
                  modified: "2026-02-10 04:18",
                  format: "SQLite",
                  preview: "events_raw, sessions_raw",
                },
              },
              {
                id: "demo:/Staging/_tmp",
                name: "_tmp",
                kind: "folder",
                children: [
                  {
                    id: "demo:/Staging/_tmp/job_9817.log",
                    name: "job_9817.log",
                    kind: "file",
                    meta: {
                      size: "84 KB",
                      modified: "2026-02-10 04:15",
                      format: "Text",
                      preview: "[INFO] ingest started...",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }, [demoMode]);

  const filteredDemoTree = useMemo(() => {
    if (!demoMode) return [] as DemoNode[];

    const q = filter.trim().toLowerCase();
    if (!q) return demoTree;

    const keepTree = (nodes: DemoNode[]): DemoNode[] => {
      const out: DemoNode[] = [];
      for (const n of nodes) {
        const matchesSelf = n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
        const children = n.children ? keepTree(n.children) : [];
        if (matchesSelf || children.length > 0) {
          out.push({
            ...n,
            ...(n.children ? {children} : null),
          } as DemoNode);
        }
      }
      return out;
    };

    return keepTree(demoTree);
  }, [demoMode, demoTree, filter]);

  const demoIndex = useMemo(() => {
    if (!demoMode) return new Map<string, DemoNode>();
    const map = new Map<string, DemoNode>();
    const walk = (nodes: DemoNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children) walk(n.children);
      }
    };
    walk(demoTree);
    return map;
  }, [demoMode, demoTree]);

  const selected = useMemo(() => {
    if (!selectedTableKey) return null;
    return tables.find((t) => t.key === selectedTableKey) ?? null;
  }, [selectedTableKey, tables]);

  const selectedDemo = useMemo(() => {
    if (!demoMode || !selectedDemoId) return null;
    return demoIndex.get(selectedDemoId) ?? null;
  }, [demoIndex, demoMode, selectedDemoId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!selected?.key) {
      setDataPreview(null);
      setDataPreviewError(null);
      setDataPreviewLoading(false);
      return;
    }

    let aborted = false;

    const roleToAgentRole = (appRole: string): "user" | "business" | "admin" => {
      if (appRole === "data-admin") return "admin";
      if (appRole === "business") return "business";
      return "user";
    };

    const buildSql = (tableKey: string) => {
      const t = String(connectionType ?? "").toLowerCase();
      if (t.includes("mssql") || t.includes("sqlserver")) {
        return `SELECT TOP 50 * FROM ${tableKey}`;
      }
      return `SELECT * FROM ${tableKey} LIMIT 50`;
    };

    const loadPreview = async () => {
      setDataPreviewLoading(true);
      setDataPreviewError(null);

      try {
        const sql = buildSql(selected.key);

        const res = await fetch("/api/datatalk/query", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            connectionId,
            sql,
            role: roleToAgentRole(role),
            maxRows: 50,
            timeoutMs: 10000,
          }),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load preview data");
        }

        const payload = json?.data ?? {};
        const cols = Array.isArray(payload?.columns) ? payload.columns.map((c: any) => String(c)) : [];
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];

        if (!aborted) {
          setDataPreview({columns: cols, rows});
        }
      } catch (e: any) {
        if (!aborted) {
          setDataPreview(null);
          setDataPreviewError(e instanceof Error ? e.message : "Failed to load preview data");
        }
      } finally {
        if (!aborted) setDataPreviewLoading(false);
      }
    };

    loadPreview();

    return () => {
      aborted = true;
    };
  }, [connectionId, connectionType, isOpen, role, selected?.key]);

  const selectedCanAddTableWidget = !!selected;
  const selectedCanAddToDashboard = !!selected;
  const selectedCanAddDataSource = !!selected || (!!selectedDemo && selectedDemo.kind === "file");
  const selectedCanConnectToChart = !!targetChartId && selectedCanAddDataSource;
  const connectToChartPulse = !!targetChartId;

  useEffect(() => {
    setAddMenuOpen(false);
  }, [selectedDemoId, selectedTableKey]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addMenuRef.current?.contains(target)) return;
      if (addButtonRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [addMenuOpen]);

  const addAsTableWidget = () => {
    if (!selected) return;
    const chart = {
      name: `Table: ${selected.key}`,
      description: `DB table ${selected.key}`,
      kind: "db-table",
      connectionId,
      tableKey: selected.key,
      connectionType,
    };
    try {
      window.dispatchEvent(new CustomEvent("dashboard:add-chart", {detail: {chart}}));
    } catch {}
    setAddMenuOpen(false);
    onClose();
  };

  const addAsDataSource = () => {
    if (!selectedCanAddDataSource) return;
    const key = "dashboard:dataSources";

    const entry = selected
      ? {
          id: `ds-${Date.now()}`,
          kind: "table",
          label: selected.key,
          connectionId,
          tableKey: selected.key,
          createdAt: new Date().toISOString(),
        }
      : {
          id: `ds-${Date.now()}`,
          kind: "demo-file",
          label: selectedDemo?.name ?? "Demo file",
          connectionId,
          demoId: selectedDemo?.id ?? "",
          format: selectedDemo?.meta?.format ?? "",
          createdAt: new Date().toISOString(),
        };

    try {
      const raw = window.localStorage.getItem(key);
      const prev = raw ? (JSON.parse(raw) as any[]) : [];
      const next = Array.isArray(prev) ? prev : [];
      next.unshift(entry);
      window.localStorage.setItem(key, JSON.stringify(next.slice(0, 200)));
    } catch {}

    setAddMenuOpen(false);
  };

  const connectToChart = () => {
    if (!selectedCanConnectToChart) return;

    const tableTitle = selected ? String(selected.key ?? "").trim() : "";

    const dataSource = selected
      ? {
          kind: "table",
          label: selected.key,
          connectionId,
          tableKey: selected.key,
          connectionType,
          columnsMeta: selected.columns.map((c) => ({
            name: c.name,
            type: c.type ?? "",
            nullable: c.nullable,
          })),
        }
      : {
          kind: "demo-file",
          label: selectedDemo?.name ?? "Demo file",
          connectionId,
          demoId: selectedDemo?.id ?? "",
          format: selectedDemo?.meta?.format ?? "",
          connectionType,
        };

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:connect-to-chart", {
          detail: {
            chartId: targetChartId,
            dataSource,
          },
        })
      );

      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: targetChartId,
            patch: {
              ...(tableTitle ? { name: tableTitle, title: tableTitle } : {}),
              __showColumnMapping: true,
            },
          },
        })
      );
    } catch {}

    setAddMenuOpen(false);
    onClose();
  };

  const addToDashboard = () => {
    if (!selected) return;
    const chart = {
      name: selected.key,
      description: `DB table ${selected.key}`,
      kind: "db-table",
      connectionId,
      tableKey: selected.key,
      connectionType,
      columnsMeta: selected.columns.map((c) => ({
        name: c.name,
        type: c.type ?? "",
        nullable: c.nullable,
      })),
    };
    try {
      window.dispatchEvent(new CustomEvent("dashboard:add-chart", {detail: {chart}}));
    } catch {}
    setAddMenuOpen(false);
    onClose();
  };

  useEffect(() => {
    if (demoMode) return;
    setSelectedDemoId(null);
  }, [demoMode]);

  useEffect(() => {
    if (!demoMode) return;
    if (selectedDemoId) return;
    const first = demoTree[0];
    if (!first) return;
    const firstChild = first.children?.[0] ?? null;
    if (firstChild) setSelectedDemoId(firstChild.id);
  }, [demoMode, demoTree, selectedDemoId]);

  useEffect(() => {
    if (!demoMode) return;
    if (!isOpen) return;
    if (filter.trim() !== "") return;
    if (!selectedDemoId) return;
    if (demoIndex.has(selectedDemoId)) return;
    setSelectedDemoId(null);
  }, [demoIndex, demoMode, filter, isOpen, selectedDemoId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />

      <div className="absolute left-1/2 top-1/2 w-[min(1100px,calc(100vw-32px))] h-[min(720px,calc(100vh-32px))] -translate-x-1/2 -translate-y-1/2">
        <div className="h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/60 rounded-3xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="w-4 h-4 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">DB Explorer</div>
                <div className="text-xs text-slate-400 truncate">
                  {connectionName ? connectionName : connectionId}
                </div>
              </div>
            </div>
            {targetChartId && (
              <div className="text-[11px] text-slate-400 truncate">Chart: {targetChartId}</div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search tables / columns..."
                className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-12">
            <div className="col-span-5 border-r border-white/10 overflow-y-auto custom-scrollbar">
              {loading && <div className="p-5 text-sm text-slate-400">Loading...</div>}
              {!loading && error && <div className="p-5 text-sm text-rose-300">{error}</div>}

              {!loading && !error && demoMode && (
                <div className="p-2">
                  <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
                    Demo files
                  </div>

                  {filteredDemoTree.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-slate-400">No demo objects found</div>
                  ) : (
                    <div className="space-y-1">
                      {(() => {
                        const renderNode = (node: DemoNode, depth: number) => {
                          const isFolder = node.kind === "folder";
                          const expanded = !!expandedDemo[node.id];
                          const hasChildren = (node.children?.length ?? 0) > 0;
                          const active = node.id === selectedDemoId;

                          return (
                            <div key={node.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDemoId(node.id);
                                  setSelectedTableKey(null);
                                  if (isFolder && hasChildren) {
                                    setExpandedDemo((prev) => ({...prev, [node.id]: !prev[node.id]}));
                                  }
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded-xl border transition-colors flex items-center gap-2 ${
                                  active
                                    ? "bg-white/10 border-white/20"
                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                }`}
                                style={{paddingLeft: 8 + depth * 14}}
                              >
                                {isFolder ? (
                                  <span className="text-slate-400">
                                    {hasChildren ? (
                                      expanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )
                                    ) : (
                                      <span className="inline-block w-4" />
                                    )}
                                  </span>
                                ) : (
                                  <span className="inline-block w-4" />
                                )}
                                {isFolder ? (
                                  <Folder className="w-4 h-4 text-cyan-300" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-300" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate">{node.name}</div>
                                  {node.kind === "file" && (
                                    <div className="text-[11px] text-slate-400 truncate">
                                      {node.meta?.format ?? ""}{node.meta?.size ? ` · ${node.meta.size}` : ""}
                                    </div>
                                  )}
                                </div>
                              </button>

                              {isFolder && hasChildren && expanded && (
                                <div className="mt-1 space-y-1">
                                  {node.children!.map((c) => renderNode(c, depth + 1))}
                                </div>
                              )}
                            </div>
                          );
                        };

                        return filteredDemoTree.map((n) => renderNode(n, 0));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {!loading && !error && (
                <div className="p-2">
                  <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">
                    Schema
                  </div>

                  {tables.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-slate-400">No objects found</div>
                  ) : (
                    <div>
                      {tables.map((t) => {
                        const active = t.key === selectedTableKey;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => {
                              setSelectedTableKey(t.key);
                              setSelectedDemoId(null);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl border transition-colors mb-1 ${
                              active
                                ? "bg-white/10 border-white/20"
                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                            }`}
                          >
                            <div className="text-xs font-semibold text-white truncate">{t.key}</div>
                            <div className="text-[11px] text-slate-400">{t.columns.length} columns</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="col-span-7 overflow-y-auto custom-scrollbar">
              {!selected && !selectedDemo && !loading && !error && (
                <div className="p-5 text-sm text-slate-400">Select an object to preview</div>
              )}

              {selectedDemo && (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{selectedDemo.name}</div>
                      <div className="mt-1 text-xs text-slate-400 truncate">{selectedDemo.id}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {targetChartId && (
                        <button
                          type="button"
                          onClick={connectToChart}
                          disabled={!selectedCanConnectToChart}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            connectToChartPulse
                              ? "border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200 animate-[pulse_3.2s_ease-in-out_infinite]"
                              : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-200"
                          }`}
                          title="Connect to chart"
                        >
                          <Link2 className="w-4 h-4" />
                          <span className="text-xs font-semibold">Connect to chart</span>
                        </button>
                      )}

                      <div className="relative">
                        <button
                          ref={addButtonRef}
                          type="button"
                          onClick={() => setAddMenuOpen((v) => !v)}
                          disabled={!selectedCanAddTableWidget && !selectedCanAddDataSource && !selectedCanAddToDashboard}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Add"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-xs font-semibold">Add</span>
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        </button>

                        {addMenuOpen && (
                          <div
                            ref={addMenuRef}
                            className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={connectToChart}
                              disabled={!selectedCanConnectToChart}
                              className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${
                                connectToChartPulse
                                  ? "text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15 animate-[pulse_3.2s_ease-in-out_infinite]"
                                  : "text-slate-200"
                              }`}
                            >
                              Connect to chart
                            </button>
                            <button
                              type="button"
                              onClick={addAsTableWidget}
                              disabled={!selectedCanAddTableWidget}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add as table widget
                            </button>
                            <button
                              type="button"
                              onClick={addAsDataSource}
                              disabled={!selectedCanAddDataSource}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add as data source
                            </button>
                            <button
                              type="button"
                              onClick={addToDashboard}
                              disabled={!selectedCanAddToDashboard}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add to dashboard
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      Preview
                    </div>
                    <div className="p-4 text-sm text-slate-200">
                      {selectedDemo.kind === "folder" ? (
                        <div className="text-slate-300">
                          Folder
                          <div className="mt-2 text-xs text-slate-400">
                            {(selectedDemo.children?.length ?? 0) === 0
                              ? "Empty"
                              : `${selectedDemo.children!.length} items`}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 text-xs">
                            <div className="col-span-4 text-slate-400">Format</div>
                            <div className="col-span-8 text-slate-200">{selectedDemo.meta?.format ?? ""}</div>
                            <div className="col-span-4 text-slate-400">Size</div>
                            <div className="col-span-8 text-slate-200">{selectedDemo.meta?.size ?? ""}</div>
                            <div className="col-span-4 text-slate-400">Modified</div>
                            <div className="col-span-8 text-slate-200">{selectedDemo.meta?.modified ?? ""}</div>
                          </div>
                          {selectedDemo.meta?.preview && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                              <div className="text-[11px] uppercase tracking-wider text-slate-400">Fields</div>
                              <div className="mt-1 font-mono text-xs text-slate-200">{selectedDemo.meta.preview}</div>
                            </div>
                          )}

                          {selectedDemo.meta?.preview && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                              <div className="px-3 py-2 border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                                Data preview
                              </div>
                              {(() => {
                                const fields = selectedDemo.meta!.preview
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                                  .slice(0, 8);
                                const rows = Array.from({length: 8}).map((_, i) =>
                                  fields.map((f) => `${f}_${i + 1}`)
                                );
                                return (
                                  <div className="overflow-auto">
                                    <table className="min-w-full text-xs">
                                      <thead className="bg-white/5">
                                        <tr>
                                          {fields.map((c) => (
                                            <th key={c} className="px-3 py-2 text-left font-semibold text-slate-300 whitespace-nowrap">
                                              {c}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/10">
                                        {rows.map((row, idx) => (
                                          <tr key={idx} className={idx % 2 === 0 ? "bg-white/[0.02]" : ""}>
                                            {row.map((v, j) => (
                                              <td key={j} className="px-3 py-2 text-slate-200 whitespace-nowrap">
                                                {v}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selected && (
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{selected.key}</div>
                      <div className="mt-1 text-xs text-slate-400">{selected.columns.length} columns</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {targetChartId && (
                        <button
                          type="button"
                          onClick={connectToChart}
                          disabled={!selectedCanConnectToChart}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            connectToChartPulse
                              ? "border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200 animate-[pulse_3.2s_ease-in-out_infinite]"
                              : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-200"
                          }`}
                          title="Connect to chart"
                        >
                          <Link2 className="w-4 h-4" />
                          <span className="text-xs font-semibold">Connect to chart</span>
                        </button>
                      )}

                      <div className="relative">
                        <button
                          ref={addButtonRef}
                          type="button"
                          onClick={() => setAddMenuOpen((v) => !v)}
                          disabled={!selectedCanAddTableWidget && !selectedCanAddDataSource && !selectedCanAddToDashboard}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Add"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-xs font-semibold">Add</span>
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        </button>

                        {addMenuOpen && (
                          <div
                            ref={addMenuRef}
                            className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={connectToChart}
                              disabled={!selectedCanConnectToChart}
                              className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed ${
                                connectToChartPulse
                                  ? "text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15 animate-[pulse_3.2s_ease-in-out_infinite]"
                                  : "text-slate-200"
                              }`}
                            >
                              Connect to chart
                            </button>
                            <button
                              type="button"
                              onClick={addAsTableWidget}
                              disabled={!selectedCanAddTableWidget}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add as table widget
                            </button>
                            <button
                              type="button"
                              onClick={addAsDataSource}
                              disabled={!selectedCanAddDataSource}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add as data source
                            </button>
                            <button
                              type="button"
                              onClick={addToDashboard}
                              disabled={!selectedCanAddToDashboard}
                              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add to dashboard
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      Data preview
                    </div>
                    <div className="p-4">
                      {dataPreviewLoading && <div className="text-sm text-slate-400">Loading...</div>}
                      {!dataPreviewLoading && dataPreviewError && (
                        <div className="text-sm text-rose-300">{dataPreviewError}</div>
                      )}
                      {!dataPreviewLoading && !dataPreviewError && dataPreview && dataPreview.columns.length > 0 && (
                        <div className="rounded-xl border border-white/10 overflow-auto">
                          <table className="min-w-full text-xs">
                            <thead className="bg-white/5">
                              <tr>
                                {dataPreview.columns.slice(0, 12).map((c) => (
                                  <th key={c} className="px-3 py-2 text-left font-semibold text-slate-300 whitespace-nowrap">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {dataPreview.rows.slice(0, 12).map((row, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? "bg-white/[0.02]" : ""}>
                                  {dataPreview.columns.slice(0, 12).map((_, cIdx) => (
                                    <td key={cIdx} className="px-3 py-2 text-slate-200 whitespace-nowrap">
                                      {row?.[cIdx] == null ? "" : String(row[cIdx])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {!dataPreviewLoading && !dataPreviewError && (!dataPreview || dataPreview.columns.length === 0) && (
                        <div className="text-sm text-slate-400">No rows</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                    <div className="grid grid-cols-12 px-4 py-2 border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <div className="col-span-6">Column</div>
                      <div className="col-span-4">Type</div>
                      <div className="col-span-2 text-right">Null</div>
                    </div>
                    <div className="divide-y divide-white/10">
                      {selected.columns.map((c) => (
                        <div key={`${c.table}.${c.name}`} className="grid grid-cols-12 px-4 py-2 text-xs">
                          <div className="col-span-6 text-slate-200 truncate">{c.name}</div>
                          <div className="col-span-4 text-slate-400 truncate">{c.type ?? ""}</div>
                          <div className="col-span-2 text-right text-slate-400">
                            {c.nullable === undefined ? "" : c.nullable ? "YES" : "NO"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
