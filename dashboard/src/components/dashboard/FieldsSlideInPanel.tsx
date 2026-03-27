"use client";

import { Layers, Plus, Loader2, RefreshCw, Search, Calendar, Hash, Database } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnectionState } from "../../providers";
import { useSemanticModel } from "../../context/SemanticModelContext";
import { SchemaIntelligenceService } from "../../lib/schema-intelligence";
import type { SemanticModel } from "../../lib/schema-intelligence";
import type { SemanticModelV1 } from "../../lib/semantic/types";

type SemanticDragPayload = {
  kind: "semantic-field";
  ref: string;
  fieldType: "dimension" | "measure" | "time";
  semanticType: string;
  model: string;
  field: string;
};

type FieldParameterKind = "dimension" | "measure";

type ColumnMappingLike = {
  xColumn?: string;
  groupBy?: string;
  yColumns?: Array<{ col: string; agg?: string } | any>;
  tooltipColumns?: string[];
  detailsColumns?: string[];
  drilldownColumns?: string[];
  details2Columns?: string[];
  colorByMeasure?: boolean;
};

type CalendarGranularity = "day" | "week" | "month" | "quarter" | "year";

type SyntheticField = {
  name: string;
  table: string;
  type: string;
  sourceType: "timeField" | "dimension" | "measure";
  __calendar?: { granularity: CalendarGranularity };
};

function toFieldRef(field: { name: string; table: string }): string {
  const name = String(field?.name ?? "").trim();
  const table = String(field?.table ?? "").trim();
  if (table && name) return `${table}.${name}`;
  return name;
}

function safeKey(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleaned)) return "";
  return cleaned;
}

function resolveSemanticRef(
  semanticModel: SemanticModelV1 | null,
  table: string,
  column: string
): string {
  const t = String(table ?? "").trim();
  const c = String(column ?? "").trim();
  if (!t || !c) return "";
  if (!semanticModel || typeof semanticModel !== "object") return "";
  const modelsObj = (semanticModel as any)?.models;
  if (!modelsObj || typeof modelsObj !== "object") return "";

  const modelName = safeKey(t);
  const mdl = modelName ? (modelsObj as any)[modelName] : null;
  if (!mdl || typeof mdl !== "object") return "";

  const dims = mdl?.dimensions && typeof mdl.dimensions === "object" ? Object.keys(mdl.dimensions) : [];
  const meas = mdl?.measures && typeof mdl.measures === "object" ? Object.keys(mdl.measures) : [];
  const all = [...dims, ...meas];
  if (all.length === 0) return "";

  const key = safeKey(c) || c;
  const direct = all.find((k) => k === c) || all.find((k) => k === key);
  if (direct) return `${modelName}.${direct}`;

  const lc = c.toLowerCase();
  const ci = all.find((k) => String(k).toLowerCase() === lc);
  if (ci) return `${modelName}.${ci}`;
  return "";
}

function semanticTypeToString(t: unknown): string {
  const s = String(t ?? "").trim();
  return s || "string";
}

function getSemanticFieldTypeForDrag(sourceType: "timeField" | "dimension" | "measure"): "time" | "dimension" | "measure" {
  if (sourceType === "timeField") return "time";
  if (sourceType === "measure") return "measure";
  return "dimension";
}

