"use client";

import { Layers, Plus, Loader2, RefreshCw, Search, Calendar, Database, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnectionState } from "../../providers";
import { useSemanticModel } from "../../context/SemanticModelContext";
import { SchemaIntelligenceService } from "../../lib/schema-intelligence";
import { wellsToLogicalQuery } from "../../lib/semantic/wellsToLogicalQuery";
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
  let mdl = modelName ? (modelsObj as any)[modelName] : null;
  if (!mdl || typeof mdl !== "object") {
    mdl = (modelsObj as any)[t] ?? null;
  }
  if (!mdl || typeof mdl !== "object") {
    const lc = t.toLowerCase();
    const match = Object.keys(modelsObj).find((k) => k.toLowerCase() === lc || safeKey(k).toLowerCase() === lc);
    mdl = match ? (modelsObj as any)[match] : null;
  }
  if (!mdl || typeof mdl !== "object") return "";
  const resolvedModelName = (() => {
    if (modelName && (modelsObj as any)[modelName]) return modelName;
    if ((modelsObj as any)[t]) return t;
    const lc = t.toLowerCase();
    return Object.keys(modelsObj).find((k) => k.toLowerCase() === lc || safeKey(k).toLowerCase() === lc) ?? t;
  })();

  const dims = mdl?.dimensions && typeof mdl.dimensions === "object" ? Object.keys(mdl.dimensions) : [];
  const meas = mdl?.measures && typeof mdl.measures === "object" ? Object.keys(mdl.measures) : [];
  const all = [...dims, ...meas];
  if (all.length === 0) return "";

  const key = safeKey(c) || c;
  const direct = all.find((k) => k === c) || all.find((k) => k === key);
  if (direct) return `${resolvedModelName}.${direct}`;

  const lc = c.toLowerCase();
  const ci = all.find((k) => String(k).toLowerCase() === lc);
  if (ci) return `${resolvedModelName}.${ci}`;
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
  /** Default: only tables/columns from the active DB connection. "full" adds semantic model (when not demo placeholder) and Advanced. */
  const [fieldsSource, setFieldsSource] = useState<"physical" | "full">(() => {
    try {
      const v = String(window.localStorage.getItem("dashboard:fieldsSource") ?? "").trim();
      if (v === "full") return "full";
    } catch {}
    return "physical";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("dashboard:fieldsSource", fieldsSource);
    } catch {}
  }, [fieldsSource]);

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

  /** Legacy demo binding: single model named "events" — not shown in Fields (use physical schema / bootstrap). */
  const isDemoSemanticPlaceholder = useMemo(() => {
    const m = semanticModelV1Local as any;
    const modelsObj = m?.models;
    if (!modelsObj || typeof modelsObj !== "object") return false;
    const keys = Object.keys(modelsObj);
    return keys.length === 1 && keys[0] === "events";
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
    const sels = a && a.fieldParameterSelections && typeof a.fieldParameterSelections === "object" ? a.fieldParameterSelections : null;
    if (!fps) return [] as Array<{ id: string; name: string; kind: FieldParameterKind; count: number; defaultRef: string }>;
    return Object.keys(fps)
      .map((k) => {
        const fp = (fps as any)[k];
        const id = String(fp?.id ?? k).trim() || String(k);
        const name = String(fp?.name ?? id).trim() || id;
        const kind: FieldParameterKind = (String(fp?.kind ?? "measure") === "dimension") ? "dimension" : "measure";
        const count = Array.isArray(fp?.items) ? fp.items.length : 0;
        const fromSel = String((sels as any)?.[id]?.ref ?? (sels as any)?.[String(id).toLowerCase()]?.ref ?? "").trim();
        const fromItems = Array.isArray(fp?.items) ? String(fp.items.find((x: any) => String(x?.ref ?? "").trim())?.ref ?? "").trim() : "";
        return { id, name, kind, count, defaultRef: fromSel || fromItems };
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

  const editListParameter = (id: string) => {
    const key = String(id ?? "").trim();
    if (!key || !semanticArtifacts || typeof semanticArtifacts !== "object") return;
    const p = (semanticArtifacts as any)?.parameters?.[key];
    if (!p || typeof p !== "object") return;
    const currentName = String(p?.name ?? key).trim() || key;
    const currentValues = Array.isArray(p?.values) ? p.values.map((v: any) => String(v)).join(", ") : "";
    const nextName = window.prompt("Parameter name", currentName);
    if (nextName == null) return;
    const nextValuesRaw = window.prompt("Values (comma/newline separated)", currentValues);
    if (nextValuesRaw == null) return;
    const nextValues = parseValues(nextValuesRaw);
    const base = ((semanticArtifacts as any)?.parameters && typeof (semanticArtifacts as any).parameters === "object")
      ? (semanticArtifacts as any).parameters
      : {};
    const nextParams = {
      ...base,
      [key]: {
        ...p,
        id: key,
        name: String(nextName).trim() || currentName,
        values: nextValues,
      },
    };
    window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch: { parameters: nextParams } } }));
  };

  const deleteListParameter = (id: string) => {
    const key = String(id ?? "").trim();
    if (!key || !semanticArtifacts || typeof semanticArtifacts !== "object") return;
    if (!window.confirm(`Delete parameter "${key}"?`)) return;
    const base = ((semanticArtifacts as any)?.parameters && typeof (semanticArtifacts as any).parameters === "object")
      ? (semanticArtifacts as any).parameters
      : {};
    const nextEntries = Object.keys(base)
      .filter((k) => k !== key)
      .reduce((acc: Record<string, any>, k) => {
        acc[k] = (base as any)[k];
        return acc;
      }, {});
    window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch: { parameters: nextEntries } } }));
  };

  const editFieldParameter = (id: string) => {
    const key = String(id ?? "").trim();
    if (!key || !semanticArtifacts || typeof semanticArtifacts !== "object") return;
    const fp = (semanticArtifacts as any)?.fieldParameters?.[key];
    if (!fp || typeof fp !== "object") return;
    const currentName = String(fp?.name ?? key).trim() || key;
    const currentKind = String(fp?.kind ?? "measure") === "dimension" ? "dimension" : "measure";
    const currentRefs = Array.isArray(fp?.items)
      ? fp.items.map((x: any) => String(x?.ref ?? "").trim()).filter(Boolean).join("\n")
      : "";
    const nextName = window.prompt("Field parameter name", currentName);
    if (nextName == null) return;
    const nextKindRaw = window.prompt("Kind (measure|dimension)", currentKind);
    if (nextKindRaw == null) return;
    const nextRefsRaw = window.prompt("Refs (Model.field, comma/newline)", currentRefs);
    if (nextRefsRaw == null) return;
    const nextRefs = parseRefs(nextRefsRaw);
    if (nextRefs.length === 0) return;
    const nextKind: FieldParameterKind = String(nextKindRaw).trim() === "dimension" ? "dimension" : "measure";
    const base = ((semanticArtifacts as any)?.fieldParameters && typeof (semanticArtifacts as any).fieldParameters === "object")
      ? (semanticArtifacts as any).fieldParameters
      : {};
    const nextFieldParams = {
      ...base,
      [key]: {
        ...fp,
        id: key,
        name: String(nextName).trim() || currentName,
        kind: nextKind,
        items: nextRefs.map((ref, idx) => ({ ref, label: ref, order: idx })),
      },
    };
    window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch: { fieldParameters: nextFieldParams } } }));
  };

  const deleteFieldParameter = (id: string) => {
    const key = String(id ?? "").trim();
    if (!key || !semanticArtifacts || typeof semanticArtifacts !== "object") return;
    if (!window.confirm(`Delete field parameter "${key}"?`)) return;
    const base = ((semanticArtifacts as any)?.fieldParameters && typeof (semanticArtifacts as any).fieldParameters === "object")
      ? (semanticArtifacts as any).fieldParameters
      : {};
    const nextEntries = Object.keys(base)
      .filter((k) => k !== key)
      .reduce((acc: Record<string, any>, k) => {
        acc[k] = (base as any)[k];
        return acc;
      }, {});
    window.dispatchEvent(new CustomEvent("dashboard:update-semantic-artifacts", { detail: { patch: { fieldParameters: nextEntries } } }));
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
    // Always load physical schema when a connection exists, even if a semantic model is bound,
    // so Direct SQL charts can map axes to real table.column refs from introspection.
    if (!activeConnection?.id) {
      setSemanticModel(null);
      setSchemaError(null);
      setSchemaLoading(false);
      return;
    }
    void loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id]);

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
    try {
      window.dispatchEvent(new CustomEvent("dashboard:request-active-chart"));
    } catch {}
    return () => {
      window.removeEventListener("dashboard:active-chart-id", onActiveChartId as EventListener);
      window.removeEventListener("dashboard:update-chart-data", onChartDataPatched as EventListener);
    };
  }, []);

  const selectedKeys = useMemo(() => {
    const m = activeChartMapping;
    const set = new Set<string>();
    const add = (v: any) => {
      const s = String(v ?? "").trim();
      if (s) set.add(s);
    };
    const lq = ((activeChartData as any)?.logicalQuery && typeof (activeChartData as any).logicalQuery === "object")
      ? (activeChartData as any).logicalQuery
      : null;
    for (const d of Array.isArray((lq as any)?.dimensions) ? (lq as any).dimensions : []) add(d);
    for (const mm of Array.isArray((lq as any)?.measures) ? (lq as any).measures : []) add(mm);
    const slicerFieldRef = String((activeChartData as any)?.slicer?.fieldRef ?? "").trim();
    if (slicerFieldRef) set.add(slicerFieldRef);
    if (!m) return set;
    add((m as any).xColumn);
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
  }, [activeChartMapping, activeChartData]);

  /** Columns from the DB table bound to the active chart (Connect to chart). Plain names for Visualizations → Axis / Y when they match SQL output. */
  const chartBoundSqlColumns = useMemo(() => {
    const cd = activeChartData;
    if (!cd || String((cd as any).kind ?? "").trim() !== "db-table") {
      return [] as Array<{ name: string; ref: string; fieldType: "dimension" | "measure" | "time"; typeLabel: string }>;
    }
    const cm = (cd as any).columnsMeta;
    if (!Array.isArray(cm) || cm.length === 0) return [];
    const out: Array<{ name: string; ref: string; fieldType: "dimension" | "measure" | "time"; typeLabel: string }> = [];
    for (const c of cm) {
      const name = String((c as any)?.name ?? "").trim();
      if (!name) continue;
      const t = String((c as any)?.type ?? "").toLowerCase();
      const isNum = /int|numeric|decimal|float|double|real|serial|money|bigint/.test(t);
      const isTime = /date|time/.test(t);
      const fieldType: "dimension" | "measure" | "time" = isTime ? "time" : isNum ? "measure" : "dimension";
      out.push({ name, ref: name, fieldType, typeLabel: t || "string" });
    }
    return out;
  }, [activeChartData]);

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

    const isSelected = selectedKeys.has(col) || (!!legacyRef && selectedKeys.has(legacyRef));
    const activeKind = String((activeChartData as any)?.kind ?? "").trim().toLowerCase();
    const isSlicer = activeKind === "slicer" || String((activeChartData as any)?.name ?? "").trim().toLowerCase() === "slicer";

    if (isSlicer) {
      const currentSlicer = ((activeChartData as any)?.slicer && typeof (activeChartData as any).slicer === "object")
        ? (activeChartData as any).slicer
        : {};
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: cid,
            patch: {
              kind: "slicer",
              slicer: {
                ...currentSlicer,
                fieldRef: isSelected ? "" : col,
              },
            },
          },
        })
      );
      return;
    }

    const prev = (activeChartMapping && typeof activeChartMapping === "object") ? activeChartMapping : ({} as ColumnMappingLike);
    const effectiveVizType = (() => {
      const cfg = String((activeChartData as any)?.chartConfig?.general?.vizType ?? "").trim().toLowerCase();
      const legacy = String((activeChartData as any)?.__forceVizType ?? "").trim().toLowerCase();
      const v = cfg || legacy;
      return (v || "line") as any;
    })();
    const sourceModel = String((activeChartData as any)?.logicalQuery?.sourceModel ?? "").trim();

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
      const nextLogicalQuery = wellsToLogicalQuery({
        vizType: effectiveVizType,
        mapping: next,
        sourceModel,
        semanticModel: semanticModelV1Local,
        prevLogicalQuery: ((activeChartData as any)?.logicalQuery && typeof (activeChartData as any).logicalQuery === "object")
          ? (activeChartData as any).logicalQuery
          : undefined,
      });
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: activeChartId,
            patch: {
              columnMapping: next,
              ...(nextLogicalQuery ? { logicalQuery: nextLogicalQuery } : {}),
            },
          },
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

    const nextLogicalQuery = wellsToLogicalQuery({
      vizType: effectiveVizType,
      mapping: next,
      sourceModel,
      semanticModel: semanticModelV1Local,
      prevLogicalQuery: ((activeChartData as any)?.logicalQuery && typeof (activeChartData as any).logicalQuery === "object")
        ? (activeChartData as any).logicalQuery
        : undefined,
    });
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: {
          chartId: cid,
          patch: {
            columnMapping: next,
            ...(nextLogicalQuery ? { logicalQuery: nextLogicalQuery } : {}),
          },
        },
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

    if (fieldsSource === "physical") {
      const match = (name: string, table: string) => {
        const n = String(name ?? "").toLowerCase();
        const t = String(table ?? "").toLowerCase();
        return n.includes(term) || t.includes(term);
      };
      let physicalHits = 0;
      if (filteredModel) {
        for (const f of filteredModel.timeFields ?? []) {
          if (match(f.name, f.table)) physicalHits += 1;
        }
        for (const f of filteredModel.dimensions ?? []) {
          if (match(f.name, f.table)) physicalHits += 1;
        }
        for (const f of filteredModel.measures ?? []) {
          if (match(f.name, f.table)) physicalHits += 1;
        }
      }
      const boundHits = chartBoundSqlColumns.filter(
        (c) => String(c.ref).toLowerCase().includes(term) || String(c.name).toLowerCase().includes(term)
      ).length;
      return physicalHits + boundHits > 0;
    }

    const semanticHits = isDemoSemanticPlaceholder
      ? 0
      : semanticTree.reduce((acc, t) => acc + t.dimensions.length + t.measures.length, 0);
    const basicHits = (filteredModel?.timeFields?.length ?? 0) + (filteredModel?.dimensions?.length ?? 0) + (filteredModel?.measures?.length ?? 0);
    return semanticHits + basicHits > 0;
  }, [searchTerm, semanticTree, filteredModel, fieldsSource, chartBoundSqlColumns, isDemoSemanticPlaceholder]);

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
                <div className="text-xs text-slate-400 truncate">
                  {fieldsSource === "physical"
                    ? "Connected database (physical schema)"
                    : "Semantic model (if bound), DB schema, Advanced parameters"}
                </div>
                <div className="flex flex-wrap gap-1 mt-2" role="group" aria-label="Fields source">
                  <button
                    type="button"
                    onClick={() => setFieldsSource("physical")}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition ${
                      fieldsSource === "physical"
                        ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                    title="Only tables and columns from the active connection"
                  >
                    Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setFieldsSource("full")}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition ${
                      fieldsSource === "full"
                        ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                    title="Semantic model (non-demo), physical schema, Advanced parameters"
                  >
                    Full
                  </button>
                </div>
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
            {chartBoundSqlColumns.length > 0 && (
              <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3 space-y-2">
                <div className="text-[11px] font-semibold text-sky-200/90 uppercase tracking-wider">
                  Bound table columns
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  From the table you attached with <span className="font-semibold text-slate-400">Connect to chart</span>. Drag into Visualizations → Axis (X) / Y when your SQL uses the same column names. Aliases only in SQL (e.g. <span className="font-mono text-slate-400">day</span>) are not listed here — set those in Chart configuration or use a matching alias.
                </p>
                <div className="space-y-1">
                  {chartBoundSqlColumns.map((c) => (
                    <div
                      key={`bound.${c.ref}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({
                            ref: c.ref,
                            name: c.name,
                            fieldType: c.fieldType,
                            semanticType: c.typeLabel,
                          })
                        );
                      }}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing border border-white/5"
                      title={`Drag to Visualizations (ref: ${c.ref})`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Database className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate font-mono">{c.ref}</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono shrink-0">{c.fieldType}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fieldsSource === "physical" ? (
              <>
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

                {!!activeConnection?.id && !schemaLoading && !schemaError && filteredModel && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Database tables</div>
                    <PowerBIFieldTree
                      model={filteredModel}
                      semanticModelV1Local={semanticModelV1Local}
                      selectedKeys={selectedKeys}
                      onToggle={toggleField}
                    />
                  </div>
                )}

                {!!activeConnection?.id && !schemaLoading && !schemaError && !filteredModel && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-slate-400">No schema loaded</div>
                  </div>
                )}
              </>
            ) : (
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

            {fieldsSource === "full" && showAdvanced && (
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
                        <span className="flex h-3.5 w-3.5 items-center justify-center text-[10px] font-mono text-sky-300" title="Parameter">@</span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-[11px] text-slate-500 font-mono">{p.kind}:{p.valuesCount}</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            editListParameter(p.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-white/10 text-slate-300 hover:bg-white/10"
                          title="Edit parameter"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteListParameter(p.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                          title="Delete parameter"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {fieldsSource === "full" && (
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
                          JSON.stringify({
                            kind: "semantic-field-parameter",
                            fieldParameterId: fp.id,
                            name: fp.name,
                            ref: fp.defaultRef || fp.name,
                            fieldType: fp.kind,
                          })
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
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-[11px] text-slate-500 font-mono">{fp.kind}:{fp.count}</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            editFieldParameter(fp.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-white/10 text-slate-300 hover:bg-white/10"
                          title="Edit field parameter"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteFieldParameter(fp.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                          title="Delete field parameter"
                        >
                          Del
                        </button>
                      </div>
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

            {hasSemanticFields && semanticTree.length > 0 && !isDemoSemanticPlaceholder && (
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
                                    <span className="w-3.5 h-3.5 flex items-center justify-center text-[11px] font-semibold text-emerald-300 leading-none" title="Measure">Σ</span>
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

            {!!activeConnection?.id && !schemaLoading && !schemaError && filteredModel && (
              <div className="space-y-3">
                <PowerBIFieldTree
                  model={filteredModel}
                  semanticModelV1Local={semanticModelV1Local}
                  selectedKeys={selectedKeys}
                  onToggle={toggleField}
                />
              </div>
            )}

          {(!hasSemanticFields || isDemoSemanticPlaceholder) && !filteredModel && !schemaLoading && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">No schema loaded</div>
            </div>
          )}
              </>
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
    const legacyRef = toFieldRef({ name: f.name, table: f.table });
    const key = resolveSemanticRef(semanticModelV1Local, f.table, f.name) || legacyRef;
    const checked = selectedKeys.has(key) || selectedKeys.has(legacyRef);
    const icon = f.sourceType === "timeField"
      ? <Calendar className="w-3.5 h-3.5 text-purple-300" />
      : f.sourceType === "measure"
        ? <span className="flex h-3.5 w-3.5 items-center justify-center text-[11px] font-semibold leading-none text-emerald-300" title="Measure">Σ</span>
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
        className="flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(f, f.sourceType);
            }}
            className={`w-[18px] h-[18px] rounded border shrink-0 transition-colors ${
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
        <div className="text-[10px] text-slate-500/70 font-mono shrink-0 max-w-[4rem] truncate" title={String(f.type)}>{String(f.type).split("(")[0]}</div>
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
                <Table2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
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
