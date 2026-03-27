"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Filter, Plus, Loader2, RefreshCw, Search, Calendar, Hash, Database } from "lucide-react";
import { useConnectionState } from "../../providers";
import { SchemaIntelligenceService } from "../../lib/schema-intelligence";
import type { SemanticModel } from "../../lib/schema-intelligence";
import { useGlobalFilters } from "../../store/globalFiltersContext";
import PropertyFilter from "../ui/PropertyFilter";

type TabId = "fields" | "filters";

export function FieldsFiltersSlideInPanel({
  onClose,
  activeChartId,
}: {
  onClose: () => void;
  activeChartId?: string | null;
}) {
  const { activeConnection } = useConnectionState();
  const {
    dateRange,
    setDateRange,
    propertyFilters,
    setPropertyFilters,
    clearAllFilters,
  } = useGlobalFilters();

  const [tab, setTab] = useState<TabId>("fields");
  const [semanticModel, setSemanticModel] = useState<SemanticModel | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const startValue = useMemo(() => {
    try {
      if (!dateRange?.start) return "";
      return dateRange.start.toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }, [dateRange?.start]);

  const endValue = useMemo(() => {
    try {
      if (!dateRange?.end) return "";
      return dateRange.end.toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }, [dateRange?.end]);

  const loadSchema = async () => {
    if (!activeConnection?.id) return;
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const res = await fetch("/api/datatalk/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: activeConnection.id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load schema");
      }

      const model = SchemaIntelligenceService.buildFromSchemaResponse(json?.data);
      setSemanticModel(model);
    } catch (err) {
      setSemanticModel(null);
      setSchemaError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    if (!activeConnection?.id) {
      setSemanticModel(null);
      setSchemaError(null);
      setSchemaLoading(false);
      return;
    }
    void loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id]);

  const filteredModel = useMemo(() => {
    if (!semanticModel) return null;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return semanticModel;

    const match = (f: any) => {
      const n = String(f?.name ?? "").toLowerCase();
      const t = String(f?.table ?? "").toLowerCase();
      return n.includes(term) || t.includes(term);
    };

    return {
      timeFields: semanticModel.timeFields.filter(match),
      dimensions: semanticModel.dimensions.filter(match),
      measures: semanticModel.measures.filter(match),
    } as SemanticModel;
  }, [semanticModel, searchTerm]);

  return (
    <div className="h-full w-[340px] sm:w-[380px] p-4">
      <div className="h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-3xl overflow-hidden flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-blue-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Fields & Filters</div>
                <div className="text-xs text-slate-400 truncate">PowerBI-like panels</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Закрыть"
            >
              <Plus className="w-5 h-5" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab("fields")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                tab === "fields"
                  ? "bg-white/15 border-white/20 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5 inline-block mr-1" />
              Fields
            </button>
            <button
              type="button"
              onClick={() => setTab("filters")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                tab === "filters"
                  ? "bg-white/15 border-white/20 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              <Filter className="w-3.5 h-3.5 inline-block mr-1" />
              Filters
            </button>

            <div className="flex-1" />

            {tab === "fields" && (
              <button
                type="button"
                onClick={() => void loadSchema()}
                disabled={!activeConnection?.id || schemaLoading}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Refresh schema"
              >
                {schemaLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {tab === "fields" && (
            <div className="space-y-3">
              {!activeConnection?.id && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">No active connection</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Connect a DB first (use DB Explorer). Then fields will appear here.
                  </div>
                </div>
              )}

              {activeConnection?.id && schemaLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading schema...
                </div>
              )}

              {activeConnection?.id && schemaError && !schemaLoading && (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {schemaError}
                </div>
              )}

              {activeConnection?.id && !schemaLoading && !schemaError && filteredModel && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search fields..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
                    />
                  </div>

                  <FieldsByTableSection title="Time fields" icon={<Calendar className="w-4 h-4" />} iconColor="text-purple-400" sourceType="timeField" items={filteredModel.timeFields} />
                  <FieldsByTableSection title="Dimensions" icon={<Database className="w-4 h-4" />} iconColor="text-blue-400" sourceType="dimension" items={filteredModel.dimensions} />
                  <FieldsByTableSection title="Measures" icon={<Hash className="w-4 h-4" />} iconColor="text-emerald-400" sourceType="measure" items={filteredModel.measures} />
                </div>
              )}
            </div>
          )}

          {tab === "filters" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Date range</div>
                <div className="mt-1 text-[11px] text-slate-500">Leave empty for all-time range.</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Start</div>
                    <input
                      type="date"
                      value={startValue}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setDateRange(null);
                          return;
                        }
                        const next = new Date(e.target.value);
                        if (Number.isNaN(next.getTime())) return;
                        setDateRange({ start: next, end: dateRange?.end ?? new Date() });
                      }}
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">End</div>
                    <input
                      type="date"
                      value={endValue}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setDateRange(null);
                          return;
                        }
                        const next = new Date(e.target.value);
                        if (Number.isNaN(next.getTime())) return;
                        setDateRange({ start: dateRange?.start ?? new Date(0), end: next });
                      }}
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-400/50"
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDateRange(null)}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    All time
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">Property filters</div>
                    <div className="text-xs text-slate-400 mt-0.5">Applied globally (report-level)</div>
                  </div>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-3">
                  <PropertyFilter value={propertyFilters} onChange={setPropertyFilters} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldsByTableSection({
  title,
  icon,
  iconColor,
  sourceType,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  sourceType: "timeField" | "dimension" | "measure";
  items: Array<{ name: string; table: string; type: string }>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const tables = useMemo(() => {
    const map = new Map<string, Array<{ name: string; table: string; type: string }>>();
    for (const f of items) {
      const key = String(f.table ?? "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([table, fields]) => ({ table, fields: fields.sort((x, y) => String(x.name).localeCompare(String(y.name))) }));
  }, [items]);

  const handleDragStart = (e: React.DragEvent, f: { name: string; table: string; type: string }) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        column: {
          name: f.name,
          table: f.table,
          type: f.type,
          classification: sourceType,
        },
        sourceType,
      })
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className={`flex items-center gap-2 text-sm font-semibold ${iconColor}`}> 
          {icon}
          <span className="text-white">{title}</span>
          <span className="text-xs text-slate-500">({items.length})</span>
        </div>
        <div className="text-xs text-slate-400">{expanded ? "−" : "+"}</div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {tables.length === 0 && <div className="text-xs text-slate-500 px-1">No fields</div>}

          {tables.map(({ table, fields }) => {
            const isTableExpanded = expandedTables[table] ?? true;
            return (
              <div key={table} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedTables((prev) => ({ ...prev, [table]: !isTableExpanded }))}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-200 truncate">{table}</div>
                  <div className="text-xs text-slate-500">{isTableExpanded ? "−" : "+"}</div>
                </button>

                {isTableExpanded && (
                  <div className="px-2 pb-2 space-y-1">
                    {fields.map((f, idx) => (
                      <div
                        key={`${f.table}.${f.name}.${idx}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, f)}
                        className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{f.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{f.table}</div>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono shrink-0">{String(f.type).split("(")[0]}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