export function FieldsSlideInPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const { activeConnection } = useConnectionState();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("project");

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const raw = String(window.localStorage.getItem("dashboard:fieldsPanelWidth") ?? "").trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 300 && n <= 720) return n;
    } catch {}
    return 380;
  });
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(380);

  useEffect(() => {
    try {
      window.localStorage.setItem("dashboard:fieldsPanelWidth", String(panelWidth));
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:panel-width-changed", {
          detail: { panel: "fields", width: panelWidth },
        })
      );
    } catch {}
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = (e.clientX ?? 0) - (startXRef.current ?? 0);
      // Dragging the LEFT edge: moving mouse left should increase width.
      const next = Math.max(300, Math.min(720, (startWRef.current ?? 380) - dx));
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

  const effectiveProjectId = useMemo(() => {
    const fromUrl = String(urlProjectId ?? "").trim();
    if (fromUrl) return fromUrl;
    try {
      return String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
    } catch {
      return "";
    }
  }, [urlProjectId]);

  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [activeChartMapping, setActiveChartMapping] = useState<ColumnMappingLike | null>(null);
  const [activeChartData, setActiveChartData] = useState<any>(null);

  const activeChartIdRef = useRef<string | null>(null);
  activeChartIdRef.current = activeChartId;

  const [semanticModel, setSemanticModel] = useState<SemanticModel | null>(null);
  const [semanticModelV1Local, setSemanticModelV1Local] = useState<SemanticModelV1 | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasSemanticFields = useMemo(() => {
    const m = semanticModelV1Local as any;
    const modelsObj = m?.models;
    if (!modelsObj || typeof modelsObj !== "object") return false;
    for (const modelName of Object.keys(modelsObj)) {
      const mdl = (modelsObj as any)[modelName];
      if (!mdl || typeof mdl !== "object") continue;
      const dimsObj = mdl?.dimensions;
      const measObj = mdl?.measures;
      const dimsCnt = dimsObj && typeof dimsObj === "object" ? Object.keys(dimsObj).length : 0;
      const measCnt = measObj && typeof measObj === "object" ? Object.keys(measObj).length : 0;
      if (dimsCnt + measCnt > 0) return true;
    }
    return false;
  }, [semanticModelV1Local]);

  const { setSemanticModelV1 } = useSemanticModel();

  useEffect(() => {
    setSemanticModelV1(semanticModelV1Local);
  }, [semanticModelV1Local, setSemanticModelV1]);

  const [semanticArtifacts, setSemanticArtifacts] = useState<any>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const next = detail?.semanticArtifacts;
      setSemanticArtifacts(next && typeof next === "object" ? next : null);
    };
    window.addEventListener("dashboard:semantic-artifacts", handler as EventListener);
    return () => window.removeEventListener("dashboard:semantic-artifacts", handler as EventListener);
  }, []);

  const parametersList = useMemo(() => {
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const params = a && a.parameters && typeof a.parameters === "object" ? a.parameters : null;
    if (!params) return [] as Array<{ id: string; name: string; kind: string; valuesCount: number }>;
    return Object.keys(params)
      .map((k) => {
        const p = (params as any)[k];
        const id = String(p?.id ?? k).trim() || String(k);
        const name = String(p?.name ?? id).trim() || id;
        const kind = String(p?.kind ?? "list");
        const valuesCount = Array.isArray(p?.values) ? p.values.length : 0;
        return { id, name, kind, valuesCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [semanticArtifacts]);

  const [newParamOpen, setNewParamOpen] = useState(false);
  const [newParamName, setNewParamName] = useState("");
  const [newParamValues, setNewParamValues] = useState("");

  const [newFieldParamOpen, setNewFieldParamOpen] = useState(false);
  const [newFieldParamName, setNewFieldParamName] = useState("");
  const [newFieldParamKind, setNewFieldParamKind] = useState<FieldParameterKind>("measure");
  const [newFieldParamRefs, setNewFieldParamRefs] = useState("");

  const fieldParametersList = useMemo(() => {
    const a = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
    const fps = a && a.fieldParameters && typeof a.fieldParameters === "object" ? a.fieldParameters : null;
    if (!fps) return [] as Array<{ id: string; name: string; kind: FieldParameterKind; count: number }>;
    return Object.keys(fps)
      .map((k) => {
        const fp = (fps as any)[k];
        const id = String(fp?.id ?? k).trim() || String(k);
        const name = String(fp?.name ?? id).trim() || id;
        const kind: FieldParameterKind = (String(fp?.kind ?? "measure") === "dimension") ? "dimension" : "measure";
        const count = Array.isArray(fp?.items) ? fp.items.length : 0;
        return { id, name, kind, count };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [semanticArtifacts]);

  const parseValues = (raw: string): string[] => {
    const parts = String(raw ?? "")
      .split(/[\n,;\t]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const res: string[] = [];
    for (const p of parts) {
      if (seen.has(p)) continue;
      seen.add(p);
      res.push(p);
    }
    return res;
  };

  const safeParamId = (raw: string): string => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const cleaned = s.replace(/[^a-zA-Z0-9_]/g, "_");
    return cleaned || "";
  };

  const parseRefs = (raw: string): string[] => {
    const parts = String(raw ?? "")
      .split(/[\n,;\t]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const res: string[] = [];
    for (const p of parts) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      res.push(p);
    }
    return res;
  };

  const createFieldParameter = () => {
    const name = String(newFieldParamName ?? "").trim();
    if (!name) return;
    const id = safeParamId(name);
    if (!id) return;
    const refs = parseRefs(newFieldParamRefs);
    if (refs.length === 0) return;
    const kind = newFieldParamKind;

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:update-semantic-artifacts", {
          detail: {
            patch: {
              fieldParameters: {
                [id]: {
                  id,
                  name,
                  kind,
                  items: refs.map((r, idx) => ({ label: r, ref: r, order: idx })),
                },
              },
              fieldParameterSelections: {
                [id]: { ref: refs[0] },
              },
            },
          },
        })
      );
    } catch {}

    setNewFieldParamOpen(false);
    setNewFieldParamName("");
    setNewFieldParamRefs("");
    setNewFieldParamKind("measure");
  };

  

  const createListParameter = () => {
    const name = String(newParamName ?? "").trim();
    if (!name) return;
    const id = safeParamId(name);
    if (!id) return;
    const vals = parseValues(newParamValues);

    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:update-semantic-artifacts", {
          detail: {
            patch: {
              parameters: {
                [id]: {
                  id,
                  name,
                  kind: "list",
                  dataType: "string",
                  values: vals,
                },
              },
              parameterSelections: {
                [id]: { values: vals.length ? [vals[0]] : [] },
              },
            },
          },
        })
      );
    } catch {}

    setNewParamOpen(false);
    setNewParamName("");
    setNewParamValues("");
  };

  useEffect(() => {
    const pid = String(effectiveProjectId ?? "").trim();
    if (!pid) {
      setSemanticModelV1Local(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const bindingRes = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
        const bindingJson = await bindingRes.json().catch(() => ({}));
        const modelJson = bindingJson?.data?.model?.model_json ?? null;
        if (!cancelled) {
          setSemanticModelV1Local(modelJson && typeof modelJson === "object" ? (modelJson as any) : null);
        }
      } catch {
        if (!cancelled) setSemanticModelV1Local(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId]);

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
    // Semantic-first: only load raw schema when we cannot render from semantic model.
    if (!activeConnection?.id) {
      setSemanticModel(null);
      setSchemaError(null);
      setSchemaLoading(false);
      return;
    }
    if (hasSemanticFields) {
      setSemanticModel(null);
      setSchemaError(null);
      setSchemaLoading(false);
      return;
    }
    void loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id, hasSemanticFields]);

  useEffect(() => {
    const onActiveChartId = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.chartId ? String(detail.chartId) : null;
      setActiveChartId(cid);
      const nextChartData = (detail?.chartData && typeof detail.chartData === "object") ? detail.chartData : null;
      setActiveChartData(nextChartData);
      const nextMapping = (nextChartData && typeof nextChartData === "object")
        ? ((nextChartData as any).columnMapping as ColumnMappingLike | null)
        : null;
      setActiveChartMapping(nextMapping && typeof nextMapping === "object" ? nextMapping : null);
    };

    const onChartDataPatched = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.chartId ? String(detail.chartId) : null;
      if (!cid) return;

      const patch = detail?.patch;
      if (!patch || typeof patch !== "object") return;

      const currentActiveId = activeChartIdRef.current;
      if (currentActiveId && cid === currentActiveId && Object.prototype.hasOwnProperty.call(patch, "columnMapping")) {
        const mapping = (patch as any).columnMapping as ColumnMappingLike | null;
        setActiveChartMapping(mapping && typeof mapping === "object" ? mapping : null);
      }

      if (currentActiveId && cid === currentActiveId) {
        setActiveChartData((prev: any) => {
          const base = (prev && typeof prev === "object") ? prev : {};
          return { ...base, ...patch };
        });
      }
    };

    window.addEventListener("dashboard:active-chart-id", onActiveChartId as EventListener);
    window.addEventListener("dashboard:update-chart-data", onChartDataPatched as EventListener);
    return () => {
      window.removeEventListener("dashboard:active-chart-id", onActiveChartId as EventListener);
      window.removeEventListener("dashboard:update-chart-data", onChartDataPatched as EventListener);
    };
  }, []);

  const activeTime = useMemo(() => {
    const q = (activeChartData && typeof activeChartData === "object") ? (activeChartData as any).logicalQuery : null;
    const t = (q && typeof q === "object") ? (q as any).time : null;
    const dim = t && typeof t === "object" ? String((t as any).dimension ?? "").trim() : "";
    const gran = t && typeof t === "object" ? String((t as any).granularity ?? "").trim() : "";
    return { dimension: dim, granularity: gran };
  }, [activeChartData]);

  const selectedKeys = useMemo(() => {
    const m = activeChartMapping;
    const set = new Set<string>();
    const add = (v: any) => {
      const s = String(v ?? "").trim();
      if (s) set.add(s);
    };
    if (!m) return set;
    add(m.xColumn);
    // Build/SQL mapping may use groupBy as categorical axis.
    add(m.groupBy);
    for (const yy of Array.isArray(m.yColumns) ? m.yColumns : []) {
      if (yy && typeof yy === "object") add((yy as any).col);
      else add(yy);
    }
    for (const tt of Array.isArray((m as any).tooltipColumns) ? (m as any).tooltipColumns : []) add(tt);
    for (const dd of Array.isArray((m as any).detailsColumns) ? (m as any).detailsColumns : []) add(dd);
    for (const dr of Array.isArray((m as any).drilldownColumns) ? (m as any).drilldownColumns : []) add(dr);
    for (const d2 of Array.isArray((m as any).details2Columns) ? (m as any).details2Columns : []) add(d2);
    if ((m as any)?.colorByMeasure) add("__measureNames__");
    return set;
  }, [activeChartMapping]);

  const bestTimeFieldRef = useMemo(() => {
    const m = activeChartMapping;
    const x = String(m?.xColumn ?? "").trim();
    const timeFields = Array.isArray((semanticModel as any)?.timeFields) ? (semanticModel as any).timeFields : [];
    const isTime = (ref: string) => {
      if (!ref) return false;
      const idx = ref.indexOf(".");
      const t = idx > 0 ? ref.slice(0, idx) : "";
      const n = idx > 0 ? ref.slice(idx + 1) : ref;
      return timeFields.some((f: any) => String(f?.table ?? "").trim() === t && String(f?.name ?? "").trim() === n);
    };

    if (x && isTime(x)) return x;
    const first = timeFields[0];
    if (first && typeof first === "object") {
      const t = String((first as any).table ?? "").trim();
      const n = String((first as any).name ?? "").trim();
      if (t && n) return `${t}.${n}`;
    }
    return "";
  }, [activeChartMapping, semanticModel]);

  const axisTimeBaseRef = useMemo(() => {
    // Prefer semantic model default time dimension for the chart's sourceModel.
    const q = (activeChartData && typeof activeChartData === "object") ? (activeChartData as any).logicalQuery : null;
    const sourceModel = q && typeof q === "object" ? String((q as any).sourceModel ?? "").trim() : "";
    if (sourceModel && semanticModelV1Local && typeof semanticModelV1Local === "object") {
      const mdl = (semanticModelV1Local as any)?.models?.[sourceModel];
      const dt = mdl && typeof mdl === "object" ? String((mdl as any).defaultTimeDimension ?? "").trim() : "";
      if (dt) return `${sourceModel}.${dt}`;
    }
    // Fallback to schema-derived time field.
    return String(bestTimeFieldRef ?? "").trim();
  }, [activeChartData, semanticModelV1Local, bestTimeFieldRef]);

  const applyCalendarGranularity = (g: CalendarGranularity) => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) return;

    const dim = String(axisTimeBaseRef ?? "").trim();
    if (!dim) return;

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: cid,
          patch: {
            logicalQuery: {
              time: { dimension: dim, granularity: g },
            },
          },
        },
      })
    );
  };

  const clearCalendarTime = () => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) return;
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: cid,
          patch: {
            logicalQuery: {
              time: null,
            },
          },
        },
      })
    );
  };

  const calendarFields: SyntheticField[] = useMemo(() => {
    const base = String(axisTimeBaseRef ?? "").trim();
    if (!base) return [];
    const table = "Calendar";
    return [
      { name: "STARTOFYEAR()", table, type: "time", sourceType: "timeField", __calendar: { granularity: "year" } },
      { name: "STARTOFQUARTER()", table, type: "time", sourceType: "timeField", __calendar: { granularity: "quarter" } },
      { name: "STARTOFMONTH()", table, type: "time", sourceType: "timeField", __calendar: { granularity: "month" } },
      { name: "STARTOFWEEK()", table, type: "time", sourceType: "timeField", __calendar: { granularity: "week" } },
      { name: "DATE()", table, type: "time", sourceType: "timeField", __calendar: { granularity: "day" } },
    ];
  }, [axisTimeBaseRef]);

  const toggleSyntheticField = (f: SyntheticField) => {
    if (f.__calendar) {
      const base = String(axisTimeBaseRef ?? "").trim();
      const g = f.__calendar.granularity;
      const already = base && activeTime.dimension === base && activeTime.granularity === g;
      if (already) {
        clearCalendarTime();
      } else {
        applyCalendarGranularity(g);
      }
    }
  };

  const toggleField = (field: { name: string; table: string; type: string }, sourceType: "timeField" | "dimension" | "measure") => {
    const cid = String(activeChartId ?? "").trim();
    if (!cid) {
      try {
        const last = String(window.localStorage.getItem("dashboard:lastActiveChartId") ?? "").trim();
        if (last) {
          window.dispatchEvent(
            new CustomEvent("dashboard:active-chart-id", {
              detail: { chartId: last, chartData: null },
            })
          );
        }
      } catch {}
      return;
    }
    const legacyRef = toFieldRef({ name: String(field?.name ?? ""), table: String(field?.table ?? "") });
    const semanticRef = resolveSemanticRef(semanticModelV1Local, String(field?.table ?? ""), String(field?.name ?? ""));
    const col = semanticRef || legacyRef;
    if (!col) return;

    const prev = (activeChartMapping && typeof activeChartMapping === "object") ? activeChartMapping : ({} as ColumnMappingLike);
    const isSelected = selectedKeys.has(col) || (!!legacyRef && selectedKeys.has(legacyRef));

    if (isSelected) {
      const next: any = { ...prev };
      const removeIfMatch = (v: any) => {
        const s = String(v ?? "").trim();
        if (!s) return false;
        if (s === col) return true;
        if (legacyRef && s === legacyRef) return true;
        return false;
      };
      if (removeIfMatch(next.xColumn)) delete next.xColumn;
      if (removeIfMatch(next.groupBy)) delete next.groupBy;
      if (Array.isArray(next.yColumns)) {
        next.yColumns = next.yColumns.filter((yy: any) => {
          const v = (yy && typeof yy === "object") ? String(yy.col ?? "").trim() : String(yy ?? "").trim();
          return !removeIfMatch(v);
        });
        if (next.yColumns.length === 0) delete next.yColumns;
      }
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: { chartId: activeChartId, patch: { columnMapping: next } },
        })
      );
      return;
    }

    const next: any = { ...prev };
    if (sourceType === "measure") {
      const prevY = Array.isArray(next.yColumns) ? next.yColumns : [];
      // Power BI-like: first measure goes to Values (Y). Additional measures append.
      next.yColumns = [...prevY, { col, agg: "SUM" }];
    } else {
      const x = String(next.xColumn ?? "").trim();
      const g = String(next.groupBy ?? "").trim();

      // Power BI-like auto-placement:
      // - First time field / dimension -> Axis (X)
      // - Second dimension -> Legend (groupBy)
      // If user clicks a time field and X is already a non-time dimension, allow replacing X.
      if (!x) {
        next.xColumn = col;
      } else if (!g) {
        // If X already has something, next dimension goes to groupBy.
        next.groupBy = col;
      } else {
        // If both occupied, replace groupBy (keeps behavior deterministic).
        next.groupBy = col;
      }
    }

    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId: cid, patch: { columnMapping: next } },
      })
    );
  };

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

  const semanticTree = useMemo(() => {
    const m = semanticModelV1Local as any;
    const modelsObj = m?.models;
    if (!modelsObj || typeof modelsObj !== "object") return [] as Array<{
      modelName: string;
      dimensions: Array<{ name: string; type: string }>;
      measures: Array<{ name: string; type: string }>;
      defaultTimeDimension: string;
    }>;

    const term = String(searchTerm ?? "").trim().toLowerCase();

    const res: Array<{
      modelName: string;
      dimensions: Array<{ name: string; type: string }>;
      measures: Array<{ name: string; type: string }>;
      defaultTimeDimension: string;
    }> = [];

    for (const modelName of Object.keys(modelsObj).sort((a, b) => a.localeCompare(b))) {
      const mdl = (modelsObj as any)[modelName];
      if (!mdl || typeof mdl !== "object") continue;
      const dimsObj = mdl?.dimensions && typeof mdl.dimensions === "object" ? mdl.dimensions : {};
      const measObj = mdl?.measures && typeof mdl.measures === "object" ? mdl.measures : {};
      const defaultTimeDimension = String(mdl?.defaultTimeDimension ?? "").trim();

      const dims = Object.keys(dimsObj)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, type: semanticTypeToString((dimsObj as any)[name]?.type) }))
        .filter((f) => {
          if (!term) return true;
          return modelName.toLowerCase().includes(term) || f.name.toLowerCase().includes(term);
        });

      const meas = Object.keys(measObj)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, type: semanticTypeToString((measObj as any)[name]?.type) }))
        .filter((f) => {
          if (!term) return true;
          return modelName.toLowerCase().includes(term) || f.name.toLowerCase().includes(term);
        });

      if (dims.length === 0 && meas.length === 0) continue;
      res.push({ modelName, dimensions: dims, measures: meas, defaultTimeDimension });
    }
    return res;
  }, [semanticModelV1Local, searchTerm]);

  const hasSearchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const semanticHits = semanticTree.reduce((acc, t) => acc + t.dimensions.length + t.measures.length, 0);
    const basicHits = (filteredModel?.timeFields?.length ?? 0) + (filteredModel?.dimensions?.length ?? 0) + (filteredModel?.measures?.length ?? 0);
    const calendarHits = (calendarFields ?? []).filter((f) => {
      const n = String(f.name ?? "").toLowerCase();
      const tbl = String(f.table ?? "").toLowerCase();
      return n.includes(term) || tbl.includes(term);
    }).length;
    return semanticHits + basicHits + calendarHits > 0;
  }, [searchTerm, semanticTree, filteredModel, calendarFields]);

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
          className="absolute top-0 left-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-white/10"
          title="Resize"
        />
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-blue-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Fields</div>
                <div className="text-xs text-slate-400 truncate">Data (PowerBI-like)</div>
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

          <div className="mt-4 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              data-testid="fields-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search fields..."
              className="w-full bg-black/20 border border-white/10 focus:border-emerald-400/60 outline-none rounded-xl pl-9 pr-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-3">
            {!activeChartId && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
                <div className="text-sm font-semibold text-emerald-100">No chart selected</div>
                <div className="text-xs text-emerald-200/80 mt-1">Click a chart on the canvas to configure fields.</div>
              </div>
            )}

            {activeChartId && (
              <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Advanced</div>
                <div className="text-xs text-slate-300">{showAdvanced ? "Hide" : "Show"}</div>
              </button>
            </div>
            {!!axisTimeBaseRef && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider" title="Time bucketing helper for chart X axis">
                    Date Granularity
                  </div>
                  <button
                    type="button"
                    onClick={clearCalendarTime}
                    className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200"
                    title="Clear time grain"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-500 font-mono truncate">
                  base: {String(axisTimeBaseRef ?? "").trim()}
                </div>

                <div className="mt-3 grid grid-cols-5 gap-2">
                  {([
                    { k: "year", label: "STARTOFYEAR" },
                    { k: "quarter", label: "STARTOFQUARTER" },
                    { k: "month", label: "STARTOFMONTH" },
                    { k: "week", label: "STARTOFWEEK" },
                    { k: "day", label: "DATE" },
                  ] as Array<{ k: CalendarGranularity; label: string }>).map((it) => {
                    const checked = !!axisTimeBaseRef && activeTime.dimension === axisTimeBaseRef && activeTime.granularity === it.k;
                    return (
                      <button
                        key={it.k}
                        type="button"
                        onClick={() => {
                          if (checked) clearCalendarTime();
                          else applyCalendarGranularity(it.k);
                        }}
                        className={`h-9 rounded-xl border text-[11px] font-semibold transition ${
                          checked
                            ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-100"
                            : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                        }`}
                        title={checked ? "Remove" : "Apply"}
                      >
                        {it.label}()
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 space-y-1">
                  {calendarFields.map((f) => (
                    <div
                      key={`xhelper.${f.name}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({
                            synthetic: "calendar",
                            granularity: f.__calendar?.granularity,
                            baseTimeRef: String(axisTimeBaseRef ?? "").trim(),
                            name: f.name,
                            table: f.table,
                            type: f.type,
                            sourceType: "timeField",
                          })
                        );
                      }}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                      title="Drag to Axis (X)"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Calendar className="w-3.5 h-3.5 text-purple-300" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{f.name}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0">time</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showAdvanced && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Parameters</div>
                <button
                  type="button"
                  onClick={() => setNewParamOpen((v) => !v)}
                  className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200"
                >
                  New parameter
                </button>
              </div>

              {newParamOpen && (
                <div className="mt-3 space-y-2">
                  <input
                    value={newParamName}
                    onChange={(e) => setNewParamName(e.target.value)}
                    placeholder="Parameter name (e.g. K)"
                    className="w-full h-9 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none"
                  />
                  <textarea
                    value={newParamValues}
                    onChange={(e) => setNewParamValues(e.target.value)}
                    placeholder="Paste values (newline/comma separated)"
                    className="w-full h-24 resize-none rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-xs text-slate-100 outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewParamOpen(false);
                        setNewParamName("");
                        setNewParamValues("");
                      }}
                      className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createListParameter}
                      className="h-8 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] text-emerald-100"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              {parametersList.length > 0 && (
                <div className="mt-3 space-y-1">
                  {parametersList.map((p) => (
                    <div
                      key={`param.${p.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ kind: "semantic-parameter", parameterId: p.id, name: p.name })
                        );
                      }}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                      title={`@${p.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="w-3.5 h-3.5 text-sky-300" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0">{p.kind}:{p.valuesCount}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {showAdvanced && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Field Parameters</div>
                <button
                  type="button"
                  onClick={() => setNewFieldParamOpen((v) => !v)}
                  className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200"
                >
                  New field parameter
                </button>
              </div>

              {newFieldParamOpen && (
                <div className="mt-3 space-y-2">
                  <input
                    value={newFieldParamName}
                    onChange={(e) => setNewFieldParamName(e.target.value)}
                    placeholder="Name (e.g. MetricSelector)"
                    className="w-full h-9 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none"
                  />
                  <select
                    value={newFieldParamKind}
                    onChange={(e) => {
                      const v = String(e.target.value);
                      if (v === "dimension" || v === "measure") setNewFieldParamKind(v as any);
                    }}
                    className="w-full h-9 px-3 rounded-xl bg-black/20 border border-white/10 text-sm text-slate-100 outline-none"
                    title="Kind"
                  >
                    <option value="measure">Measures</option>
                    <option value="dimension">Dimensions</option>
                  </select>
                  <textarea
                    value={newFieldParamRefs}
                    onChange={(e) => setNewFieldParamRefs(e.target.value)}
                    placeholder="Paste semantic refs (Model.field), one per line"
                    className="w-full h-24 resize-none rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-xs text-slate-100 outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewFieldParamOpen(false);
                        setNewFieldParamName("");
                        setNewFieldParamRefs("");
                        setNewFieldParamKind("measure");
                      }}
                      className="h-8 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createFieldParameter}
                      className="h-8 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] text-emerald-100"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              {fieldParametersList.length > 0 && (
                <div className="mt-3 space-y-1">
                  {fieldParametersList.map((fp) => (
                    <div
                      key={`fp.${fp.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ kind: "semantic-field-parameter", fieldParameterId: fp.id, name: fp.name })
                        );
                      }}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                      title={`${fp.kind} (${fp.count})`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Database className="w-3.5 h-3.5 text-purple-300" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{fp.name}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0">{fp.kind}:{fp.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {!activeConnection?.id && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">No active connection</div>
                <div className="text-xs text-slate-400 mt-1">
                  Connect a DB first (use DB Explorer). Then fields will appear here.
                </div>
              </div>
            )}

            {!!activeConnection?.id && schemaLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading schema...
              </div>
            )}

            {!!activeConnection?.id && schemaError && !schemaLoading && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                {schemaError}
              </div>
            )}

            {!!activeConnection?.id && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Meta fields</div>
                <div className="mt-2 space-y-1">
                  {[
                    { name: "Measure Names", ref: "__measureNames__" },
                    { name: "Measure Values", ref: "__measureValues__" },
                  ].map((mf) => (
                    <div
                      key={mf.ref}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({
                            name: mf.name,
                            table: "Meta",
                            ref: mf.ref,
                            kind: "meta-field",
                            fieldType: "dimension",
                            semanticType: "string",
                            column: { name: mf.name, table: "Meta", type: "meta", classification: "dimension", ref: mf.ref },
                            sourceType: "dimension",
                          })
                        );
                      }}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                      title={mf.name}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Hash className="w-3.5 h-3.5 text-sky-300" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{mf.name}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0">meta</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasSemanticFields && semanticTree.length > 0 && (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Semantic Model</div>
                <div className="space-y-2">
                  {semanticTree.map((t) => (
                    <div key={t.modelName} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-200 truncate">{t.modelName}</div>
                      </div>

                      <div className="px-3 pb-3">
                        {t.dimensions.length > 0 && (
                          <div className="mt-1">
                            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Dimensions</div>
                            <div className="mt-1 space-y-1">
                              {t.dimensions.map((d) => (
                                <div
                                  key={`${t.modelName}.dim.${d.name}`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "copy";
                                    const ref = `${t.modelName}.${d.name}`;
                                    const payload: SemanticDragPayload = {
                                      kind: "semantic-field",
                                      ref,
                                      fieldType: d.name === t.defaultTimeDimension ? "time" : "dimension",
                                      semanticType: d.type,
                                      model: t.modelName,
                                      field: d.name,
                                    };
                                    e.dataTransfer.setData(
                                      "application/json",
                                      JSON.stringify({
                                        ...payload,
                                        // Back-compat: keep these for existing drop handlers.
                                        ref,
                                        name: d.name,
                                        table: t.modelName,
                                        column: { name: d.name, table: t.modelName, type: d.type, classification: "dimension", ref },
                                        sourceType: d.name === t.defaultTimeDimension ? "timeField" : "dimension",
                                      })
                                    );
                                  }}
                                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                                  title={`${t.modelName}.${d.name}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {d.name === t.defaultTimeDimension
                                      ? <Calendar className="w-3.5 h-3.5 text-purple-300" />
                                      : <Database className="w-3.5 h-3.5 text-slate-400" />}
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-white truncate">{d.name}</div>
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono shrink-0">{d.type}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {t.measures.length > 0 && (
                          <div className={t.dimensions.length > 0 ? "mt-3" : "mt-1"}>
                            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1">Measures</div>
                            <div className="mt-1 space-y-1">
                              {t.measures.map((m) => (
                                <div
                                  key={`${t.modelName}.meas.${m.name}`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = "copy";
                                    const ref = `${t.modelName}.${m.name}`;
                                    const payload: SemanticDragPayload = {
                                      kind: "semantic-field",
                                      ref,
                                      fieldType: "measure",
                                      semanticType: m.type,
                                      model: t.modelName,
                                      field: m.name,
                                    };
                                    e.dataTransfer.setData(
                                      "application/json",
                                      JSON.stringify({
                                        ...payload,
                                        ref,
                                        name: m.name,
                                        table: t.modelName,
                                        column: { name: m.name, table: t.modelName, type: m.type, classification: "measure", ref },
                                        sourceType: "measure",
                                      })
                                    );
                                  }}
                                  className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                                  title={`${t.modelName}.${m.name}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Hash className="w-3.5 h-3.5 text-emerald-300" />
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-white truncate">{m.name}</div>
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono shrink-0">{m.type}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!hasSemanticFields && !!activeConnection?.id && !schemaLoading && !schemaError && filteredModel && (
              <div className="space-y-3">
                {calendarFields.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mt-4">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Fields</div>
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-[55%]">
                        {String(bestTimeFieldRef ?? "").trim()}
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {calendarFields
                        .filter((f) => {
                          const term = searchTerm.trim().toLowerCase();
                          if (!term) return true;
                          const n = String(f.name).toLowerCase();
                          const t = String(f.table).toLowerCase();
                          return n.includes(term) || t.includes(term);
                        })
                        .map((f) => (
                          <div
                            key={`${f.table}.${f.name}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "copy";
                              e.dataTransfer.setData(
                                "application/json",
                                JSON.stringify({
                                  synthetic: "calendar",
                                  granularity: f.__calendar?.granularity,
                                  baseTimeRef: String(bestTimeFieldRef ?? "").trim(),
                                  name: f.name,
                                  table: f.table,
                                  type: f.type,
                                  sourceType: "timeField",
                                })
                              );
                            }}
                            className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {(() => {
                                const base = String(bestTimeFieldRef ?? "").trim();
                                const g = String(f.__calendar?.granularity ?? "").trim();
                                const checked = !!base && activeTime.dimension === base && activeTime.granularity === g;
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleSyntheticField(f);
                                    }}
                                    className={`w-4 h-4 rounded border shrink-0 transition-colors ${
                                      checked
                                        ? "bg-emerald-500/30 border-emerald-400/60"
                                        : "bg-white/5 border-white/15 hover:border-white/30"
                                    }`}
                                    aria-pressed={checked}
                                    title="Add/remove"
                                  >
                                    {checked ? <span className="block w-full h-full text-[10px] leading-[14px] text-emerald-200">✓</span> : null}
                                  </button>
                                );
                              })()}
                              <Calendar className="w-3.5 h-3.5 text-purple-300" />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">{f.name}</div>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono shrink-0">time</div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <PowerBIFieldTree
                  model={filteredModel}
                  semanticModelV1Local={semanticModelV1Local}
                  selectedKeys={selectedKeys}
                  onToggle={toggleField}
                />
              </div>
            )}

          {!hasSemanticFields && !filteredModel && !schemaLoading && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">No schema loaded</div>
            </div>
          )}
          {!hasSearchResults && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="text-sm text-slate-300">No fields match "{searchTerm.trim()}".</div>
            </div>
          )}
          </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PowerBIFieldTree({
  model,
  semanticModelV1Local,
  selectedKeys,
  onToggle,
}: {
  model: SemanticModel;
  semanticModelV1Local: SemanticModelV1 | null;
  selectedKeys: Set<string>;
  onToggle: (field: { name: string; table: string; type: string }, sourceType: "timeField" | "dimension" | "measure") => void;
}) {
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const byTable = useMemo(() => {
    const map = new Map<string, Array<{ name: string; table: string; type: string; sourceType: "timeField" | "dimension" | "measure" }>>();
    const ensure = (table: string) => {
      const key = String(table ?? "");
      if (!map.has(key)) map.set(key, []);
      return map.get(key)!;
    };
    for (const f of model.timeFields ?? []) ensure(f.table).push({ ...f, sourceType: "timeField" });
    for (const f of model.dimensions ?? []) ensure(f.table).push({ ...f, sourceType: "dimension" });
    for (const f of model.measures ?? []) ensure(f.table).push({ ...f, sourceType: "measure" });
    return Array.from(map.entries())
      .filter(([t]) => !!String(t).trim())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([table, fields]) => ({
        table,
        fields: fields.sort((x, y) => String(x.name).localeCompare(String(y.name))),
      }));
  }, [model]);

  const handleDragStart = (e: React.DragEvent, f: { name: string; table: string; type: string }, sourceType: "timeField" | "dimension" | "measure") => {
    e.dataTransfer.effectAllowed = "copy";
    const semanticRef = resolveSemanticRef(semanticModelV1Local, f.table, f.name);
    const ref = semanticRef || toFieldRef({ name: f.name, table: f.table });
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        name: f.name,
        table: f.table,
        ref,
        kind: "db-field",
        fieldType: sourceType === "measure" ? "measure" : (sourceType === "timeField" ? "time" : "dimension"),
        semanticType: String(f.type ?? ""),
        column: {
          name: f.name,
          table: f.table,
          type: f.type,
          classification: sourceType,
          ref,
        },
        sourceType,
      })
    );
  };

  const renderField = (
    f: { name: string; table: string; type: string; sourceType: "timeField" | "dimension" | "measure" }
  ) => {
    const key = resolveSemanticRef(semanticModelV1Local, f.table, f.name) || toFieldRef({ name: f.name, table: f.table });
    const checked = selectedKeys.has(key);
    const icon = f.sourceType === "timeField"
      ? <Calendar className="w-3.5 h-3.5 text-purple-300" />
      : f.sourceType === "measure"
        ? <Hash className="w-3.5 h-3.5 text-emerald-300" />
        : <Database className="w-3.5 h-3.5 text-slate-400" />;
    const typeDotClass = f.sourceType === "measure"
      ? "bg-emerald-400/80"
      : f.sourceType === "timeField"
        ? "bg-purple-400/80"
        : "bg-blue-400/80";
    return (
      <div
        key={`${f.table}.${f.name}`}
        draggable
        onDragStart={(e) => handleDragStart(e, f, f.sourceType)}
        data-testid="field-item"
        data-field-ref={key}
        data-field-name={f.name}
        data-field-table={f.table}
        data-field-type={f.sourceType}
        className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(f, f.sourceType);
            }}
            className={`w-4 h-4 rounded border shrink-0 transition-colors ${
              checked
                ? "bg-emerald-500/30 border-emerald-400/60"
                : "bg-white/5 border-white/15 hover:border-white/30"
            }`}
            aria-pressed={checked}
            title="Add/remove"
          >
            {checked ? <span className="block w-full h-full text-[10px] leading-[14px] text-emerald-200">✓</span> : null}
          </button>
          {icon}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{f.name}</div>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 font-mono shrink-0">{String(f.type).split("(")[0]}</div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${typeDotClass}`} title={f.sourceType} />
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {byTable.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-slate-400">No fields</div>
        </div>
      )}

      {byTable.map(({ table, fields }) => {
        const tableExpanded = expandedTables[table] ?? true;

        return (
          <div key={table} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedTables((prev) => ({ ...prev, [table]: !tableExpanded }))}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 min-w-0">
                <span className="truncate">{table}</span>
              </div>
              <div className="text-xs text-slate-400">{tableExpanded ? "−" : "+"}</div>
            </button>

            {tableExpanded && (
              <div className="px-3 pb-3">
                <div className="px-1 pt-2 pb-1 space-y-1">
                  {fields.length === 0 ? <div className="text-xs text-slate-500 px-2 py-2">No fields</div> : fields.map((f) => renderField(f))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
