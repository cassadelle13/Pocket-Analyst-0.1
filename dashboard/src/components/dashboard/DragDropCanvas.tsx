"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PlusIcon } from "lucide-react";
import { ChartPreview } from "./ChartPreview";
import { ChartWindow } from "./ChartWindow";
import CanvasNodeView from "./CanvasNodeView";
import { DashboardDock } from "./DashboardDock";
import { ChartConfigModal } from "../chart-config/ChartConfigModal";
import { ExplainChartModal } from "./ExplainChartModal";
import { MiniMap } from "./MiniMap";
import type { ChartConfig, ChartType } from "../../types/chart-config";
import { loadProject, saveProject, updateProject } from "../../lib/projectsStorage";
import {
  CANVAS_BACKGROUND_CHANGED_EVENT,
  getCanvasBackground,
  getCanvasBackgroundAnimation,
  getCanvasBackgroundBlurEnabled,
  getCanvasBackgroundDarken,
} from "../../lib/canvasBackgroundStorage";
import { loadBackgroundMedia } from "../../lib/backgroundMediaStorage";
import { classifyFieldRef, uiAggToAggFn } from "../../lib/semantic/fieldClassifier";
import { useGlobalFilters } from "../../store/globalFiltersContext";

interface CanvasNode {
  id: string;
  type: string;
  name: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: any;
}

interface DragDropCanvasProps {
  storageKey?: string;
  projectId?: string;
  activeTabId?: string | null;
}

