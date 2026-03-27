"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Plus, Search, Loader2, Link2 } from "lucide-react";
import { createPortal } from "react-dom";
import { DatabaseConnectionStatus } from "../home/DatabaseConnectionStatus";
import { DatabaseConnectionModal } from "../connection/DatabaseConnectionModal";
import { useConnectionState, useRole } from "../../providers";

type ConnectionVariant = "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";

type SchemaColumn = {
  database: string;
  schema?: string | null;
  table: string;
  name: string;
  type?: string;
  nullable?: boolean;
};

interface DbSlideInPanelProps {
  onClose: () => void;
  targetChartId?: string | null;
}

export function DbSlideInPanel({onClose, targetChartId = null}: DbSlideInPanelProps) {
  const { activeConnection, setActiveConnection } = useConnectionState();
  const { role } = useRole();
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const raw = String(window.localStorage.getItem("dashboard:dbPanelWidth") ?? "").trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 260 && n <= 720) return n;
    } catch {}
    return 420;
  });
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(420);
  const [connectionModal, setConnectionModal] = useState<{
    open: boolean;
    variant: ConnectionVariant;
  }>({open: false, variant: "primary"});

  const [search, setSearch] = useState("");

  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [columns, setColumns] = useState<SchemaColumn[]>([]);

  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [hoveredPreviewTable, setHoveredPreviewTable] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const [previewError, setPreviewError] = useState<Record<string, string | null>>({});
  const [previewData, setPreviewData] = useState<Record<string, {columns: string[]; rows: unknown[][]} | null>>({});

  const [connectedTableKeys, setConnectedTableKeys] = useState<Record<string, boolean>>({});
  const [connectedCount, setConnectedCount] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem("dashboard:dbPanelWidth", String(panelWidth));
    } catch {}
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = (e.clientX ?? 0) - (startXRef.current ?? 0);
      const next = Math.max(260, Math.min(720, (startWRef.current ?? 420) + dx));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      try {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      } catch {}
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const openConnectionModal = (variant: ConnectionVariant) => {
    setConnectionModal({open: true, variant});
  };

  const closeConnectionModal = () => {
    setConnectionModal((prev) => ({...prev, open: false}));
  };

  useEffect(() => {
    if (!activeConnection?.id) {
      setColumns([]);
      setExpandedColumns({});
      setPreviewData({});
      setPreviewError({});
      setPreviewLoading({});
      setSchemaError(null);
      setSchemaLoading(false);
    }
  }, [activeConnection?.id]);

  const roleToAgentRole = useCallback((appRole: string): "user" | "business" | "admin" => {
    if (appRole === "data-admin") return "admin";
    if (appRole === "business") return "business";
    return "user";
  }, []);

  const buildSql = useCallback((tableKey: string) => {
    const t = String(activeConnection?.type ?? "").toLowerCase();
    if (t.includes("mssql") || t.includes("sqlserver")) {
      return `SELECT TOP 50 * FROM ${tableKey}`;
    }
    return `SELECT * FROM ${tableKey} LIMIT 50`;
  }, [activeConnection?.type]);

  const loadSchema = useCallback(async () => {
    if (!activeConnection?.id) return;
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const res = await fetch("/api/datatalk/schema", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({connectionId: activeConnection.id}),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Не удалось загрузить схему");
      }

      const database = String(json?.data?.database ?? "");
      const rawCols = Array.isArray(json?.data?.columns) ? json.data.columns : [];
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

      setColumns(normalized);
    } catch (err) {
      setColumns([]);
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setSchemaLoading(false);
    }
  }, [activeConnection?.id]);

  useEffect(() => {
    if (!activeConnection?.id) return;
    loadSchema();
  }, [activeConnection?.id, loadSchema]);

  const tables = useMemo(() => {
    const map = new Map<string, SchemaColumn[]>();
    for (const c of columns) {
      const schemaName = c.schema ?? c.database;
      const key = `${schemaName}.${c.table}`;
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, cols]) => ({
        key,
        columns: cols.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [columns]);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.key.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q)));
  }, [search, tables]);

  const handleToggleColumns = (tableKey: string) => {
    setExpandedColumns((prev) => ({...prev, [tableKey]: !prev[tableKey]}));
  };

  const handlePreviewHover = async (tableKey: string, event: React.MouseEvent) => {
    setHoveredPreviewTable(tableKey);
    setMousePosition({ x: event.clientX, y: event.clientY });
    if (previewData[tableKey] || previewLoading[tableKey]) return;

    setPreviewLoading((prev) => ({...prev, [tableKey]: true}));
    setPreviewError((prev) => ({...prev, [tableKey]: null}));

    try {
      const sql = buildSql(tableKey);
      const res = await fetch("/api/datatalk/query", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          connectionId: activeConnection?.id,
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
      const cols = Array.isArray(json?.data?.columns) ? json.data.columns.map((c: any) => String(c)) : [];
      const rows = Array.isArray(json?.data?.rows) ? json.data.rows : [];
      setPreviewData((prev) => ({...prev, [tableKey]: {columns: cols, rows}}));
    } catch (err) {
      setPreviewData((prev) => ({...prev, [tableKey]: null}));
      setPreviewError((prev) => ({...prev, [tableKey]: err instanceof Error ? err.message : "Failed to load preview"}));
    } finally {
      setPreviewLoading((prev) => ({...prev, [tableKey]: false}));
    }
  };

  const canConnectToChart = !!targetChartId && !!activeConnection?.id;

  const syncConnectedFromStorage = useCallback(() => {
    // Fallback only: localStorage can be stale vs in-memory canvas state.
    if (!targetChartId) {
      setConnectedTableKeys({});
      setConnectedCount(0);
      return;
    }
    try {
      const activeTabId = window.localStorage.getItem("dashboard:activeTab") ?? "";
      const keys = activeTabId
        ? [`dashboard:nodes:${activeTabId}`, "dashboard:nodes"]
        : ["dashboard:nodes"];

      let raw: string | null = null;
      for (const k of keys) {
        raw = window.localStorage.getItem(k);
        if (raw) break;
      }
      if (!raw) {
        setConnectedTableKeys({});
        setConnectedCount(0);
        return;
      }
      const nodes = JSON.parse(raw) as any[];
      if (!Array.isArray(nodes)) {
        setConnectedTableKeys({});
        setConnectedCount(0);
        return;
      }
      const node = nodes.find((n) => String(n?.id ?? "") === String(targetChartId));
      const dataSourcesRaw = node?.data?.dataSources;
      const legacy = node?.data?.dataSource ? [node.data.dataSource] : [];
      const sources = Array.isArray(dataSourcesRaw) ? dataSourcesRaw : legacy;

      const next: Record<string, boolean> = {};
      let count = 0;
      for (const s of sources) {
        if (s?.kind !== "table") continue;
        const key = String(s?.tableKey ?? "");
        if (!key) continue;
        if (!next[key]) {
          next[key] = true;
          count += 1;
        }
      }
      setConnectedTableKeys(next);
      setConnectedCount(count);
    } catch {
      setConnectedTableKeys({});
      setConnectedCount(0);
    }
  }, [targetChartId]);

  const connectTableToChart = (tableKey: string, cols: SchemaColumn[]) => {
    if (!canConnectToChart) return;

    const dataSource = {
      kind: "table",
      label: tableKey,
      connectionId: activeConnection!.id,
      tableKey,
      connectionType: activeConnection!.type,
      columnsMeta: cols.map((c) => ({
        name: c.name,
        type: c.type ?? "",
        nullable: c.nullable,
      })),
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
              name: tableKey,
              title: tableKey,
              __showColumnMapping: true,
            },
          },
        })
      );
    } catch {}
  };

  useEffect(() => {
    syncConnectedFromStorage();
  }, [syncConnectedFromStorage]);

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        const chartId = String(detail?.chartId ?? "");
        if (!chartId || !targetChartId || chartId !== String(targetChartId)) return;

        const sources = Array.isArray(detail?.dataSources) ? detail.dataSources : [];
        const next: Record<string, boolean> = {};
        let count = 0;
        for (const s of sources) {
          if (s?.kind !== "table") continue;
          const key = String(s?.tableKey ?? "");
          if (!key) continue;
          if (!next[key]) {
            next[key] = true;
            count += 1;
          }
        }
        setConnectedTableKeys(next);
        setConnectedCount(count);
      } catch {
        syncConnectedFromStorage();
      }
    };
    window.addEventListener("dashboard:chart-sources-changed", handler as EventListener);
    return () => window.removeEventListener("dashboard:chart-sources-changed", handler as EventListener);
  }, [syncConnectedFromStorage, targetChartId]);

  const isConnected = !!activeConnection?.id;

  const handleConnectionToggle = (nextState: boolean) => {
    if (nextState) {
      openConnectionModal("primary");
    } else {
      setActiveConnection(null);
    }
  };

  return (
    <div className="h-full p-4" style={{ width: panelWidth }}>
      <div className="relative h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-3xl overflow-hidden flex flex-col">
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            resizingRef.current = true;
            startXRef.current = e.clientX ?? 0;
            startWRef.current = panelWidth;
            try {
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            } catch {}
          }}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-white/10"
          title="Resize"
        />

        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="w-4 h-4 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Database Explorer</div>
                <div className="text-xs text-slate-400 truncate">Manage connections & explore schema</div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Закрыть"
            >
              <Plus className="w-5 h-5" style={{transform: "rotate(45deg)"}} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search schemas / tables"
              className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-4 space-y-4">
            <DatabaseConnectionStatus
              size="compact"
              variant="primary"
              displayName={activeConnection?.name || "Database Connection"}
              isConnectedOverride={isConnected}
              onToggleConnection={handleConnectionToggle}
              onClick={undefined}
            />

            {!isConnected && (
              <div className="text-xs text-slate-400">
                Подключите базу данных, чтобы увидеть схемы и предпросмотр данных.
              </div>
            )}

            {isConnected && schemaLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Загрузка схемы...
              </div>
            )}

            {isConnected && schemaError && !schemaLoading && (
              <div className="text-sm text-rose-300">{schemaError}</div>
            )}

            {isConnected && !schemaLoading && !schemaError && filteredTables.length === 0 && (
              <div className="text-sm text-slate-400">Нет таблиц по текущему фильтру</div>
            )}

            {isConnected && (
              <div className="space-y-2">
                {filteredTables.map((table) => {
                  const columnsExpanded = !!expandedColumns[table.key];
                  const isConnectedToChart = !!connectedTableKeys[table.key];
                  const limitReached = connectedCount >= 6;
                  const connectDisabled = !canConnectToChart || (!isConnectedToChart && limitReached);

                  return (
                    <div key={table.key} className="rounded-2xl border border-white/10 bg-white/5">
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{table.key}</div>
                          <div className="text-[11px] text-slate-400">
                            {table.columns.length} column{table.columns.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-slate-300 shrink-0">
                          <button
                            type="button"
                            onMouseEnter={(e) => void handlePreviewHover(table.key, e)}
                            onMouseLeave={() => {
                              setTimeout(() => {
                                if (!isHoveringTooltip) {
                                  setHoveredPreviewTable(null);
                                }
                              }, 100);
                            }}
                            className="w-7 h-7 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
                            title="Показать превью"
                          >
                            <span className="text-xs">P</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => connectTableToChart(table.key, table.columns)}
                            disabled={connectDisabled}
                            className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-white/10 ${
                              isConnectedToChart
                                ? "bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/30"
                                : "bg-white/10 hover:bg-white/20 text-slate-300"
                            }`}
                            title={
                              !canConnectToChart
                                ? "Выберите график, чтобы подключить таблицу"
                                : (!isConnectedToChart && limitReached)
                                  ? "Лимит: можно подключить максимум 6 таблиц к одному графику"
                                  : (isConnectedToChart ? "Подключено" : "Connect to chart")
                            }
                          >
                            <Link2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {columnsExpanded && (
                        <div className="px-3 pb-3">
                          <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Columns</div>
                          <div className="space-y-1">
                            {table.columns.map((col) => (
                              <div key={col.name} className="flex items-center justify-between px-2 py-1.5 bg-white/5 rounded-md">
                                <span className="text-sm text-white font-medium">{col.name}</span>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  {col.type && <span>{col.type}</span>}
                                  {col.nullable !== undefined && (
                                    <span className={col.nullable ? "text-amber-400" : "text-emerald-400"}>
                                      {col.nullable ? "NULL" : "NOT NULL"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Floating preview tooltip */}
        {hoveredPreviewTable && typeof document !== "undefined" && createPortal(
          <div
            className="fixed z-[9999] bg-slate-900 border border-white/20 rounded-2xl shadow-2xl p-3 max-w-[600px] max-h-[400px] overflow-auto custom-scrollbar"
            style={{
              left: `${Math.min(window.innerWidth - 620, Math.max(20, mousePosition.x + 10))}px`,
              top: `${Math.min(window.innerHeight - 420, Math.max(20, mousePosition.y + 10))}px`,
            }}
            onMouseEnter={() => setIsHoveringTooltip(true)}
            onMouseLeave={() => {
              setIsHoveringTooltip(false);
              // Hide tooltip after delay if button not hovered
              setTimeout(() => {
                setHoveredPreviewTable(null);
              }, 100);
            }}
          >
            <div className="text-xs font-semibold text-slate-300 mb-2">Preview: {hoveredPreviewTable}</div>
            {previewLoading[hoveredPreviewTable] && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Загрузка данных...
              </div>
            )}
            {previewError[hoveredPreviewTable] && (
              <div className="text-xs text-rose-300">{previewError[hoveredPreviewTable]}</div>
            )}
            {!previewLoading[hoveredPreviewTable] && !previewError[hoveredPreviewTable] && previewData[hoveredPreviewTable] && (
              <div className="border border-white/5 rounded-xl overflow-hidden">
                <div className="max-h-56 overflow-auto custom-scrollbar">
                  <table className="w-full text-[11px] text-slate-200">
                    <thead>
                      <tr className="bg-white/10">
                        {previewData[hoveredPreviewTable]!.columns.map((c) => (
                          <th key={c} className="text-left font-semibold px-3 py-2 border-b border-white/5">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData[hoveredPreviewTable]!.rows.length === 0 && (
                        <tr>
                          <td colSpan={previewData[hoveredPreviewTable]!.columns.length} className="px-3 py-4 text-center text-slate-400">
                            Нет данных
                          </td>
                        </tr>
                      )}
                      {previewData[hoveredPreviewTable]!.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                          {previewData[hoveredPreviewTable]!.columns.map((_, colIndex) => {
                            const value = (row as any[])[colIndex];
                            return (
                              <td 
                                key={colIndex} 
                                className="px-3 py-2 border-b border-white/5 text-slate-100 whitespace-nowrap hover:bg-white/5 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Allow text selection and interaction
                                }}
                              >
                                {value == null ? "" : String(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

        <DatabaseConnectionModal
          isOpen={connectionModal.open}
          variant={connectionModal.variant}
          onClose={closeConnectionModal}
        />
      </div>
    </div>
  );
}
