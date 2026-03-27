"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {Database, Edit, Layers, Map, Maximize2, Plus, ChevronUp, Camera, Save, SlidersHorizontal, Filter, Sparkles, BarChart3} from "lucide-react";
import {ChartLibrarySlideIn} from "./ChartLibrarySlideIn";
import {DbSlideInPanel} from "./DbSlideInPanel";
import {FieldsSlideInPanel} from "./FieldsSlideInPanel";
import {FiltersSlideInPanel} from "./FiltersSlideInPanel";
import {VisualizationsSlideInPanel} from "./VisualizationsSlideInPanel";
import type {CommandBarHandle} from "./CommandBar";
import {CommandBar} from "./CommandBar";
import {useBiFilters} from "../../store/biFiltersContext";
import {useConnectionState} from "../../providers";
import {SemanticModelProvider} from "../../context/SemanticModelContext";

type ActivePanel = "library" | "db" | "fields" | "filters" | "visualizations" | null;

type AgentToolCall = {
  tool: string;
  args: Record<string, any>;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
};

export function DashboardDock({ activeChartId, onResetZoom }: { 
  activeChartId?: string | null; 
  onResetZoom?: () => void; 
}) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const openPanel = activePanel === "library" ? "library" : null;
  const isDbPanelOpen = activePanel === "db";
  const isFieldsPanelOpen = activePanel === "fields";
  const isFiltersPanelOpen = activePanel === "filters";
  const isVisualizationsPanelOpen = activePanel === "visualizations";
  const [isEditMode, setIsEditMode] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(true);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [isChartConfigOpen, setIsChartConfigOpen] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentVoiceActive, setIsAgentVoiceActive] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    toolCall: AgentToolCall;
  } | null>(null);

  const agentCommandBarRef = useRef<CommandBarHandle | null>(null);
  const agentHoldTimerRef = useRef<number | null>(null);
  const agentHoldActivatedRef = useRef(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { setActiveConnection } = useConnectionState();
  const { filters: biFilters, version: biFilterVersion } = useBiFilters();

  const activeChartIdRef = useRef<string | null | undefined>(activeChartId);
  activeChartIdRef.current = activeChartId;
  const onResetZoomRef = useRef<(() => void) | undefined>(onResetZoom);
  onResetZoomRef.current = onResetZoom;
  const openPanelRef = useRef<"library" | null>(openPanel);
  openPanelRef.current = openPanel;
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;
  const isMenuVisibleRef = useRef(isMenuVisible);
  isMenuVisibleRef.current = isMenuVisible;
  const isMenuExpandedRef = useRef(isMenuExpanded);
  isMenuExpandedRef.current = isMenuExpanded;

  const [targetChartId, setTargetChartId] = useState<string | null>(null);
  const dbPanelRef = useRef<HTMLDivElement | null>(null);
  const dbButtonRef = useRef<HTMLButtonElement | null>(null);
  const fieldsPanelRef = useRef<HTMLDivElement | null>(null);
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const visualizationsPanelRef = useRef<HTMLDivElement | null>(null);

  const CHART_CONFIG_PANEL_WIDTH = 420;
  const RIGHT_PANEL_WIDTH = 380;
  const RIGHT_PANEL_GAP = 6;

  const getPersistedPanelWidth = (key: string, fallback: number) => {
    try {
      const raw = String(window.localStorage.getItem(key) ?? "").trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
    return fallback;
  };

  const stopAgentVoice = () => {
    try {
      agentCommandBarRef.current?.stopVoice?.();
    } finally {
      setIsAgentVoiceActive(false);
    }
  };

  const clearAgentHoldTimer = () => {
    if (agentHoldTimerRef.current != null) {
      window.clearTimeout(agentHoldTimerRef.current);
      agentHoldTimerRef.current = null;
    }
  };

  const startAgentVoice = () => {
    setIsMenuVisible(true);
    setIsAgentOpen(true);
    try {
      agentCommandBarRef.current?.startVoice?.();
      setIsAgentVoiceActive(true);
    } catch {
      setIsAgentVoiceActive(false);
    }
  };

  const [filtersPanelWidth, setFiltersPanelWidth] = useState<number>(() =>
    getPersistedPanelWidth("dashboard:filtersPanelWidth", RIGHT_PANEL_WIDTH)
  );
  const [visualizationsPanelWidth, setVisualizationsPanelWidth] = useState<number>(() =>
    getPersistedPanelWidth("dashboard:visualizationsPanelWidth", RIGHT_PANEL_WIDTH)
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as any;
      const panel = String(detail?.panel ?? "").trim();
      const width = Number(detail?.width);
      if (!Number.isFinite(width) || width <= 0) return;
      if (panel === "filters") setFiltersPanelWidth(width);
      if (panel === "visualizations") setVisualizationsPanelWidth(width);
    };
    window.addEventListener("dashboard:panel-width-changed", handler as EventListener);
    return () => window.removeEventListener("dashboard:panel-width-changed", handler as EventListener);
  }, []);

  const activeTabId = useMemo(() => {
    try {
      return String(window.localStorage.getItem("dashboard:activeTab") ?? "").trim() || null;
    } catch {
      return null;
    }
  }, []);

  const effectivePageKey = useMemo(() => {
    // Matches ChartPreview/FiltersSlideInPanel semantics (tab mode uses tab id).
    return activeTabId ? String(activeTabId) : "dashboard";
  }, [activeTabId]);

  const applyAgentToolCall = (tc: AgentToolCall) => {
    const name = String(tc?.tool ?? "").trim();
    const args = (tc?.args && typeof tc.args === "object") ? tc.args : {};
    if (!name) throw new Error("Empty tool name");

    if (name === "chart_create") {
      const chartName = String(args.chartName ?? "").trim() || "Chart";
      const vizType = String(args.vizType ?? "").trim() || "table";
      window.dispatchEvent(
        new CustomEvent("dashboard:add-chart", {
          detail: {
            chart: {
              name: chartName,
              page: "Agent",
              __forceVizType: vizType,
              chartConfig: {
                general: {
                  vizType,
                },
              },
            },
          },
        })
      );
      return;
    }

    if (name === "chart_set_query") {
      const chartId = String(args.chartId ?? "").trim();
      const sourceModel = String(args.sourceModel ?? "").trim();
      const dimensions = Array.isArray(args.dimensions) ? args.dimensions.map((v: any) => String(v)).filter(Boolean) : [];
      const measures = Array.isArray(args.measures) ? args.measures.map((v: any) => String(v)).filter(Boolean) : [];
      const measuresV2 = measures.map((ref) => ({ ref }));
      const limit = Number(args.limit ?? 500);
      if (!chartId) throw new Error("chart_set_query: chartId required");
      if (!sourceModel) throw new Error("chart_set_query: sourceModel required");
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId,
            patch: {
              logicalQuery: {
                sourceModel,
                dimensions,
                measures,
                ...(measuresV2.length > 0 ? { measuresV2 } : {}),
                limit: Number.isFinite(limit) ? limit : 500,
              },
            },
          },
        })
      );
      return;
    }

    if (name === "chart_add_dimension_measure") {
      const chartId = String(args.chartId ?? "").trim();
      const sourceModel = String(args.sourceModel ?? "").trim();
      const dimension = String(args.dimension ?? "").trim();
      const measure = String(args.measure ?? "").trim();
      if (!chartId) throw new Error("chart_add_dimension_measure: chartId required");
      if (!dimension && !measure) throw new Error("chart_add_dimension_measure: dimension or measure required");

      window.dispatchEvent(
        new CustomEvent("dashboard:append-logical-query-fields", {
          detail: {
            chartId,
            ...(sourceModel ? { sourceModel } : {}),
            ...(dimension ? { dimension } : {}),
            ...(measure ? { measure } : {}),
          },
        })
      );
      return;
    }

    if (name === "viz_set_type") {
      const chartId = String(args.chartId ?? "").trim();
      const vizType = String(args.vizType ?? "").trim();
      if (!chartId) throw new Error("viz_set_type: chartId required");
      if (!vizType) throw new Error("viz_set_type: vizType required");
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId,
            patch: {
              chartConfig: {
                general: {
                  vizType,
                },
              },
            },
          },
        })
      );
      return;
    }

    if (name === "filters_add") {
      const field = String(args.field ?? "").trim();
      const op = String(args.op ?? "").trim();
      const values = Array.isArray(args.values) ? args.values : (args.values != null ? [args.values] : []);
      const scope = String(args.scope ?? "visual").trim();

      if (!field) throw new Error("filters_add: field required");
      if (!op) throw new Error("filters_add: op required");

      const next = [...(Array.isArray(biFilters) ? biFilters : []), {
        field,
        op,
        values,
        scope: (scope === "report" || scope === "page" || scope === "visual") ? scope : "visual",
        pageKey: scope === "page" ? (String(args.pageKey ?? "").trim() || effectivePageKey) : undefined,
        sourceChartId: scope === "visual" ? (String(args.sourceChartId ?? "").trim() || (activeChartId ? String(activeChartId) : undefined)) : undefined,
      }];

      window.dispatchEvent(
        new CustomEvent("dashboard:bi-filters-changed", {
          detail: {
            filters: next,
            version: Number(biFilterVersion ?? 0) + 1,
          },
        })
      );
      return;
    }

    if (name === "dashboard_delete_node") {
      const chartId = String(args.chartId ?? "").trim();
      if (!chartId) throw new Error("dashboard_delete_node: chartId required");
      window.dispatchEvent(
        new CustomEvent("dashboard:delete-node", {
          detail: { chartId },
        })
      );
      return;
    }

    if (name === "slicer_create") {
      const sourceChartId = String(args.sourceChartId ?? "").trim();
      if (!sourceChartId) throw new Error("slicer_create: sourceChartId required");
      window.dispatchEvent(
        new CustomEvent("dashboard:open-as-slicer", {
          detail: { chartId: sourceChartId },
        })
      );
      return;
    }

    if (name === "slicer_set_field") {
      const slicerId = String(args.slicerId ?? "").trim();
      const fieldRef = String(args.fieldRef ?? "").trim();
      if (!slicerId) throw new Error("slicer_set_field: slicerId required");
      if (!fieldRef) throw new Error("slicer_set_field: fieldRef required");
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: slicerId,
            patch: {
              kind: "slicer",
              slicer: {
                fieldRef,
                mode: "list",
                multiSelect: true,
                selectedValues: [],
              },
            },
          },
        })
      );
      return;
    }

    if (name === "slicer_select_values") {
      const slicerId = String(args.slicerId ?? "").trim();
      const values = Array.isArray(args.values) ? args.values.map(v => String(v)) : [];
      if (!slicerId) throw new Error("slicer_select_values: slicerId required");
      if (values.length === 0) throw new Error("slicer_select_values: values required");

      const slicerTargetChartId = (() => {
        const n = (Array.isArray(nodes) ? nodes : []).find((x: any) => String(x?.id ?? "") === slicerId);
        const target = n && typeof n === "object" ? String((n as any)?.data?.__sourceChartId ?? "").trim() : "";
        return target || slicerId;
      })();

      // Update slicer UI state
      window.dispatchEvent(
        new CustomEvent("dashboard:update-chart-data", {
          detail: {
            chartId: slicerId,
            patch: {
              slicer: {
                selectedValues: values,
              },
            },
          },
        })
      );

      // Also apply a BI filter so other visuals actually receive it.
      // Default to page scope (safest for a slicer control).
      try {
        const slicerField = String((args as any)?.fieldRef ?? "").trim();
        const field = slicerField || "";
        if (field) {
          const next = [
            ...(Array.isArray(biFilters) ? biFilters : []),
            {
              field,
              op: "in",
              values,
              scope: "page",
              pageKey: effectivePageKey,
              sourceChartId: slicerTargetChartId,
            },
          ];
          window.dispatchEvent(
            new CustomEvent("dashboard:bi-filters-changed", {
              detail: {
                filters: next,
                version: Number(biFilterVersion ?? 0) + 1,
              },
            })
          );
        }
      } catch {}
      return;
    }

    throw new Error(`Unknown tool: ${name}`);
  };

  const handleAgentCommand = async (text: string) => {
    const aiServiceUrl = (process.env.NEXT_PUBLIC_AI_API_URL || "").trim();
    if (!aiServiceUrl) {
      throw new Error("NEXT_PUBLIC_AI_API_URL is not set (ai-service base URL)");
    }
    const ctx = {
      activeChartId: activeChartId ? String(activeChartId) : null,
      effectivePageKey,
      biFiltersVersion: biFilterVersion,
      pageScopeMode: "tab",
    };

    const res = await fetch(`${aiServiceUrl}/agent/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context: ctx }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error ?? `Agent plan failed (${res.status})`);
    }
    const calls: AgentToolCall[] = Array.isArray(json?.toolCalls) ? json.toolCalls : [];
    if (calls.length === 0) throw new Error("No toolCalls returned");

    for (const tc of calls) {
      const requires = tc?.requiresConfirmation === true;
      if (requires) {
        setPendingConfirm({
          message: String(tc.confirmationMessage ?? "Confirm action?") || "Confirm action?",
          toolCall: tc,
        });
        return;
      }
      applyAgentToolCall(tc);
    }
  };

  // Broadcast edit mode state changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dashboard:edit-mode-changed', { detail: { isEditMode } }));
  }, [isEditMode]);

  const spring = {type: "spring" as const, damping: 25, stiffness: 200};

  const toggle = (id: Exclude<ActivePanel, null>) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  useEffect(() => {
    const onOpenLibrary = () => {
      setIsMenuVisible(true);
      setActivePanel("library");
    };
    window.addEventListener("dashboard:open-library", onOpenLibrary);
    return () => window.removeEventListener("dashboard:open-library", onOpenLibrary);
  }, []);

  // Listen for Chart Configuration state changes from DragDropCanvas
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const next = !!detail?.open;
      setIsChartConfigOpen(next);
      console.log('[DashboardDock] chart:config-state-changed', { open: next, detail });
    };
    window.addEventListener('chart:config-state-changed', handler);
    return () => window.removeEventListener('chart:config-state-changed', handler);
  }, []);

  useEffect(() => {
    if (!openPanel && !isMenuVisible && !isDbPanelOpen && !isFieldsPanelOpen && !isFiltersPanelOpen && !isVisualizationsPanelOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dockRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (dbPanelRef.current?.contains(target)) return;
      if (fieldsPanelRef.current?.contains(target)) return;
      if (filtersPanelRef.current?.contains(target)) return;
      if (visualizationsPanelRef.current?.contains(target)) return;
      
      // Закрываем панель библиотеки
      if (openPanel || isDbPanelOpen || isFieldsPanelOpen || isFiltersPanelOpen || isVisualizationsPanelOpen) {
        setActivePanel(null);
      }

      // Скрываем меню только если клик был не по кнопке раскрытия
      // (проверяем что клик был не по dock элементу)
      if (isMenuVisible && !dockRef.current?.contains(target)) {
        // Не скрываем меню автоматически - только по Tab или стрелочке
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openPanel, isMenuVisible, isDbPanelOpen, isFieldsPanelOpen, isFiltersPanelOpen, isVisualizationsPanelOpen]);

  useEffect(() => {
    if (!isDbPanelOpen && !isFieldsPanelOpen && !isFiltersPanelOpen && !isVisualizationsPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActivePanel(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDbPanelOpen, isFieldsPanelOpen, isFiltersPanelOpen, isVisualizationsPanelOpen]);

  useEffect(() => {
    const onOpenFromChartAction = (e: Event) => {
      const evt = e as CustomEvent<{ chartId?: string | null }>;
      setTargetChartId(evt.detail?.chartId ?? null);
      setActivePanel("db");
    };
    window.addEventListener("dashboard:open-db-explorer", onOpenFromChartAction as EventListener);
    return () => window.removeEventListener("dashboard:open-db-explorer", onOpenFromChartAction as EventListener);
  }, []);

  const openDbPanel = () => {
    setTargetChartId(activeChartId ?? null);
    setActivePanel("db");
  };

  const openFieldsPanel = () => {
    setActivePanel("fields");
  };

  const openFiltersPanel = () => {
    setActivePanel("filters");
  };

  const openVisualizationsPanel = () => {
    setActivePanel("visualizations");
  };

  const openFieldsAndFilters = () => {
    setActivePanel("fields");
  };

  const handleScreenshot = () => {
    // Функция для создания скриншота
    // TODO: Реализовать скриншот canvas
    console.log('Screenshot requested');
  };

  const handleSave = () => {
    const name = window.prompt('Project name', 'Dashboard project')?.trim();
    if (!name) return;
    window.dispatchEvent(
      new CustomEvent('dashboard:save-project', {
        detail: {
          name,
        },
      })
    );
  };

  const applySemanticTestQuery = () => {
    const cid = activeChartIdRef.current ? String(activeChartIdRef.current) : "";
    if (!cid) return;
    void (async () => {
      try {
        const pid = (() => {
          try {
            return String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
          } catch {
            return "";
          }
        })();
        if (!pid) return;

        const getBinding = async () => {
          const res = await fetch(`/api/semantic/binding?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
          const json = await res.json().catch(() => ({}));
          const semanticModelId = String(json?.data?.binding?.semantic_model_id ?? "").trim();
          const modelJson = json?.data?.model?.model_json ?? null;
          return { semanticModelId, modelJson };
        };

        let { semanticModelId, modelJson } = await getBinding();
        const modelsObj = modelJson && typeof modelJson === "object" ? (modelJson as any)?.models : null;
        const modelKeys = modelsObj && typeof modelsObj === "object" ? Object.keys(modelsObj) : [];
        const isDemo = modelKeys.length === 1 && modelKeys[0] === "events";

        if (!semanticModelId || isDemo) {
          const statusRes = await fetch("/api/connection/status", { cache: "no-store" }).catch(() => null);
          const statusJson = statusRes ? await statusRes.json().catch(() => ({})) : {};
          const connectionId = String(statusJson?.connection?.id ?? "").trim();
          await fetch("/api/semantic/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: pid, ...(connectionId ? { connectionId } : {}) }),
            cache: "no-store",
          }).catch(() => null);

          const b2 = await getBinding();
          semanticModelId = b2.semanticModelId;
          modelJson = b2.modelJson;
        }

        if (!semanticModelId || !modelJson || typeof modelJson !== "object") return;
        const models = (modelJson as any)?.models && typeof (modelJson as any).models === "object" ? (modelJson as any).models : {};
        const allModels = Object.keys(models);
        const sourceModel = String(allModels[0] ?? "").trim();
        if (!sourceModel) return;

        const m = (models as any)[sourceModel];
        const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
        const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
        const firstDim = String(dims[0] ?? "").trim();
        const firstMeasure = String(meas.find((x: string) => x !== "rows") ?? meas[0] ?? "").trim();
        if (!firstDim || !firstMeasure) return;

        window.dispatchEvent(
          new CustomEvent("dashboard:update-chart-data", {
            detail: {
              chartId: cid,
              patch: {
                semanticModelId,
                logicalQuery: {
                  sourceModel,
                  dimensions: [`${sourceModel}.${firstDim}`],
                  measures: [`${sourceModel}.${firstMeasure}`],
                  measuresV2: [{ ref: `${sourceModel}.${firstMeasure}` }],
                  orderBy: [{ field: firstMeasure, dir: "desc" }],
                  limit: 10,
                },
              },
            },
          })
        );
      } catch {}
    })();
  };

  const toggleChartConfig = () => {
    if (!activeChartIdRef.current) return;
    // Always dispatch chart:manual-config — DragDropCanvas handles toggle logic
    window.dispatchEvent(new CustomEvent('chart:manual-config', { detail: { chartId: activeChartIdRef.current } }));
  };

  // Горячие клавиши для кнопок меню (stable listener)
  useEffect(() => {
    const isTypingContext = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return false;
      // Block hotkeys only when the keydown originates from an editable element.
      // Using document.activeElement here can produce false positives with hidden/focus-trap inputs.
      const editable = target.closest('input, textarea, select, [contenteditable="true"]') as HTMLElement | null;
      if (editable) return true;

      // Monaco editor (and similar) uses divs/spans, so treat it as typing context too.
      // This prevents global dashboard hotkeys from firing while editing formulas.
      const monaco = target.closest('.monaco-editor, .react-monaco-editor-container') as HTMLElement | null;
      if (monaco) return true;

      // Generic ARIA textbox role (some editors use this).
      const ariaTextbox = target.closest('[role="textbox"]') as HTMLElement | null;
      if (ariaTextbox) return true;

      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isTypingContext(e)) return;
      if (e.metaKey || e.altKey) return;

      // Ctrl+X - открываем меню и переключаем расширенный режим
      if (e.ctrlKey && e.code === "KeyX") {
        e.preventDefault();
        if (!isMenuVisibleRef.current) {
          setIsMenuVisible(true);
        } else {
          setIsMenuExpanded((prev) => !prev);
        }
        return;
      }

      // Hold-to-talk voice: press and hold V
      if (e.code === 'KeyV') {
        if ((e as any).repeat) return;
        e.preventDefault();
        startAgentVoice();
        return;
      }

      const digit = e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') ? e.code.slice(6) : '';
      switch (digit) {
        case '1':
          e.preventDefault();
          setIsMenuVisible(true);
          setActivePanel((prev) => (prev === "library" ? null : "library"));
          return;
        case '2':
          e.preventDefault();
          setIsMenuVisible(true);
          setTargetChartId(activeChartIdRef.current ?? null);
          setActivePanel("db");
          return;
        case '3':
          e.preventDefault();
          setIsMenuVisible(true);
          setIsEditMode((prev) => !prev);
          return;
        case '4':
          e.preventDefault();
          setIsMenuVisible(true);
          onResetZoomRef.current?.();
          return;
        case '5':
          e.preventDefault();
          setIsMenuVisible(true);
          window.dispatchEvent(new CustomEvent('dashboard:toggle-minimap'));
          return;
        case '6':
          e.preventDefault();
          setIsMenuVisible(true);
          handleScreenshot();
          return;
        case '7':
          e.preventDefault();
          setIsMenuVisible(true);
          handleSave();
          return;
        case '8':
          if (!isMenuVisibleRef.current) return;
          e.preventDefault();
          toggleChartConfig();
          return;
        case '9':
          e.preventDefault();
          setIsMenuVisible(true);
          openFieldsPanel();
          return;
        case '0':
          e.preventDefault();
          setIsMenuVisible(true);
          openFiltersPanel();
          return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isTypingContext(e)) return;
      if (e.code === 'KeyV') {
        e.preventDefault();
        stopAgentVoice();
      }
    };

    const onBlur = () => {
      stopAgentVoice();
    };

    // Use capture phase so hotkeys still work if some component prevents default in bubble phase
    document.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true } as any);
      document.removeEventListener('keyup', onKeyUp, { capture: true } as any);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <SemanticModelProvider>
      <div
        ref={dockRef}
        onMouseDownCapture={(e) => {
          e.stopPropagation();
        }}
        className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50"
      >
        <AnimatePresence>
          {isMenuVisible ? (
            <motion.div
              layout
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{
                ...spring,
                layout: { type: "spring", damping: 32, stiffness: 190 },
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/30"
            >
              <button
                type="button"
                onClick={() => {
                  // If a long-press activated voice, suppress the click toggle.
                  if (agentHoldActivatedRef.current) {
                    agentHoldActivatedRef.current = false;
                    return;
                  }
                  setIsAgentOpen((p) => !p);
                }}
                className={`relative w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-r from-blue-500/40 to-purple-500/40 border border-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/25 ${
                  isAgentVoiceActive ? "shadow-lg shadow-blue-500/30" : ""
                }`}
                style={{
                  transition: 'box-shadow 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(147, 51, 234, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                  agentHoldActivatedRef.current = false;
                  clearAgentHoldTimer();
                  // Long-press (2s) to start voice; must keep holding.
                  agentHoldTimerRef.current = window.setTimeout(() => {
                    agentHoldActivatedRef.current = true;
                    startAgentVoice();
                  }, 2000) as unknown as number;
                }}
                onPointerUp={(e) => {
                  if (e.button !== 0) return;
                  clearAgentHoldTimer();
                  if (isAgentVoiceActive) {
                    stopAgentVoice();
                  }
                }}
                onPointerMove={() => {
                  // If the user moves finger/mouse while holding, treat as cancel.
                  if (!isAgentVoiceActive) clearAgentHoldTimer();
                }}
                onPointerCancel={() => {
                  clearAgentHoldTimer();
                  stopAgentVoice();
                }}
                title="Agent commands (9)"
              >
                <Sparkles className="w-5 h-5 text-white" />

                {isAgentVoiceActive && (
                  <div className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="flex items-start gap-[2px] h-4" style={{ transform: "scaleY(-1)" }}>
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-full bg-gradient-to-t from-blue-400/90 to-purple-400/90 animate-pulse"
                          style={{
                            height: `${6 + ((i * 6) % 10)}px`,
                            animationDelay: `${i * 70}ms`,
                            animationDuration: `${360 + (i % 3) * 130}ms`,
                            opacity: 0.95,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </button>

              <div className="w-px h-6 bg-white/10" />

              <button
                type="button"
                onClick={() => toggle("library")}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all"
                title={openPanel === "library" ? "Закрыть библиотеку (1)" : "Открыть библиотеку (1)"}
              >
                <Plus
                  className="w-5 h-5"
                  style={{
                    transform: openPanel === "library" ? "rotate(45deg)" : "rotate(0deg)",
                    transition: "transform 300ms ease",
                  }}
                />
              </button>

              <div className="w-px h-6 bg-white/10" />

              <button
                type="button"
                onClick={openDbPanel}
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all"
                title="Открыть БД (2)"
              >
                <Database className="w-5 h-5" />
              </button>

              <div className="w-px h-6 bg-white/10" />

              <button
                type="button"
                onClick={openFieldsPanel}
                data-testid="dock-fields-btn"
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isFieldsPanelOpen ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-200 hover:bg-white/10'
                }`}
                title="Fields (9)"
              >
                <Layers className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={openVisualizationsPanel}
                data-testid="dock-visualizations-btn"
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isVisualizationsPanelOpen ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-200 hover:bg-white/10'
                }`}
                title="Visualizations"
              >
                <BarChart3 className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={openFiltersPanel}
                data-testid="dock-filters-btn"
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isFiltersPanelOpen ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-200 hover:bg-white/10'
                }`}
                title="Filters (0)"
              >
                <Filter className="w-5 h-5" />
              </button>

              <div className="w-px h-6 bg-white/10" />

              <button
                type="button"
                onClick={() => setIsEditMode(!isEditMode)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isEditMode ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-200 hover:bg-white/10'
                }`}
                title={isEditMode ? "Exit edit mode (3)" : "Enter edit mode (3)"}
              >
                <Edit className="w-5 h-5" />
              </button>

              {isMenuExpanded && (
                <motion.div
                  key="actions"
                  initial={{opacity: 0, y: 20}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: 20}}
                  transition={{duration: 0.2}}
                  className="flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={onResetZoom}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all"
                    title="Reset Zoom (4)"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </button>

                  <div className="w-px h-6 bg-white/10" />

                  <button
                    type="button"
                    onClick={toggleChartConfig}
                    disabled={!activeChartId}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={activeChartId ? (isChartConfigOpen ? "Закрыть Chart Configuration (8)" : "Chart Configuration (8)") : "Select a chart"}
                  >
                    {isChartConfigOpen ? (
                      <Plus
                        className="w-5 h-5"
                        style={{
                          transform: "rotate(45deg)",
                          transition: "transform 300ms ease",
                        }}
                      />
                    ) : (
                      <SlidersHorizontal className="w-5 h-5" />
                    )}
                  </button>

                  <div className="w-px h-6 bg-white/10" />

                  <button
                    type="button"
                    onClick={handleSave}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all"
                    title="Сохранить (7)"
                  >
                    <Save className="w-5 h-5" />
                  </button>

                  {!!activeChartId && (
                    <button
                      type="button"
                      onClick={applySemanticTestQuery}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 transition-all"
                      title="Semantic test query"
                    >
                      <Sparkles className="w-5 h-5" />
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.button
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={spring}
              onClick={() => setIsMenuVisible(true)}
              className="flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
              title="Показать меню (Tab) / Расширенное меню (Ctrl+X)"
            >
              <ChevronUp className="w-6 h-6" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isAgentOpen && (
          <motion.div
            key="agent-panel"
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[min(720px,calc(100vw-24px))]"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={spring}
          >
            <div className="rounded-3xl bg-slate-950/80 backdrop-blur-2xl border border-white/10 shadow-2xl">
              <CommandBar ref={agentCommandBarRef as any} onCommand={handleAgentCommand} />
            </div>
          </motion.div>
        )}

        {pendingConfirm && (
          <motion.div
            key="agent-confirm"
            className="fixed inset-0 z-[2000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onMouseDown={() => setPendingConfirm(null)} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-[520px] rounded-3xl bg-slate-950 border border-white/10 shadow-2xl p-5">
                <div className="text-sm font-semibold text-white">Confirm</div>
                <div className="text-sm text-slate-300 mt-2">{pendingConfirm.message}</div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(null)}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        applyAgentToolCall(pendingConfirm.toolCall);
                      } finally {
                        setPendingConfirm(null);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-xs text-rose-200"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {openPanel === "library" && (
          <motion.div
            key="library-panel"
            ref={panelRef}
            className="absolute top-10 left-0 h-[calc(100%-2.5rem)] z-50"
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={spring}
          >
            <ChartLibrarySlideIn onClose={() => setActivePanel(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDbPanelOpen && (
          <motion.div
            key="db-panel"
            ref={dbPanelRef}
            className="absolute top-10 left-0 h-[calc(100%-2.5rem)] z-50"
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={spring}
          >
            <DbSlideInPanel onClose={() => setActivePanel(null)} targetChartId={targetChartId} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFieldsPanelOpen && (
          <motion.div
            key="fields-filters-panel"
            ref={fieldsPanelRef}
            className="absolute top-10 right-0 h-[calc(100%-2.5rem)] z-50"
            style={(() => {
              const base = (isChartConfigOpen ? (CHART_CONFIG_PANEL_WIDTH + RIGHT_PANEL_GAP) : 0);
              const filtersW = (isFiltersPanelOpen ? filtersPanelWidth : 0);
              const vizW = (isVisualizationsPanelOpen ? visualizationsPanelWidth : 0);
              const extraFilters = (filtersW ? (filtersW + RIGHT_PANEL_GAP) : 0);
              const extraViz = (vizW ? (vizW + RIGHT_PANEL_GAP) : 0);
              const right = base + extraFilters + extraViz;
              return right > 0 ? ({ right } as any) : undefined;
            })()}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={spring}
          >
            <FieldsSlideInPanel onClose={() => setActivePanel(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVisualizationsPanelOpen && (
          <motion.div
            key="visualizations-panel"
            ref={visualizationsPanelRef}
            className="absolute top-10 right-0 h-[calc(100%-2.5rem)] z-50"
            style={(() => {
              const base = (isChartConfigOpen ? (CHART_CONFIG_PANEL_WIDTH + RIGHT_PANEL_GAP) : 0);
              const filtersW = (isFiltersPanelOpen ? filtersPanelWidth : 0);
              const extraFilters = (filtersW ? (filtersW + RIGHT_PANEL_GAP) : 0);
              const right = base + extraFilters;
              return right > 0 ? ({ right } as any) : undefined;
            })()}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={spring}
          >
            <VisualizationsSlideInPanel onClose={() => setActivePanel(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFiltersPanelOpen && (
          <motion.div
            key="filters-panel"
            ref={filtersPanelRef}
            className="absolute top-10 right-0 h-[calc(100%-2.5rem)] z-50"
            style={isChartConfigOpen ? ({ right: (CHART_CONFIG_PANEL_WIDTH + RIGHT_PANEL_GAP) } as any) : undefined}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={spring}
          >
            <FiltersSlideInPanel onClose={() => setActivePanel(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </SemanticModelProvider>
  );
}