export function DragDropCanvas({ storageKey, projectId, activeTabId }: DragDropCanvasProps) {
  const { setDateRange } = useGlobalFilters();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  activeNodeIdRef.current = activeNodeId;

  const [semanticArtifacts, setSemanticArtifacts] = useState<any>(null);

  useEffect(() => {
    try {
      const payload = (semanticArtifacts && typeof semanticArtifacts === "object") ? semanticArtifacts : null;
      window.dispatchEvent(
        new CustomEvent("dashboard:semantic-artifacts", {
          detail: { semanticArtifacts: payload },
        })
      );
    } catch {}
  }, [semanticArtifacts]);

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:active-tab-id", {
          detail: { activeTabId: activeTabId ? String(activeTabId) : null },
        })
      );
    } catch {}
  }, [activeTabId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail ?? {};
      const start = String((detail as any)?.start ?? "").trim();
      const end = String((detail as any)?.end ?? "").trim();
      if (!start || !end) return;
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
      setDateRange({ start: startDate, end: endDate });
    };

    window.addEventListener("dashboard:set-global-date-range", handler as EventListener);
    return () => window.removeEventListener("dashboard:set-global-date-range", handler as EventListener);
  }, [setDateRange]);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:project-changed", {
          detail: { projectId: projectId ? String(projectId) : null },
        })
      );
    } catch {}

    try {
      const pid = String(projectId ?? "").trim();
      if (pid) window.localStorage.setItem("dashboard:semantic:projectId", pid);
    } catch {}
  }, [projectId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const patch = detail?.patch;
      if (!patch || typeof patch !== "object") return;
      setSemanticArtifacts((prev: any) => {
        const base = (prev && typeof prev === "object") ? prev : {};
        const next: any = { ...base };
        for (const k of Object.keys(patch)) {
          const pv = (patch as any)[k];
          const bv = (base as any)[k];
          if (pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object" && !Array.isArray(bv)) {
            next[k] = { ...bv, ...pv };
          } else {
            next[k] = pv;
          }
        }
        return next;
      });
    };
    window.addEventListener("dashboard:update-semantic-artifacts", handler as EventListener);
    return () => window.removeEventListener("dashboard:update-semantic-artifacts", handler as EventListener);
  }, []);

  const semanticBootstrapAttemptedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const pid = String(projectId ?? "").trim();
    if (!pid) return;
    if (semanticBootstrapAttemptedRef.current[pid]) return;
    semanticBootstrapAttemptedRef.current[pid] = true;

    void (async () => {
      try {
        const bindingRes = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
        const bindingJson = await bindingRes.json().catch(() => ({}));
        const modelJson = bindingJson?.data?.model?.model_json ?? null;
        const modelsObj = modelJson && typeof modelJson === "object" ? (modelJson as any)?.models : null;
        const modelKeys = modelsObj && typeof modelsObj === "object" ? Object.keys(modelsObj) : [];
        const isDemo = modelKeys.length === 1 && modelKeys[0] === "events";
        const hasBinding = !!String(bindingJson?.data?.binding?.semantic_model_id ?? "").trim();

        if (!hasBinding || isDemo) {
          const statusRes = await fetch("/api/connection/status", { cache: "no-store" }).catch(() => null);
          const statusJson = statusRes ? await statusRes.json().catch(() => ({})) : {};
          const connectionId = String(statusJson?.connection?.id ?? "").trim();

          await fetch("/api/semantic/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: pid, ...(connectionId ? { connectionId } : {}) }),
            cache: "no-store",
          }).catch(() => null);
        }
      } catch {}
    })();
  }, [projectId]);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isResizingNode, setIsResizingNode] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Refs to avoid relying on async state updates for interaction mode.
  const isPanningRef = useRef(false);
  const isDraggingNodeRef = useRef(false);
  const isResizingNodeRef = useRef(false);
  const draggedNodeRef = useRef<string | null>(null);
  const interactionRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDragRef = useRef<{ nodeId: string; x: number; y: number } | null>(null);
  const pendingResizeRef = useRef<{
    nodeId: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null>(null);
  const nodesRef = useRef<CanvasNode[]>(nodes);
  nodesRef.current = nodes;
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvasBg, setCanvasBg] = useState<string>("");
  const [canvasBlurEnabled, setCanvasBlurEnabled] = useState(true);
  const [canvasDarken, setCanvasDarken] = useState(0.35);
  const [canvasAnimMeta, setCanvasAnimMeta] = useState<{ id: string; mime: string } | null>(null);
  const [canvasAnimUrl, setCanvasAnimUrl] = useState<string>("");

  useEffect(() => {
    setCanvasBg(getCanvasBackground());
    setCanvasBlurEnabled(getCanvasBackgroundBlurEnabled());
    setCanvasDarken(getCanvasBackgroundDarken());
    setCanvasAnimMeta(getCanvasBackgroundAnimation());
    const handler = () => {
      setCanvasBg(getCanvasBackground());
      setCanvasBlurEnabled(getCanvasBackgroundBlurEnabled());
      setCanvasDarken(getCanvasBackgroundDarken());
      setCanvasAnimMeta(getCanvasBackgroundAnimation());
    };
    window.addEventListener(CANVAS_BACKGROUND_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CANVAS_BACKGROUND_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "").trim();
      if (!chartId) return;
      setNodes((prev) => prev.filter((n) => n.id !== chartId));
      setActiveNodeId((prev) => (prev === chartId ? null : prev));
    };
    window.addEventListener("dashboard:delete-node", handler as EventListener);
    return () => window.removeEventListener("dashboard:delete-node", handler as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!canvasAnimMeta?.id) {
        setCanvasAnimUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return "";
        });
        return;
      }
      try {
        const rec = await loadBackgroundMedia(canvasAnimMeta.id);
        if (cancelled) return;
        if (!rec?.blob) return;
        const nextUrl = URL.createObjectURL(rec.blob);
        setCanvasAnimUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } catch {
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [canvasAnimMeta?.id]);

  const downscaleDataUrlToJpeg = useCallback((dataUrl: string, targetW: number, targetH: number, quality: number) => {
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, targetW, targetH);

          // Cover fit (like CSS object-fit: cover)
          const scale = Math.max(targetW / img.width, targetH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const dx = (targetW - drawW) / 2;
          const dy = (targetH - drawH) / 2;
          ctx.drawImage(img, dx, dy, drawW, drawH);

          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Failed to load thumbnail image'));
      img.src = dataUrl;
    });
  }, []);

  // Chart Config Modal state
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configModalData, setConfigModalData] = useState<{
    chartId: string;
    chartType: ChartType;
    chartName: string;
    currentConfig: Partial<ChartConfig>;
    chartData?: any;
  } | null>(null);

  // Explain Chart Modal state
  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [explainModalData, setExplainModalData] = useState<{
    chartData?: any;
    chartConfig?: any;
  } | null>(null);

  const configModalPrevConfigRef = useRef<Partial<ChartConfig> | null>(null);
  const configModalSavedRef = useRef(false);

  // Edit mode state (synced from DashboardDock)
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(!!detail?.isEditMode);
    };
    window.addEventListener('dashboard:edit-mode-changed', handler);
    return () => window.removeEventListener('dashboard:edit-mode-changed', handler);
  }, []);

  // Center button interaction state
  const isMouseInCanvasRef = useRef(false);
  const centerButtonRef = useRef<HTMLDivElement>(null);
  const centerButtonIconWrapRef = useRef<HTMLSpanElement>(null);
  const centerButtonMouseRef = useRef({ x: 0, y: 0 });
  const centerButtonRectRef = useRef<DOMRect | null>(null);
  const centerButtonRafRef = useRef<number | null>(null);

  // Persist nodes (layout, titles) per dashboard
  useEffect(() => {
    try {
      const key = typeof storageKey === "string" ? storageKey : "";
      if (!key) return;
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CanvasNode>[];
      if (Array.isArray(parsed)) {
        const normalized: CanvasNode[] = parsed.map((n, i) => ({
          id: String(n.id ?? `node-${Date.now()}-${i}`),
          type: String(n.type ?? n?.name ?? 'Unknown'),
          name: String(n.name ?? 'Untitled'),
          title: String((n as any).title ?? n.name ?? 'Untitled'),
          position: n.position ?? { x: 0, y: 0 },
          size: n.size ?? { width: 560, height: 360 },
          data: n.data ?? {},
        }));

        setNodes(normalized);
        setActiveNodeId(null);
      }
    } catch {}
  }, [storageKey]);

  // Load a saved project (Home → My Projects) into this canvas
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const p = await loadProject(projectId);
      if (!p) return;

      const parsed = Array.isArray(p.nodes) ? (p.nodes as Partial<CanvasNode>[]) : [];
      const normalized: CanvasNode[] = parsed.map((n, i) => ({
        id: String(n.id ?? `node-${Date.now()}-${i}`),
        type: String(n.type ?? (n as any)?.name ?? 'Unknown'),
        name: String((n as any).name ?? 'Untitled'),
        title: String((n as any).title ?? (n as any).name ?? 'Untitled'),
        position: (n as any).position ?? { x: 0, y: 0 },
        size: (n as any).size ?? { width: 560, height: 360 },
        data: (n as any).data ?? {},
      }));

      setNodes(normalized);
      setActiveNodeId(null);

      setSemanticArtifacts((p as any)?.semanticArtifacts ?? null);

      const nextPan = (p.viewport && typeof p.viewport === 'object') ? (p.viewport as any).pan : null;
      const nextZoom = (p.viewport && typeof p.viewport === 'object') ? (p.viewport as any).zoom : null;
      if (nextPan && typeof nextPan.x === 'number' && typeof nextPan.y === 'number') {
        setPan({ x: nextPan.x, y: nextPan.y });
      }
      if (typeof nextZoom === 'number' && !Number.isNaN(nextZoom)) {
        setZoom(Math.min(3, Math.max(0.1, nextZoom)));
      }
    })();
  }, [projectId]);

  useEffect(() => {
    try {
      const chartId = activeNodeId ? String(activeNodeId) : null;
      const node = chartId ? nodes.find((n) => n.id === chartId) : null;
      const chartData = (node && node.data && typeof node.data === "object") ? node.data : null;
      window.dispatchEvent(
        new CustomEvent("dashboard:active-chart-id", {
          detail: { chartId, chartData, activeTabId: activeTabId ? String(activeTabId) : null },
        })
      );
    } catch {}
  }, [activeNodeId, nodes, activeTabId]);

  useEffect(() => {
    try {
      const key = typeof storageKey === "string" ? storageKey : "";
      if (!key) return;
      window.localStorage.setItem(key, JSON.stringify(nodes));
    } catch {}
  }, [nodes, storageKey]);

  // Track canvas size for minimap
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize({ width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Listen for minimap toggle events
  useEffect(() => {
    const handler = () => setMiniMapOpen(prev => !prev);
    window.addEventListener('dashboard:toggle-minimap', handler);
    return () => window.removeEventListener('dashboard:toggle-minimap', handler);
  }, []);

  const resolveChartType = useCallback((node: CanvasNode): ChartType => {
    const s = `${node?.type ?? ""} ${node?.name ?? ""} ${node?.title ?? ""}`.toLowerCase();
    if (s.includes('retention')) return 'echarts';
    if (s.includes('sankey') || s.includes('user flow')) return 'sankey';
    if (s.includes('funnel')) return 'funnel';
    if (s.includes('line (time series)') || s.includes('trend chart') || s.includes('uplot')) return 'uplot';
    return 'echarts';
  }, []);

  // Track configModalOpen in a ref so the event handler always sees current value
  const configModalOpenRef = useRef(configModalOpen);
  configModalOpenRef.current = configModalOpen;
  const configModalDataRef = useRef(configModalData);
  configModalDataRef.current = configModalData;

  // Listen for manual-config toggle events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = detail?.chartId;

      // If already open for this chart — close (toggle off)
      if (configModalOpenRef.current && configModalDataRef.current?.chartId === chartId) {
        setConfigModalOpen(false);
        window.dispatchEvent(new CustomEvent('chart:config-state-changed', { detail: { open: false } }));
        return;
      }

      if (chartId) {
        const node = nodes.find(n => n.id === chartId);
        if (node) {
          const existingConfig = (node.data && typeof node.data === 'object') ? (node.data as any).chartConfig : null;
          configModalPrevConfigRef.current = (existingConfig && typeof existingConfig === 'object') ? existingConfig : null;
          configModalSavedRef.current = false;
          setConfigModalData({
            chartId: node.id,
            chartType: resolveChartType(node),
            chartName: node.title || node.name,
            currentConfig: (existingConfig && typeof existingConfig === 'object') ? existingConfig : {},
            chartData: (node.data && typeof node.data === 'object') ? node.data : undefined,
          });
          setConfigModalOpen(true);
          window.dispatchEvent(new CustomEvent('chart:config-state-changed', { detail: { open: true } }));
        }
      }
    };
    window.addEventListener('chart:manual-config', handler);
    return () => window.removeEventListener('chart:manual-config', handler);
  }, [nodes, resolveChartType]);

  // Listen for chart:explain event from BaseChart
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = detail?.chartId;
      const option = detail?.option;

      if (!chartId) return;

      const node = nodes.find((n) => n.id === chartId);
      if (node) {
        setExplainModalData({
          chartData: node.data,
          chartConfig: option,
        });
        setExplainModalOpen(true);
      }
    };

    window.addEventListener("chart:explain", handler as EventListener);
    return () => window.removeEventListener("chart:explain", handler as EventListener);
  }, [nodes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "");
      const patch = detail?.patch;
      if (!chartId || !patch || typeof patch !== "object") return;

      // If mapping changes, keep semantic query in sync (Power BI-like: visuals always query via semantic model).
      // IMPORTANT: apply semanticModelId/logicalQuery directly into the node patch. Do NOT rely on nested dispatch,
      // otherwise it can race with the setNodes update and never persist.
      const patchWithSemantic: any = { ...patch };
      try {
        const pid = String(projectId ?? "").trim();
        const mappingPatch = Object.prototype.hasOwnProperty.call(patch, "columnMapping") ? (patch as any).columnMapping : null;
        const isDbTablePatch = Object.prototype.hasOwnProperty.call(patch, "kind") ? String((patch as any).kind) === "db-table" : false;
        if (pid && mappingPatch && typeof mappingPatch === "object" && isDbTablePatch) {
          void (async () => {
            try {
              const bindingRes = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
              const bindingJson = await bindingRes.json().catch(() => ({}));
              const semanticModelId = String(bindingJson?.data?.binding?.semantic_model_id ?? "").trim();
              const modelJson = bindingJson?.data?.model?.model_json ?? null;
              if (!semanticModelId || !modelJson || typeof modelJson !== "object") return;

              const modelsObj = (modelJson as any)?.models && typeof (modelJson as any).models === "object" ? (modelJson as any).models : {};
              const allModels = Object.keys(modelsObj);

              const existingSourceModel = (() => {
                try {
                  const node = nodesRef.current.find((n) => n.id === chartId);
                  const sm = node?.data && typeof node.data === "object" ? String((node.data as any)?.logicalQuery?.sourceModel ?? "").trim() : "";
                  return sm;
                } catch {
                  return "";
                }
              })();
              const pickSourceModel = (refs: string[]): string => {
                const counts = new Map<string, number>();
                const add = (ref: string, weight: number) => {
                  const s = String(ref ?? "").trim();
                  if (!s) return;
                  const idx = s.indexOf(".");
                  const m = idx > 0 ? s.slice(0, idx) : "";
                  if (m && Object.prototype.hasOwnProperty.call(modelsObj, m)) {
                    counts.set(m, (counts.get(m) ?? 0) + weight);
                  }
                };

                // Fact-first: measures dominate.
                const xCol = String((mappingPatch as any)?.xColumn ?? "").trim();
                const gCol = String((mappingPatch as any)?.groupBy ?? "").trim();
                const yCols = Array.isArray((mappingPatch as any)?.yColumns) ? (mappingPatch as any).yColumns : [];
                const yRaw = yCols.map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
                const y2Cols = Array.isArray((mappingPatch as any)?.y2Columns) ? (mappingPatch as any).y2Columns : [];
                const y2Raw = y2Cols.map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);

                for (const r of [...yRaw, ...y2Raw]) add(r, 5);
                add(xCol, 1);
                add(gCol, 1);
                for (const r of refs) add(r, 1);

                let best = "";
                let bestN = -1;
                for (const [m, n] of counts.entries()) {
                  if (n > bestN) {
                    best = m;
                    bestN = n;
                  }
                }
                return best || String(allModels[0] ?? "");
              };

              const toFieldRef = (raw: string) => {
                const s = String(raw ?? "").trim();
                if (!s) return "";
                if (s.includes(".")) return s;
                const m = (modelJson as any)?.models?.[sourceModel];
                const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
                const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
                const lc = s.toLowerCase();
                const common = ((): string => {
                  if (lc === "ts" || lc.includes("timestamp") || lc.includes("time") || lc.includes("date")) {
                    const hit = dims.find((k) => k.toLowerCase().includes("timestamp")) || dims.find((k) => k.toLowerCase() === "timestamp");
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  if (lc.includes("event") && lc.includes("name")) {
                    const hit = dims.find((k) => k.toLowerCase() === "event_name") || dims.find((k) => k.toLowerCase().includes("event"));
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  if (lc.includes("user")) {
                    const hit = dims.find((k) => k.toLowerCase() === "user_id") || dims.find((k) => k.toLowerCase().includes("user"));
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  if (lc.includes("project")) {
                    const hit = dims.find((k) => k.toLowerCase() === "project_id") || dims.find((k) => k.toLowerCase().includes("project"));
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  if (lc.includes("count") || lc.includes("events")) {
                    const hit = meas.find((k) => k.toLowerCase() === "events_count") || meas.find((k) => k.toLowerCase().includes("count"));
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  if (lc.includes("users")) {
                    const hit = meas.find((k) => k.toLowerCase() === "users") || meas.find((k) => k.toLowerCase().includes("user"));
                    return hit ? `${sourceModel}.${hit}` : "";
                  }
                  return "";
                })();
                if (common) return common;
                const found = [...dims, ...meas].find((k) => k.toLowerCase() === s.toLowerCase());
                return found ? `${sourceModel}.${found}` : "";
              };

              const xCol = String((mappingPatch as any)?.xColumn ?? "").trim();
              const gCol = String((mappingPatch as any)?.groupBy ?? "").trim();
              const yCols = Array.isArray((mappingPatch as any)?.yColumns) ? (mappingPatch as any).yColumns : [];
              const yRaw = yCols.map((yy: any) => String((yy && typeof yy === "object") ? (yy as any)?.col : yy ?? "").trim()).filter(Boolean);
              const y2Cols = Array.isArray((mappingPatch as any)?.y2Columns) ? (mappingPatch as any).y2Columns : [];
              const y2Raw = y2Cols.map((yy: any) => String((yy && typeof yy === "object") ? (yy as any)?.col : yy ?? "").trim()).filter(Boolean);

              const sourceModel = (existingSourceModel && Object.prototype.hasOwnProperty.call(modelsObj, existingSourceModel))
                ? existingSourceModel
                : pickSourceModel([xCol, gCol, ...yRaw, ...y2Raw]);
              if (!sourceModel) return;

              const effectiveVizType = (() => {
                const patchViz = String((patch as any)?.chartConfig?.general?.vizType ?? "").trim().toLowerCase();
                if (patchViz) return patchViz;
                try {
                  const node = nodesRef.current.find((n) => n.id === chartId);
                  const v = node?.data && typeof node.data === "object" ? String((node.data as any)?.chartConfig?.general?.vizType ?? "").trim().toLowerCase() : "";
                  return v;
                } catch {
                  return "";
                }
              })();

              const classifyRef = (qualifiedRef: string): "measure" | "dimension" | "unknown" => {
                const kind = classifyFieldRef(String(qualifiedRef ?? ""), modelJson as any);
                return kind === "time" ? "dimension" : kind;
              };

              const detailsRaw = Array.isArray((mappingPatch as any)?.detailsColumns) ? (mappingPatch as any).detailsColumns : [];
              const detailsCols = detailsRaw.map((c: any) => String(c ?? "").trim()).filter(Boolean);

              let dimRefs: string[] = [];
              let measureRefs: string[] = [];
              if (effectiveVizType === "table") {
                const refs = detailsCols.map(toFieldRef).filter(Boolean);
                for (const r of refs) {
                  const kind = classifyRef(r);
                  if (kind === "measure") measureRefs.push(r);
                  else dimRefs.push(r);
                }
              } else {
                dimRefs = [xCol ? toFieldRef(xCol) : "", gCol ? toFieldRef(gCol) : ""]
                  .filter(Boolean)
                  .filter((r: string) => classifyRef(r) === "dimension");
                measureRefs = [...yRaw, ...y2Raw]
                  .map(toFieldRef)
                  .filter(Boolean)
                  .filter((r: string) => classifyRef(r) === "measure");
              }

              dimRefs = Array.from(new Set(dimRefs.map((x) => String(x).trim()).filter(Boolean)));
              measureRefs = Array.from(new Set(measureRefs.map((x) => String(x).trim()).filter(Boolean)));
              if (dimRefs.length === 0 && measureRefs.length === 0) return;

              const measureAggOverrides = (() => {
                const out: Record<string, "sum" | "avg" | "count" | "countDistinct" | "min" | "max"> = {};
                for (const y of [...yCols, ...y2Cols]) {
                  const rawCol = String((y as any)?.col ?? "").trim();
                  if (!rawCol) continue;
                  const ref = toFieldRef(rawCol);
                  if (!ref) continue;
                  const agg = uiAggToAggFn((y as any)?.agg);
                  if (!agg) continue;
                  out[ref] = agg;
                }
                return out;
              })();
              const measuresV2 = measureRefs.map((ref) => {
                const field = String(ref ?? "").split(".").slice(1).join(".");
                const aggFn = measureAggOverrides[ref] ?? (field ? measureAggOverrides[field] : undefined);
                return aggFn ? { ref, aggFn } : { ref };
              });

              const patchTime = (patch as any)?.logicalQuery && typeof (patch as any).logicalQuery === "object"
                ? (patch as any).logicalQuery.time
                : undefined;

              const semanticPatch: any = {
                semanticModelId,
                logicalQuery: {
                  sourceModel,
                  dimensions: dimRefs,
                  measures: measureRefs,
                  ...(measuresV2.length > 0 ? { measuresV2 } : {}),
                  ...(Object.keys(measureAggOverrides).length > 0 ? { measureAggOverrides } : {}),
                  ...(effectiveVizType === "table" ? { noFallbackMeasure: true } : {}),
                  ...(effectiveVizType === "table" ? { filterNullDimensions: true } : {}),
                  ...(patchTime !== undefined ? { time: patchTime } : {}),
                  limit: 500,
                },
                __semanticBindingMissing: false,
              };

              // Apply semantic patch to nodes directly.
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.id !== chartId) return n;
                  const prevData = (n.data && typeof n.data === "object") ? n.data : {};
                  const prevTime = (prevData as any)?.logicalQuery && typeof (prevData as any).logicalQuery === "object"
                    ? (prevData as any).logicalQuery.time
                    : undefined;
                  if (patchTime === undefined && prevTime !== undefined) {
                    (semanticPatch.logicalQuery as any).time = prevTime;
                  }
                  return { ...n, data: { ...prevData, ...patch, ...semanticPatch } };
                })
              );

              // Keep panels in sync.
              window.dispatchEvent(
                new CustomEvent("dashboard:update-chart-data", {
                  detail: { chartId, patch: semanticPatch },
                })
              );
            } catch {}
          })();
        }
      } catch {}

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== chartId) return n;
          const prevData = (n.data && typeof n.data === "object") ? n.data : {};
          const nextName = String((patchWithSemantic as any)?.name ?? "").trim();
          const nextTitle = String((patchWithSemantic as any)?.title ?? "").trim();
          return {
            ...n,
            ...(nextName ? { name: nextName } : {}),
            ...(nextTitle ? { title: nextTitle } : {}),
            data: {
              ...prevData,
              ...patchWithSemantic,
            },
          };
        })
      );
    };

    window.addEventListener("dashboard:update-chart-data", handler as EventListener);
    return () => window.removeEventListener("dashboard:update-chart-data", handler as EventListener);
  }, []);

  // Append a single semantic dimension/measure into logicalQuery without replacing existing fields.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "").trim();
      const sourceModel = String(detail?.sourceModel ?? "").trim();
      const dimension = String(detail?.dimension ?? "").trim();
      const measure = String(detail?.measure ?? "").trim();
      if (!chartId) return;
      if (!dimension && !measure) return;

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== chartId) return n;
          const prevData = (n.data && typeof n.data === "object") ? n.data : {};
          const prevLq = ((prevData as any)?.logicalQuery && typeof (prevData as any).logicalQuery === "object")
            ? (prevData as any).logicalQuery
            : {};
          const prevDims = Array.isArray(prevLq?.dimensions) ? prevLq.dimensions.map((v: any) => String(v)).filter(Boolean) : [];
          const prevMeas = Array.isArray(prevLq?.measures) ? prevLq.measures.map((v: any) => String(v)).filter(Boolean) : [];
          const prevMeasV2 = Array.isArray((prevLq as any)?.measuresV2)
            ? (prevLq as any).measuresV2
                .map((m: any) => {
                  const ref = String(m?.ref ?? "").trim();
                  const aggFn = String(m?.aggFn ?? "").trim();
                  if (!ref) return null;
                  return aggFn ? { ref, aggFn } : { ref };
                })
                .filter(Boolean)
            : [];

          const nextDimensions = dimension
            ? Array.from(new Set([...prevDims, dimension]))
            : prevDims;
          const nextMeasures = measure
            ? Array.from(new Set([...prevMeas, measure]))
            : prevMeas;
          const nextMeasuresV2 = (() => {
            const byRef = new Map<string, { ref: string; aggFn?: string }>();
            for (const m of prevMeasV2) {
              const ref = String((m as any)?.ref ?? "").trim();
              if (!ref) continue;
              const aggFn = String((m as any)?.aggFn ?? "").trim();
              byRef.set(ref, aggFn ? { ref, aggFn } : { ref });
            }
            if (measure && !byRef.has(measure)) byRef.set(measure, { ref: measure });
            return nextMeasures.map((ref: string) => byRef.get(ref) ?? { ref });
          })();

          const nextLogicalQuery = {
            ...prevLq,
            ...(sourceModel ? { sourceModel } : {}),
            dimensions: nextDimensions,
            measures: nextMeasures,
            ...(nextMeasuresV2.length > 0 ? { measuresV2: nextMeasuresV2 } : {}),
            limit: Number.isFinite(Number(prevLq?.limit)) ? Number(prevLq?.limit) : 500,
          };

          return {
            ...n,
            data: {
              ...prevData,
              logicalQuery: nextLogicalQuery,
            },
          };
        })
      );
    };

    window.addEventListener("dashboard:append-logical-query-fields", handler as EventListener);
    return () => window.removeEventListener("dashboard:append-logical-query-fields", handler as EventListener);
  }, []);

  // Listen for open-as-table: add a table node next to the source chart
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "");
      if (!chartId) return;

      setNodes((prev) => {
        const sourceNode = prev.find((n) => n.id === chartId);
        if (!sourceNode) return prev;

        const tableNodeId = `table-${chartId}-${Date.now()}`;
        const sourceData = sourceNode.data && typeof sourceNode.data === "object" ? sourceNode.data : {};

        const tableNode: CanvasNode = {
          id: tableNodeId,
          type: "Table",
          name: "Table",
          title: `${sourceNode.title} (table)`,
          position: {
            x: sourceNode.position.x + sourceNode.size.width + 30,
            y: sourceNode.position.y,
          },
          size: { width: 560, height: 360 },
          data: {
            ...sourceData,
            __forceVizType: "table",
            __sourceChartId: chartId,
            columnMapping: undefined,
          },
        };

        return [...prev, tableNode];
      });
    };

    window.addEventListener("dashboard:open-as-table", handler as EventListener);
    return () => window.removeEventListener("dashboard:open-as-table", handler as EventListener);
  }, []);

  // Listen for open-as-slicer: add a slicer node next to the source chart
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "");
      if (!chartId) return;

      setNodes((prev) => {
        const sourceNode = prev.find((n) => n.id === chartId);
        if (!sourceNode) return prev;

        const slicerNodeId = `slicer-${chartId}-${Date.now()}`;
        const sourceData = sourceNode.data && typeof sourceNode.data === "object" ? sourceNode.data : {};

        const slicerNode: CanvasNode = {
          id: slicerNodeId,
          type: "Slicer",
          name: "Slicer",
          title: `${sourceNode.title} (slicer)`,
          position: {
            x: sourceNode.position.x + sourceNode.size.width + 30,
            y: sourceNode.position.y + 380,
          },
          size: { width: 320, height: 360 },
          data: {
            ...sourceData,
            __sourceChartId: chartId,
          },
        };

        return [...prev, slicerNode];
      });
    };

    window.addEventListener("dashboard:open-as-slicer", handler as EventListener);
    return () => window.removeEventListener("dashboard:open-as-slicer", handler as EventListener);
  }, []);

  // Listen for table cell edits and propagate to linked chart
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { tableNodeId, sourceChartId, col, rowIdx, value } = detail ?? {};
      if (!tableNodeId || !sourceChartId) return;

      setNodes((prev) => {
        // Find the table node to get its current DB data
        const tableNode = prev.find((n) => n.id === tableNodeId);
        if (!tableNode) return prev;

        // Build override map from existing overrides + new edit
        const existingOverrides: Record<string, string> = {
          ...(tableNode.data?.__cellOverrides ?? {}),
        };
        const key = `${rowIdx}:${col}`;
        existingOverrides[key] = value;

        // Update both table node (store overrides) and source chart node (store overrides for re-render)
        return prev.map((n) => {
          if (n.id === tableNodeId) {
            return {
              ...n,
              data: {
                ...(n.data ?? {}),
                __cellOverrides: existingOverrides,
              },
            };
          }
          if (n.id === sourceChartId) {
            return {
              ...n,
              data: {
                ...(n.data ?? {}),
                __cellOverrides: existingOverrides,
              },
            };
          }
          return n;
        });
      });
    };

    window.addEventListener("dashboard:table-cell-edit", handler as EventListener);
    return () => window.removeEventListener("dashboard:table-cell-edit", handler as EventListener);
  }, []);

  // Save dashboard project to Home → My Projects
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name?: string } | undefined;
      const name = String(detail?.name ?? "").trim();
      if (!name) return;

      (async () => {
        const projectId = await saveProject({
          name,
          nodes,
          viewport: {
            pan,
            zoom,
          },
          semanticArtifacts,
        });

        if (!projectId) return;

        let thumbnail = "";
        try {
          const el = canvasRef.current;
          if (el) {
            const { toPng } = await import('html-to-image');
            const png = await toPng(el, {
              cacheBust: true,
              pixelRatio: 0.65,
              backgroundColor: '#020617',
            });
            thumbnail = await downscaleDataUrlToJpeg(png, 640, 360, 0.65);
          }
        } catch {
          thumbnail = "";
        }

        if (thumbnail) {
          await updateProject(projectId, { thumbnail });
        }
      })();
    };

    window.addEventListener("dashboard:save-project", handler as EventListener);
    return () => window.removeEventListener("dashboard:save-project", handler as EventListener);
  }, [nodes, pan, zoom, semanticArtifacts]);

  const handleSaveConfig = useCallback(
    (config: ChartConfig) => {
      configModalSavedRef.current = true;
      setNodes((prev) =>
        prev.map((n) => {
          if (!configModalData?.chartId || n.id !== configModalData.chartId) return n;
          const prevData = (n.data && typeof n.data === "object") ? n.data : {};
          return {
            ...n,
            data: {
              ...prevData,
              chartConfig: config,
            },
          };
        })
      );
      console.log('[DragDropCanvas] Chart config saved to node:', configModalData?.chartId);
    },
    [configModalData?.chartId]
  );

  const handleConfigChangeLive = useCallback(
    (config: ChartConfig) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (!configModalData?.chartId || n.id !== configModalData.chartId) return n;
          const prevData = (n.data && typeof n.data === "object") ? n.data : {};
          return {
            ...n,
            data: {
              ...prevData,
              chartConfig: config,
            },
          };
        })
      );
    },
    [configModalData?.chartId]
  );

  const handleCloseConfigModal = useCallback(() => {
    setConfigModalOpen(false);
    window.dispatchEvent(new CustomEvent('chart:config-state-changed', { detail: { open: false } }));
    if (!configModalData?.chartId) return;

    if (configModalSavedRef.current) {
      configModalPrevConfigRef.current = null;
      return;
    }

    const prevCfg = configModalPrevConfigRef.current;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== configModalData.chartId) return n;
        const prevData = (n.data && typeof n.data === "object") ? n.data : {};
        const nextData = { ...prevData } as any;
        if (prevCfg) nextData.chartConfig = prevCfg;
        else delete nextData.chartConfig;
        return { ...n, data: nextData };
      })
    );

    configModalPrevConfigRef.current = null;
  }, [configModalData?.chartId]);

  // Привязка позиции к сетке (шаг 20px)
  const snapToGrid = useCallback((value: number) => {
    const gridSize = 20;
    return Math.round(value / gridSize) * gridSize;
  }, []);

  const addChartToCanvas = useCallback((chart: any, clientX?: number, clientY?: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;

    const x = snapToGrid((cx - rect.left - pan.x) / zoom);
    const y = snapToGrid((cy - rect.top - pan.y) / zoom);

    const getNodeSize = () => {
      if (
        chart.name.includes("Total Users") ||
        chart.name.includes("New Users") ||
        chart.name.includes("Active Users") ||
        chart.name.includes("Churned Users") ||
        chart.name.includes("Total Events") ||
        chart.name.includes("Active Now") ||
        chart.name.includes("Response Time") ||
        chart.name.includes("Uptime")
      ) {
        return {width: 280, height: 140};
      }
      return {width: 560, height: 360};
    };

    const templateNames = [
      "Executive overview",
      "Sales performance",
      "Product analytics",
      "Marketing funnel",
      "Operations monitoring",
      "Financial overview",
    ];

    if (templateNames.includes(chart.name)) {
      const baseX = x;
      const baseY = y;
      const createdAt = Date.now();

      const templateNodes: CanvasNode[] = [
        {
          id: `node-${createdAt}-kpi1`,
          type: "KPI card",
          name: "KPI card",
          title: "KPI 1",
          position: {x: baseX, y: baseY},
          size: {width: 280, height: 140},
          data: {preset: "kpi", querySpec: { axis: [], legend: [], values: [] }},
        },
        {
          id: `node-${createdAt}-kpi2`,
          type: "KPI with delta",
          name: "KPI with delta",
          title: "KPI Δ",
          position: {x: baseX + 300, y: baseY},
          size: {width: 280, height: 140},
          data: {preset: "kpi-delta", querySpec: { axis: [], legend: [], values: [] }},
        },
        {
          id: `node-${createdAt}-line`,
          type: "Line (time series)",
          name: "Line (time series)",
          title: "Line (time series)",
          position: {x: baseX, y: baseY + 160},
          size: {width: 560, height: 360},
          data: {preset: "trend", querySpec: { axis: [], legend: [], values: [] }},
        },
        {
          id: `node-${createdAt}-bar`,
          type: "Bar (categorical)",
          name: "Bar (categorical)",
          title: "Bar (categorical)",
          position: {x: baseX + 580, y: baseY + 160},
          size: {width: 560, height: 360},
          data: {preset: "bar", querySpec: { axis: [], legend: [], values: [] }},
        },
      ];

      setNodes((prev) => [...prev, ...templateNodes]);
      return;
    }

    const newNode: CanvasNode = {
      id: `node-${Date.now()}`,
      type: chart.name,
      name: chart.name,
      title: chart.name,
      position: {x, y},
      size: getNodeSize(),
      data: {
        ...chart,
        ...(chart?.name === "Slicer"
          ? {
              kind: "slicer",
              slicer: {
                mode: "list",
                multiSelect: true,
                selectedValues: [],
              },
            }
          : {}),
        querySpec: (chart && typeof chart === "object" && (chart as any).defaultQuerySpec && typeof (chart as any).defaultQuerySpec === "object")
          ? (chart as any).defaultQuerySpec
          : { axis: [], legend: [], values: [] },
      },
    };

    setNodes((prev) => [...prev, newNode]);
  }, [pan.x, pan.y, snapToGrid, zoom]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const chartData = e.dataTransfer.getData("application/json");
    console.log('[Canvas] Drop event, data:', chartData);
    
    if (!chartData) {
      console.warn('[Canvas] No chart data in drop event');
      return;
    }

    try {
      const payload = JSON.parse(chartData);

      // Only allow creating new nodes from Chart Library drags (charts/templates).
      // If a user drags a semantic field/column, it should be handled by a drop-zone
      // inside an existing node (e.g. Slicer field binding), not by the canvas.
      const isLibraryChart = payload && typeof payload === "object"
        && typeof (payload as any).name === "string"
        && typeof (payload as any).page === "string";

      const isTemplate = payload && typeof payload === "object"
        && typeof (payload as any).name === "string"
        && [
          "Executive overview",
          "Sales performance",
          "Product analytics",
          "Marketing funnel",
          "Operations monitoring",
          "Financial overview",
        ].includes(String((payload as any).name));

      if (payload && typeof payload === "object" && payload.kind === "semantic-parameter") {
        const parameterId = String((payload as any).parameterId ?? (payload as any).id ?? "").trim();
        const parameterName = String((payload as any).name ?? parameterId).trim() || parameterId;
        if (!parameterId) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;

        setNodes((prev) => {
          const nodeId = `param-slicer-${parameterId}-${Date.now()}`;
          const slicerNode: CanvasNode = {
            id: nodeId,
            type: "Slicer",
            name: "Slicer",
            title: `${parameterName} (parameter)`,
            position: { x: Math.round(x), y: Math.round(y) },
            size: { width: 320, height: 360 },
            data: {
              slicer: {
                mode: "list",
                sourceKind: "parameter",
                parameterId,
                multiSelect: false,
                selectedValues: [],
              },
            },
          };
          return [...prev, slicerNode];
        });
        return;
      }

      if (payload && typeof payload === "object" && payload.kind === "semantic-field-parameter") {
        const fieldParameterId = String((payload as any).fieldParameterId ?? (payload as any).id ?? "").trim();
        const fpName = String((payload as any).name ?? fieldParameterId).trim() || fieldParameterId;
        if (!fieldParameterId) return;

        const targetChartId = String(activeNodeIdRef.current ?? "").trim();
        if (!targetChartId) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;

        setNodes((prev) => {
          const nodeId = `fp-slicer-${fieldParameterId}-${Date.now()}`;
          const slicerNode: CanvasNode = {
            id: nodeId,
            type: "Slicer",
            name: "Slicer",
            title: `${fpName} (field parameter)`,
            position: { x: Math.round(x), y: Math.round(y) },
            size: { width: 320, height: 360 },
            data: {
              __sourceChartId: targetChartId,
              slicer: {
                mode: "dropdown",
                sourceKind: "fieldParameter",
                fieldParameterId,
                selectedValues: [],
              },
            },
          };
          return [...prev, slicerNode];
        });
        return;
      }

      if (!isLibraryChart && !isTemplate) {
        return;
      }

      addChartToCanvas(payload, e.clientX, e.clientY);
    } catch (error) {
      console.error('[Canvas] Error parsing chart data:', error);
    }
  }, [addChartToCanvas]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.chart) return;
      addChartToCanvas(detail.chart);
    };
    window.addEventListener("dashboard:add-chart", handler as EventListener);
    return () => window.removeEventListener("dashboard:add-chart", handler as EventListener);
  }, [addChartToCanvas]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const dataSource = detail?.dataSource;
      if (!dataSource || typeof dataSource !== "object") return;

      const id = (globalThis.crypto && "randomUUID" in globalThis.crypto)
        ? (globalThis.crypto as any).randomUUID()
        : `chart_${Date.now()}`;

      const title = String((dataSource as any)?.tableKey ?? (dataSource as any)?.label ?? "Chart").trim() || "Chart";

      const chart: any = {
        id,
        chartId: id,
        name: title,
        title,
        chartType: "chart-builder",
        kind: "db-table",
        dataSource,
        dataSources: [dataSource],
        columnsMeta: Array.isArray((dataSource as any)?.columnsMeta) ? (dataSource as any).columnsMeta : [],
        columnMapping: null,
        chartConfig: {
          general: { vizType: "bar" },
        },
      };

      addChartToCanvas(chart);
      setActiveNodeId(id);
      try {
        window.dispatchEvent(new CustomEvent("dashboard:active-chart-id", { detail: { chartId: id, chartData: chart } }));
      } catch {}
    };

    window.addEventListener("dashboard:create-chart-from-table", handler as EventListener);
    return () => window.removeEventListener("dashboard:create-chart-from-table", handler as EventListener);
  }, [addChartToCanvas]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const chartId = String(detail?.chartId ?? "");
      const targetChartId = chartId;
      const dataSource = detail?.dataSource;
      if (!chartId || !dataSource) return;

      setActiveNodeId(chartId);

      let lastSources: any[] | null = null;

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== chartId) return n;
          const prevData = (n.data && typeof n.data === "object") ? n.data : {};

          const incomingKey = dataSource?.kind === "table" ? String(dataSource?.tableKey ?? "") : "";
          const prevSourcesArr = Array.isArray((prevData as any)?.dataSources)
            ? (prevData as any).dataSources
            : ((prevData as any)?.dataSource ? [(prevData as any).dataSource] : []);
          const isAlreadyConnected = !!incomingKey && prevSourcesArr.some((s: any) => {
            const key = s?.kind === "table" ? String(s?.tableKey ?? "") : "";
            return key && incomingKey && key === incomingKey;
          });

          // Toggle behavior: if already connected -> disconnect.
          if (isAlreadyConnected) {
            const nextSources = prevSourcesArr.filter((s: any) => {
              const key = s?.kind === "table" ? String(s?.tableKey ?? "") : "";
              return !(key && incomingKey && key === incomingKey);
            });

            lastSources = nextSources;

            const nextData: any = {
              ...prevData,
              dataSources: nextSources,
            };

            // Keep legacy `dataSource` in sync.
            if (nextSources.length > 0) {
              nextData.dataSource = nextSources[0];
            } else {
              delete nextData.dataSource;
              delete nextData.kind;
              delete nextData.connectionId;
              delete nextData.connectionType;
              delete nextData.tableKey;
              delete nextData.columnsMeta;
              delete nextData.columnMapping;
            }

            return {
              ...n,
              data: nextData,
            };
          }

          const nextData: any = {
            ...prevData,
            dataSourceConnectedAt: new Date().toISOString(),
          };

          if (dataSource?.kind === "table") {
            nextData.kind = "db-table";
            nextData.connectionId = String(dataSource?.connectionId ?? "");
            nextData.tableKey = String(dataSource?.tableKey ?? "");
            if (Array.isArray((dataSource as any)?.columnsMeta)) {
              nextData.columnsMeta = (dataSource as any).columnsMeta;
            }
            if (dataSource?.connectionType != null) {
              nextData.connectionType = String(dataSource.connectionType);
            }

            // Auto-init column mapping (Build) so X/Y are populated immediately after Connect DB.
            // Only do it if mapping is missing or empty.
            const existingMapping = (prevData as any)?.columnMapping;
            const hasExistingMapping = existingMapping && typeof existingMapping === "object" && (
              String((existingMapping as any)?.xColumn ?? "").trim() ||
              (Array.isArray((existingMapping as any)?.yColumns) && (existingMapping as any).yColumns.length > 0)
            );
            if (!hasExistingMapping) {
              const colsMeta = Array.isArray((dataSource as any)?.columnsMeta) ? (dataSource as any).columnsMeta : [];
              const cols = colsMeta
                .map((c: any) => ({ name: String(c?.name ?? "").trim(), type: String(c?.type ?? "").toLowerCase() }))
                .filter((c: any) => c.name);
              const isNumeric = (t: string) => {
                return t.includes("int") || t.includes("decimal") || t.includes("numeric") || t.includes("real") || t.includes("double") || t.includes("float") || t.includes("number");
              };
              const isDateLike = (t: string, n: string) => {
                const nn = n.toLowerCase();
                return t.includes("date") || t.includes("time") || nn.includes("date") || nn.includes("time") || nn === "ts" || nn.includes("timestamp");
              };
              const looksLikeId = (n: string) => {
                const nn = String(n ?? "").trim().toLowerCase();
                if (!nn) return false;
                if (nn === "id") return true;
                if (nn.endsWith("_id") || nn.endsWith("id")) return true;
                if (nn.includes("guid") || nn.includes("uuid") || nn.includes("hash")) return true;
                return false;
              };
              const measureNameScore = (n: string) => {
                const nn = String(n ?? "").trim().toLowerCase();
                if (!nn) return 0;
                let s = 0;
                if (nn.includes("count")) s += 5;
                if (nn.includes("sum") || nn.includes("total")) s += 4;
                if (nn.includes("amount") || nn.includes("price") || nn.includes("revenue")) s += 4;
                if (nn.includes("paid") || nn.includes("generation")) s += 3;
                if (nn === "rows" || nn.includes("row")) s += 2;
                return s;
              };

              const dateCols = cols.filter((c: any) => isDateLike(c.type, c.name));
              const textCols = cols.filter((c: any) => !isNumeric(c.type));
              const idCols = cols.filter((c: any) => looksLikeId(c.name));
              const numeric = cols.filter((c: any) => isNumeric(c.type) && !isDateLike(c.type, c.name));
              const numericNotId = numeric.filter((c: any) => !looksLikeId(c.name));
              const numericMeasureLike = numericNotId
                .map((c: any) => ({ c, s: measureNameScore(c.name) }))
                .filter((x: any) => (x?.s ?? 0) > 0)
                .sort((a: any, b: any) => b.s - a.s)
                .map((x: any) => x.c);
              const numericNonMeasureLike = numericNotId.filter((c: any) => measureNameScore(c.name) === 0);

              // Power BI-like defaults:
              // - Axis X should be a dimension/time field (date > text > id-like).
              // - Axis Y should be a measure-like numeric field.
              const xCandidate = dateCols[0]
                || textCols.find((c: any) => !looksLikeId(c.name))
                || textCols[0]
                || idCols[0]
                || numericNonMeasureLike[0]
                || numericNotId[0]
                || cols[0];

              const xName = xCandidate?.name ? String(xCandidate.name) : "";
              const yCandidate = numericMeasureLike.find((c: any) => String(c?.name ?? "") && String(c.name) !== xName)
                || numericMeasureLike[0]
                || null;

              const xColumn = xName;
              const yColumn = yCandidate?.name ? String(yCandidate.name) : "";
              nextData.columnMapping = {
                xColumn,
                yColumns: yColumn ? [{ col: yColumn, agg: "SUM" }] : [],
              };
            }

            // Semantic-only dashboard visuals: bind semanticModelId + derive logicalQuery.
            // This follows the Power BI model: visuals query through the semantic model so BI filters apply consistently.
            try {
              const pid = String(projectId ?? "").trim();
              if (pid) {
                void (async () => {
                  try {
                    const fetchBinding = async () => {
                      const bindingRes = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
                      const bindingJson = await bindingRes.json().catch(() => ({}));
                      const semanticModelId = String(bindingJson?.data?.binding?.semantic_model_id ?? "").trim();
                      const modelJson = bindingJson?.data?.model?.model_json ?? null;
                      const modelsObj = modelJson && typeof modelJson === "object" ? (modelJson as any)?.models : null;
                      const modelKeys = modelsObj && typeof modelsObj === "object" ? Object.keys(modelsObj) : [];
                      const isDemo = modelKeys.length === 1 && modelKeys[0] === "events";
                      return { semanticModelId, modelJson, isDemo };
                    };

                    let { semanticModelId, modelJson, isDemo } = await fetchBinding();
                    if (!semanticModelId || !modelJson || typeof modelJson !== "object" || isDemo) {
                      const connectionId = String((dataSource as any)?.connectionId ?? "").trim() || String((nextData as any)?.connectionId ?? "").trim();
                      await fetch("/api/semantic/bootstrap", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ projectId: pid, ...(connectionId ? { connectionId } : {}) }),
                        cache: "no-store",
                      }).catch(() => null);

                      ({ semanticModelId, modelJson, isDemo } = await fetchBinding());
                    }

                    if (!semanticModelId || !modelJson || typeof modelJson !== "object" || isDemo) {
                      window.dispatchEvent(
                        new CustomEvent("dashboard:update-chart-data", {
                          detail: {
                            chartId: targetChartId,
                            patch: { __semanticBindingMissing: true },
                          },
                        })
                      );
                      return;
                    }

                    const mapping = (nextData as any)?.columnMapping;
                    const xCol = String(mapping?.xColumn ?? "").trim();
                    const yCols = Array.isArray(mapping?.yColumns) ? mapping.yColumns : [];
                    const y = yCols.map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
                    const g = String(mapping?.groupBy ?? "").trim();

                    const modelsObj = (modelJson as any)?.models && typeof (modelJson as any).models === "object" ? (modelJson as any).models : {};
                    const allModels = Object.keys(modelsObj);

                    const incomingTableKey = String((dataSource as any)?.tableKey ?? "").trim();
                    const sourceModelFromBinding = await (async (): Promise<string> => {
                      try {
                        if (!incomingTableKey) return "";
                        const srcRes = await fetch(
                          `/api/semantic/sources?projectId=${encodeURIComponent(pid)}&semanticModelId=${encodeURIComponent(semanticModelId)}`,
                          { cache: "no-store" }
                        );
                        const srcJson = await srcRes.json().catch(() => ({}));
                        const rows = Array.isArray(srcJson?.data) ? srcJson.data : [];
                        const hit = rows.find((r: any) => String(r?.table_key ?? "").trim() === incomingTableKey);
                        const mn = hit ? String(hit?.model_name ?? "").trim() : "";
                        if (mn && Object.prototype.hasOwnProperty.call(modelsObj, mn)) return mn;
                        return "";
                      } catch {
                        return "";
                      }
                    })();
                    const pickSourceModel = (refs: string[]): string => {
                      const counts = new Map<string, number>();
                      for (const r of refs) {
                        const s = String(r ?? "").trim();
                        if (!s) continue;
                        const idx = s.indexOf(".");
                        const m = idx > 0 ? s.slice(0, idx) : "";
                        if (m && Object.prototype.hasOwnProperty.call(modelsObj, m)) {
                          counts.set(m, (counts.get(m) ?? 0) + 1);
                        }
                      }
                      let best = "";
                      let bestN = -1;
                      for (const [m, n] of counts.entries()) {
                        if (n > bestN) {
                          best = m;
                          bestN = n;
                        }
                      }
                      return best || String(allModels[0] ?? "");
                    };

                    const sourceModel = sourceModelFromBinding || pickSourceModel([xCol, g, ...y]);
                    if (!sourceModel) return;

                    const toFieldRef = (raw: string) => {
                      const s = String(raw ?? "").trim();
                      if (!s) return "";
                      if (s.includes(".")) return s;
                      const m = (modelJson as any)?.models?.[sourceModel];
                      const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
                      const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
                      // Common convenience mapping (Power BI-like): when raw columns come from a physical table,
                      // try to map to semantically named fields.
                      const lc = s.toLowerCase();
                      const common = ((): string => {
                        if (lc === "ts" || lc.includes("timestamp") || lc.includes("time") || lc.includes("date")) {
                          const hit = dims.find((k) => k.toLowerCase().includes("timestamp")) || dims.find((k) => k.toLowerCase() === "timestamp");
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        if (lc.includes("event") && lc.includes("name")) {
                          const hit = dims.find((k) => k.toLowerCase() === "event_name") || dims.find((k) => k.toLowerCase().includes("event"));
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        if (lc.includes("user")) {
                          const hit = dims.find((k) => k.toLowerCase() === "user_id") || dims.find((k) => k.toLowerCase().includes("user"));
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        if (lc.includes("project")) {
                          const hit = dims.find((k) => k.toLowerCase() === "project_id") || dims.find((k) => k.toLowerCase().includes("project"));
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        if (lc.includes("count") || lc.includes("events")) {
                          const hit = meas.find((k) => k.toLowerCase() === "events_count") || meas.find((k) => k.toLowerCase().includes("count"));
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        if (lc.includes("users")) {
                          const hit = meas.find((k) => k.toLowerCase() === "users") || meas.find((k) => k.toLowerCase().includes("user"));
                          return hit ? `${sourceModel}.${hit}` : "";
                        }
                        return "";
                      })();
                      if (common) return common;
                      const found = [...dims, ...meas].find((k) => k.toLowerCase() === s.toLowerCase());
                      return found ? `${sourceModel}.${found}` : "";
                    };

                    const getFieldKind = (ref: string): "dimension" | "measure" | "unknown" => {
                      const kind = classifyFieldRef(String(ref ?? ""), modelJson as any);
                      return kind === "time" ? "dimension" : kind;
                    };

                    const axisRef = xCol ? toFieldRef(xCol) : "";
                    const legendRef = g ? toFieldRef(g) : "";
                    const mappedYRefs: string[] = y
                      .map((raw: string) => toFieldRef(raw))
                      .filter((ref: string) => !!ref);
                    const measureRefs: string[] = mappedYRefs.filter((ref: string) => getFieldKind(ref) === "measure");
                    const measuresV2 = measureRefs.map((ref) => ({ ref }));
                    const dimCandidateRefs: string[] = [axisRef, legendRef].filter((ref: string) => !!ref);
                    const dimRefs: string[] = dimCandidateRefs.filter((ref: string) => getFieldKind(ref) === "dimension");
                    if (dimRefs.length === 0 && measureRefs.length === 0) return;

                    // Write directly into this node's data for immediate render.
                    // Also dispatch an event so other panels stay in sync.
                    try {
                      (nextData as any).semanticModelId = semanticModelId;
                      (nextData as any).logicalQuery = {
                        sourceModel,
                        dimensions: dimRefs,
                        measures: measureRefs,
                        ...(measuresV2.length > 0 ? { measuresV2 } : {}),
                        limit: 500,
                      };
                      (nextData as any).__semanticBindingMissing = false;
                    } catch {}

                    window.dispatchEvent(
                      new CustomEvent("dashboard:update-chart-data", {
                        detail: {
                          chartId: targetChartId,
                          patch: {
                            semanticModelId,
                            logicalQuery: {
                              sourceModel,
                              dimensions: dimRefs,
                              measures: measureRefs,
                              ...(measuresV2.length > 0 ? { measuresV2 } : {}),
                              limit: 500,
                            },
                            __semanticBindingMissing: false,
                          },
                        },
                      })
                    );
                  } catch {}
                })();
              }
            } catch {}
          }

          // Multi-source support (limit 6). Keep legacy `dataSource` for compatibility,
          // but also store an array in `dataSources`.
          const prevSources = Array.isArray((prevData as any)?.dataSources)
            ? (prevData as any).dataSources
            : ((prevData as any)?.dataSource ? [(prevData as any).dataSource] : []);
          const deduped = prevSources.filter((s: any) => {
            const key = s?.kind === "table" ? String(s?.tableKey ?? "") : "";
            return !(incomingKey && key && key === incomingKey);
          });

          const nextSources = [dataSource, ...deduped].slice(0, 6);
          nextData.dataSources = nextSources;

          // Keep legacy `dataSource` in sync with multi-source list (first source).
          // Some older UI reads `dataSource` and can behave incorrectly if it points to a different table.
          nextData.dataSource = nextSources[0];

          lastSources = nextSources;

          return {
            ...n,
            data: nextData,
          };
        })
      );

      // Notify DB explorer panels about updated connected sources (authoritative in-memory state)
      try {
        if (lastSources) {
          window.dispatchEvent(
            new CustomEvent("dashboard:chart-sources-changed", {
              detail: { chartId, dataSources: lastSources },
            })
          );
        }
      } catch {}
    };

    window.addEventListener("dashboard:connect-to-chart", handler as EventListener);
    return () => window.removeEventListener("dashboard:connect-to-chart", handler as EventListener);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Предотвращаем прокрутку страницы
    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    // World coords under cursor before zoom
    const worldX = (offsetX - pan.x) / zoom;
    const worldY = (offsetY - pan.y) / zoom;

    // ZOOM factor
    const nextZoomRaw = e.deltaY < 0 ? zoom * 1.1 : zoom * 0.9;
    const nextZoom = Math.min(3, Math.max(0.1, nextZoomRaw));

    // Adjust pan so that the world point under cursor stays under cursor after zoom
    const nextPan = {
      x: offsetX - worldX * nextZoom,
      y: offsetY - worldY * nextZoom,
    };

    setZoom(nextZoom);
    setPan(nextPan);
  }, [pan.x, pan.y, zoom]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (!canvasRef.current?.contains(target)) return;

    // If click originated inside a node (anywhere), activate that node.
    // This is required so right-side panes (Fields/Filters/Config) can target the active chart.
    const nodeEl = target.closest('[data-canvas-node="true"]') as HTMLElement | null;
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id') || nodeEl.getAttribute('data-id');
      if (nodeId) {
        setActiveNodeId(String(nodeId));
        return;
      }
    }

    // Do not start panning when interacting with explicit drag/resize handles or UI controls.
    if (target.closest('[data-node-drag-handle="true"]')) return;
    if (target.closest('[data-node-resize-handle="true"]')) return;
    if (target.closest('button,a,input,textarea,select,[role="dialog"],[role="menu"],[role="listbox"]')) return;

    e.preventDefault();
    // If a node drag/resize was in progress and mouseup got lost, force-reset it.
    isDraggingNodeRef.current = false;
    isResizingNodeRef.current = false;
    draggedNodeRef.current = null;
    setIsDraggingNode(false);
    setIsResizingNode(false);
    setDraggedNode(null);
    setResizeHandle(null);
    setActiveNodeId(null);
    isPanningRef.current = true;
    setIsPanning(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleResizeStart = useCallback((e: React.MouseEvent, nodeId: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingNodeRef.current = true;
    isDraggingNodeRef.current = false;
    draggedNodeRef.current = nodeId;
    setIsResizingNode(true);
    setDraggedNode(nodeId);
    setResizeHandle(handle);
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: node.size.width,
        height: node.size.height,
      });
    }
  }, [nodes]);

  const flushInteractionFrame = useCallback(() => {
    interactionRafRef.current = null;

    const nextPan = pendingPanRef.current;
    if (nextPan) {
      pendingPanRef.current = null;
      setPan(nextPan);
    }

    const nextDrag = pendingDragRef.current;
    if (nextDrag) {
      pendingDragRef.current = null;
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nextDrag.nodeId
            ? { ...node, position: { x: nextDrag.x, y: nextDrag.y } }
            : node
        )
      );
    }

    const nextResize = pendingResizeRef.current;
    if (nextResize) {
      pendingResizeRef.current = null;
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nextResize.nodeId) return node;
          const nextPos = (typeof nextResize.x === 'number' || typeof nextResize.y === 'number')
            ? {
                x: typeof nextResize.x === 'number' ? nextResize.x : node.position.x,
                y: typeof nextResize.y === 'number' ? nextResize.y : node.position.y,
              }
            : node.position;
          const nextSize = (typeof nextResize.width === 'number' || typeof nextResize.height === 'number')
            ? {
                width: typeof nextResize.width === 'number' ? nextResize.width : node.size.width,
                height: typeof nextResize.height === 'number' ? nextResize.height : node.size.height,
              }
            : node.size;
          return {
            ...node,
            position: nextPos,
            size: nextSize,
          };
        })
      );
    }
  }, []);

  const scheduleInteractionFrame = useCallback(() => {
    if (interactionRafRef.current != null) return;
    interactionRafRef.current = window.requestAnimationFrame(flushInteractionFrame);
  }, [flushInteractionFrame]);

  const handleResize = useCallback((e: React.MouseEvent) => {
    if (!isResizingNode || !draggedNode || !resizeHandle) return;

    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;

    const node = nodesRef.current.find(n => n.id === draggedNode);
    if (!node) return;

    let newWidth = node.size.width;
    let newHeight = node.size.height;
    let newX: number | undefined;
    let newY: number | undefined;

    switch (resizeHandle) {
      case 'se': // bottom-right
        newWidth = snapToGrid(resizeStart.width + deltaX);
        newHeight = snapToGrid(resizeStart.height + deltaY);
        break;
      case 'sw': // bottom-left
        newWidth = snapToGrid(resizeStart.width - deltaX);
        newHeight = snapToGrid(resizeStart.height + deltaY);
        newX = snapToGrid(node.position.x + (resizeStart.width - newWidth));
        break;
      case 'ne': // top-right
        newWidth = snapToGrid(resizeStart.width + deltaX);
        newHeight = snapToGrid(resizeStart.height - deltaY);
        newY = snapToGrid(node.position.y + (resizeStart.height - newHeight));
        break;
      case 'nw': // top-left
        newWidth = snapToGrid(resizeStart.width - deltaX);
        newHeight = snapToGrid(resizeStart.height - deltaY);
        newX = snapToGrid(node.position.x + (resizeStart.width - newWidth));
        newY = snapToGrid(node.position.y + (resizeStart.height - newHeight));
        break;
      case 'e': // right
        newWidth = snapToGrid(resizeStart.width + deltaX);
        break;
      case 'w': // left
        newWidth = snapToGrid(resizeStart.width - deltaX);
        newX = snapToGrid(node.position.x + (resizeStart.width - newWidth));
        break;
      case 's': // bottom
        newHeight = snapToGrid(resizeStart.height + deltaY);
        break;
      case 'n': // top
        newHeight = snapToGrid(resizeStart.height - deltaY);
        newY = snapToGrid(node.position.y + (resizeStart.height - newHeight));
        break;
    }

    newWidth = Math.max(newWidth, 280);
    newHeight = Math.max(newHeight, 160);

    pendingResizeRef.current = {
      nodeId: draggedNode,
      width: newWidth,
      height: newHeight,
      ...(typeof newX === 'number' ? { x: newX } : {}),
      ...(typeof newY === 'number' ? { y: newY } : {}),
    };
    scheduleInteractionFrame();
  }, [isResizingNode, draggedNode, resizeHandle, resizeStart, scheduleInteractionFrame, snapToGrid]);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;
    
    const x = snapToGrid(mouseX - dragStart.x);
    const y = snapToGrid(mouseY - dragStart.y);

    if (!draggedNode) return;
    pendingDragRef.current = { nodeId: draggedNode, x, y };
    scheduleInteractionFrame();
  }, [draggedNode, pan, zoom, snapToGrid, dragStart, scheduleInteractionFrame]);

  const handleCanvasMouseUp = useCallback(() => {
    isPanningRef.current = false;
    isDraggingNodeRef.current = false;
    isResizingNodeRef.current = false;
    draggedNodeRef.current = null;
    setIsPanning(false);
    setIsDraggingNode(false);
    setIsResizingNode(false);
    setDraggedNode(null);
    setResizeHandle(null);
  }, []);

  // Ensure drag/pan state is cleared even if mouseup happens outside the canvas.
  useEffect(() => {
    const onUp = () => handleCanvasMouseUp();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [handleCanvasMouseUp]);

  const updateCenterButtonGlowOptimized = useCallback(() => {
    const el = centerButtonRef.current;
    if (!el) return;

    const mouseInside = isMouseInCanvasRef.current;
    if (!mouseInside) {
      el.style.background = "rgba(59, 130, 246, 0.05)";
      el.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      el.style.boxShadow = "0 0 0px rgba(59, 130, 246, 0), inset 0 1px 0 rgba(255, 255, 255, 0.1)";
      if (centerButtonIconWrapRef.current) centerButtonIconWrapRef.current.style.filter = "none";
      return;
    }

    const rect = centerButtonRectRef.current ?? el.getBoundingClientRect();
    centerButtonRectRef.current = rect;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mx = centerButtonMouseRef.current.x;
    const my = centerButtonMouseRef.current.y;

    const deltaX = mx - centerX;
    const deltaY = my - centerY;

    const maxOffset = 100;
    const offsetX = Math.max(-maxOffset, Math.min(maxOffset, deltaX * 0.5));
    const offsetY = Math.max(-maxOffset, Math.min(maxOffset, deltaY * 0.5));
    const gx = 50 + (offsetX / maxOffset) * 50;
    const gy = 50 + (offsetY / maxOffset) * 50;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = 300;
    const raw = Math.max(0, 1 - distance / maxDistance);
    const hoverBoost = el.matches(":hover") ? 1.15 : 1;
    const intensity = Math.min(1, Math.pow(raw, 1.2) * hoverBoost);

    const a1 = 0.2 + intensity * 0.3;
    const borderA = 0.1 + intensity * 0.2;
    const s1 = 20 + intensity * 15;
    const s2 = 40 + intensity * 30;
    const sa1 = 0.15 + intensity * 0.25;
    const sa2 = 0.08 + intensity * 0.15;

    el.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(59, 130, 246, ${a1}), rgba(59, 130, 246, 0.05))`;
    el.style.border = `1px solid rgba(255, 255, 255, ${borderA})`;
    el.style.boxShadow = `0 0 ${s1}px rgba(59, 130, 246, ${sa1}), 0 0 ${s2}px rgba(59, 130, 246, ${sa2}), inset 0 1px 0 rgba(255, 255, 255, 0.2)`;

    if (centerButtonIconWrapRef.current) {
      centerButtonIconWrapRef.current.style.filter = `drop-shadow(0 0 ${4 + intensity * 6}px rgba(59, 130, 246, ${0.6 + intensity * 0.3}))`;
    }
  }, []);

  // Обработчики входа/выхода мыши из canvas
  const handleCanvasMouseEnter = useCallback(() => {
    isMouseInCanvasRef.current = true;
    centerButtonRectRef.current = centerButtonRef.current?.getBoundingClientRect() ?? null;
    updateCenterButtonGlowOptimized();
  }, [updateCenterButtonGlowOptimized]);

  const handleCanvasMouseLeave = useCallback(() => {
    isMouseInCanvasRef.current = false;
    updateCenterButtonGlowOptimized();
  }, [updateCenterButtonGlowOptimized]);

  useEffect(() => {
    if (nodes.length !== 0) return;
    centerButtonRectRef.current = centerButtonRef.current?.getBoundingClientRect() ?? null;
    updateCenterButtonGlowOptimized();
  }, [nodes.length, updateCenterButtonGlowOptimized]);

  const handleNodeAction = (nodeId: string, action: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    console.log(`[Canvas] ${action} clicked for ${node.name}`);

    switch (action) {
      case 'export':
        // Экспорт конфигурации модуля
        const nodeData = {
          id: node.id,
          type: node.type,
          name: node.name,
          position: node.position,
          size: node.size,
          data: node.data,
        };
        const dataStr = JSON.stringify(nodeData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${node.name.replace(/\s+/g, '_').toLowerCase()}_config.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        break;
        
      case 'import':
        // Импорт конфигурации модуля
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const imported = JSON.parse(e.target?.result as string);
                console.log(`[Canvas] Imported config for ${node.name}:`, imported);
                // Здесь можно обновить конфигурацию модуля
              } catch (error) {
                console.error('[Canvas] Error importing config:', error);
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
        break;
        
      case 'ai-config':
        // AI настройка модуля
        console.log(`[Canvas] Opening AI config for ${node.name}`);
        // Здесь можно открыть модальное окно с AI настройками
        break;
        
      case 'manual-config':
        // Ручная настройка модуля
        console.log(`[Canvas] Opening manual config for ${node.name}`);
        // Здесь можно открыть модальное окно с ручными настройками
        break;
    }
  };

  // Глобальный обработчик для предотвращения zoom на всем сайте
  const handleGlobalWheel = useCallback((e: WheelEvent) => {
    if ((e.ctrlKey || e.metaKey) && canvasRef.current && 
        !canvasRef.current.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [handleGlobalWheel]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest('[data-node-drag-handle="true"]')) return;
    e.stopPropagation();
    e.preventDefault();
    setActiveNodeId(nodeId);
    isDraggingNodeRef.current = true;
    isPanningRef.current = false;
    isResizingNodeRef.current = false;
    draggedNodeRef.current = nodeId;
    setIsDraggingNode(true);
    setDraggedNode(nodeId);
    
    // Calculate offset from node's top-left to mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;
    
    setDragStart({
      x: mouseX - node.position.x,
      y: mouseY - node.position.y
    });
  }, [nodes, pan, zoom]);

  const handleNodeActivate = useCallback((nodeId: string) => {
    setActiveNodeId(nodeId);
  }, []);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1));
  const handleResetZoom = () => {
    if (nodes.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 60;
    const availableWidth = rect.width - padding * 2;
    const availableHeight = rect.height - padding * 2;

    // Fit zoom so all nodes are visible
    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.1), 3);

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = rect.width / 2 - centerX * newZoom;
    const newPanY = rect.height / 2 - centerY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, []);

  const handleNodeRename = useCallback((nodeId: string, newTitle: string) => {
    setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, title: newTitle } : n));
  }, []);

  const handleNodeWheelCapture = useCallback((e: React.WheelEvent, nodeId: string) => {
    // When cursor is inside the active node, stop wheel from zooming canvas
    // We read activeNodeId from ref to keep callback stable
    if (activeNodeIdRef.current === nodeId) {
      e.stopPropagation();
    }
  }, []);

  const handleNodeCellEdit = useCallback((nodeId: string, sourceChartId: string, col: number, rowIdx: number, value: string) => {
    window.dispatchEvent(new CustomEvent('dashboard:table-cell-edit', {
      detail: { tableNodeId: nodeId, sourceChartId, col, rowIdx, value },
    }));
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      e.preventDefault();
      pendingPanRef.current = {
        x: snapToGrid(e.clientX - dragStart.x),
        y: snapToGrid(e.clientY - dragStart.y),
      };
      scheduleInteractionFrame();
    } else if (isResizingNodeRef.current) {
      e.preventDefault();
      handleResize(e);
    } else if (isDraggingNodeRef.current && draggedNodeRef.current) {
      handleDrag(e);
    }

    // Отслеживание мыши для подсветки кнопки
    if (nodes.length === 0) {
      centerButtonMouseRef.current = { x: e.clientX, y: e.clientY };
      if (centerButtonRafRef.current == null) {
        centerButtonRafRef.current = window.requestAnimationFrame(() => {
          centerButtonRafRef.current = null;
          updateCenterButtonGlowOptimized();
        });
      }
    }
  }, [dragStart, handleResize, handleDrag, nodes.length, scheduleInteractionFrame, snapToGrid, updateCenterButtonGlowOptimized]);

  const handleCenterButtonClick = useCallback(() => {
    // Открыть библиотеку компонентов - отправим событие как при нажатии кнопки 1
    const event = new CustomEvent('dashboard:open-library');
    window.dispatchEvent(event);
  }, []);

  const reduceMotion = useReducedMotion();

  // Calculate connections between tables and their source charts
  const connections = useMemo(() => {
    const result: Array<{ from: CanvasNode; to: CanvasNode }> = [];
    nodes.forEach((node) => {
      if ((node.type === "Table" || node.type === "Slicer") && node.data?.__sourceChartId) {
        const sourceChart = nodes.find((n) => n.id === node.data.__sourceChartId);
        if (sourceChart) {
          result.push({ from: sourceChart, to: node });
        }
      }
    });
    return result;
  }, [nodes]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      onMouseDownCapture={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const nodeEl = target.closest('[data-canvas-node="true"]') as HTMLElement | null;
        if (!nodeEl) return;
        const nodeId = nodeEl.getAttribute('data-node-id') || nodeEl.getAttribute('data-id');
        if (!nodeId) return;
        setActiveNodeId(String(nodeId));
      }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseEnter={handleCanvasMouseEnter}
      onMouseLeave={handleCanvasMouseLeave}
      style={{
        cursor: isPanning ? 'grabbing' : 'grab'
      }}
    >
      <DashboardDock activeChartId={activeNodeId} onResetZoom={handleResetZoom} />

      {/* MiniMap */}
      <AnimatePresence>
        {miniMapOpen && (
          <motion.div
            key="minimap"
            className="absolute bottom-6 right-6 z-30"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <MiniMap
              nodes={nodes}
              activeNodeId={activeNodeId}
              zoom={zoom}
              pan={pan}
              canvasSize={canvasSize}
              onNavigate={(newPan) => setPan(newPan)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative z-0 w-full h-full bg-slate-950 overflow-hidden"
      >
        {/* Opaque base to prevent Global background from bleeding into the canvas */}
        <div className="absolute inset-0 bg-slate-950 pointer-events-none" />

        {/* Canvas-only background (animation preferred) */}
        {canvasAnimUrl ? (
          canvasAnimMeta?.mime?.startsWith("video/") ? (
            <video
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              src={canvasAnimUrl}
              autoPlay
              loop
              muted
              playsInline
              style={{ transform: "translateZ(0)" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              src={canvasAnimUrl}
              alt="Canvas background animation"
              draggable={false}
              style={{ transform: "translateZ(0)" }}
            />
          )
        ) : (
          canvasBg && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${canvasBg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                opacity: 1,
                transform: "translateZ(0)",
              }}
            />
          )
        )}

        {/* Glass canvas surface (handles events + blurs background behind it) */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onWheel={handleWheel}
          className={`absolute inset-0 bg-slate-950/55 ${canvasBlurEnabled ? 'backdrop-blur-2xl backdrop-saturate-150' : ''}`}
        >
          {/* Dark tint to keep nodes readable */}
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(2, 6, 23, ${canvasDarken})` }} />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.26) 1.25px, transparent 1.25px)`,
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          {/* Connection lines SVG overlay */}
          {connections.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{
                width: '100%',
                height: '100%',
              }}
            >
              {connections.map((conn, idx) => {
              // Calculate center points of both nodes
              const fromCenterX = conn.from.position.x + conn.from.size.width / 2;
              const fromCenterY = conn.from.position.y + conn.from.size.height / 2;
              const toCenterX = conn.to.position.x + conn.to.size.width / 2;
              const toCenterY = conn.to.position.y + conn.to.size.height / 2;

              // Apply pan and zoom transformations
              const x1 = fromCenterX * zoom + pan.x;
              const y1 = fromCenterY * zoom + pan.y;
              const x2 = toCenterX * zoom + pan.x;
              const y2 = toCenterY * zoom + pan.y;

              // Create hanging cable path with gravity effect
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              const sagAmount = 80; // How much the cable sags
              const controlX = midX;
              const controlY = midY + sagAmount; // Sag downward like gravity

              const d = `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;

              // Lightweight animated signal: dashed stroke offset (direction depends on edit mode)
              // Negative dashoffset moves the dashes in the opposite direction.
              const dashFrom = 0;
              const dashTo = isEditMode ? -40 : 40;

              const shouldAnimateSignal = !reduceMotion && connections.length <= 8;

              return (
                <g key={idx}>
                  <path
                    d={d}
                    stroke="rgba(16, 185, 129, 0.12)"
                    strokeWidth="10"
                    fill="none"
                    opacity="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    stroke="rgba(16, 185, 129, 0.22)"
                    strokeWidth="6"
                    fill="none"
                    opacity="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={d}
                    stroke="#10b981"
                    strokeWidth="2"
                    fill="none"
                    opacity="0.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Animated signal highlight (cheap vs. blur + animateMotion) */}
                  <path
                    d={d}
                    stroke="#34d399"
                    strokeWidth="2"
                    fill="none"
                    opacity="0.55"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="6 16"
                  >
                    {shouldAnimateSignal && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from={String(dashFrom)}
                        to={String(dashTo)}
                        dur="2.2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </path>
                </g>
              );
            })}
          </svg>
        )}

        {/* Nodes */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {nodes.map((node) => (
            <CanvasNodeView
              key={node.id}
              id={node.id}
              type={node.type}
              name={node.name}
              title={node.title}
              positionX={node.position.x}
              positionY={node.position.y}
              width={node.size.width}
              height={node.size.height}
              data={node.data}
              isActive={activeNodeId === node.id}
              isEditMode={isEditMode}
              activeNodeId={activeNodeId}
              onRename={handleNodeRename}
              onDelete={handleDeleteNode}
              onActivate={handleNodeActivate}
              onMouseDown={handleNodeMouseDown}
              onResizeStart={handleResizeStart}
              onWheelCapture={handleNodeWheelCapture}
              onCellEdit={handleNodeCellEdit}
            />
          ))}
        </div>
      </div>
      </div>

      {/* Empty state - outside canvas */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <div 
              ref={centerButtonRef}
              className="group relative inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 cursor-pointer transition-all duration-200 ease-out hover:scale-110 pointer-events-auto"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 0 0px rgba(59, 130, 246, 0), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s ease-out',
              }}
              onClick={handleCenterButtonClick}
            >
              <span ref={centerButtonIconWrapRef}>
                <PlusIcon 
                  className="w-7 h-7 transition-transform duration-200 ease-out group-hover:scale-110"
                  style={{
                    color: `rgb(147, 197, 253)`,
                    transition: 'all 0.2s ease-out',
                  }}
                />
              </span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Drag charts here</h3>
            <p className="text-slate-400">Drag and drop charts from the library to get started</p>
          </div>
        </div>
      )}

      {/* Chart Configuration Slide-In */}
      <AnimatePresence>
        {configModalOpen && configModalData && (
          <motion.div
            key="chart-config-panel"
            className="absolute top-10 right-0 h-[calc(100%-2.5rem)] z-30"
            initial={{x: "100%", opacity: 0}}
            animate={{x: 0, opacity: 1}}
            exit={{x: "100%", opacity: 0}}
            transition={{type: "spring", damping: 25, stiffness: 200}}
          >
            <ChartConfigModal
              isOpen={configModalOpen}
              onClose={handleCloseConfigModal}
              chartId={configModalData.chartId}
              chartType={configModalData.chartType}
              chartName={configModalData.chartName}
              currentConfig={configModalData.currentConfig}
              chartData={configModalData.chartData}
              onSave={handleSaveConfig}
              onConfigChange={handleConfigChangeLive}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explain Chart Modal */}
      <ExplainChartModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        chartData={explainModalData?.chartData}
        chartConfig={explainModalData?.chartConfig}
      />
    </div>
  );
}
