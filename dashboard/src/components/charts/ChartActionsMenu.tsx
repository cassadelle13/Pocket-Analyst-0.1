"use client";

import {useMemo, useState, useRef, useEffect, useCallback} from "react";
import {createPortal} from "react-dom";
import {useChartEnvironment, type ChartAction} from "@/context/ChartEnvironment";
import { useLanguage } from "../../providers/LanguageProvider";
import {MoreVertical} from "lucide-react";

interface Props {
  chartId?: string;
  params?: Record<string, unknown>;
  className?: string;
}

export function ChartActionsMenu({chartId, params, className}: Props) {
  const { t } = useLanguage();
  const {actions} = useChartEnvironment();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const groupButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeGroup, setActiveGroup] = useState<"open" | "export" | "settings" | null>(null);
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [submenuTop, setSubmenuTop] = useState(0);

  const isDbConnected = useMemo(() => {
    const chartData = (params as any)?.chartData;
    if (!chartData || typeof chartData !== "object") return false;
    if (String(chartData?.kind ?? "") === "db-table") {
      const hasConn = String(chartData?.connectionId ?? "").trim() !== "";
      const hasTable = String(chartData?.tableKey ?? "").trim() !== "";
      return hasConn && hasTable;
    }
    const ds = chartData?.dataSource;
    if (ds && typeof ds === "object" && String(ds?.kind ?? "") === "table") {
      const hasConn = String(ds?.connectionId ?? "").trim() !== "";
      const hasTable = String(ds?.tableKey ?? "").trim() !== "";
      return hasConn && hasTable;
    }
    return false;
  }, [params]);

  const submenuLabelOverride = useMemo(() => {
    return new Map<string, string>([
      ["open-new-tab", t({ ru: "В новой вкладке", en: "In new tab" })],
      ["open-as-table", t({ ru: "Как таблицу", en: "As table" })],
      ["open-as-slicer", t({ ru: "Как slicer", en: "As slicer" })],
      ["export-png", "PNG"],
      ["export-csv", "CSV"],
      ["ai-config", "AI-config"],
      ["manual-config", t({ ru: "Ручная", en: "Manual" })],
    ]);
  }, [t]);

  useEffect(() => {
    if (!open) {
      setActiveGroup(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeGroup) return;
    const menuEl = menuRef.current;
    const btn = groupButtonRefs.current[activeGroup];
    if (!menuEl || !btn) return;

    const menuRect = menuEl.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const top = Math.max(0, Math.round(btnRect.top - menuRect.top));
    setSubmenuTop(top);
  }, [activeGroup, open]);

  const visibleActions = actions.filter((a: ChartAction) => (a.isVisible ? a.isVisible({chartId, params}) : true));
  const actionById = useMemo(() => {
    const m = new Map<string, ChartAction>();
    for (const a of visibleActions) m.set(a.id, a);
    return m;
  }, [visibleActions]);

  const runAction = useCallback(
    (id: string) => {
      const action = actionById.get(id);
      if (!action) return;
      action.onClick({chartId, params});
    },
    [actionById, chartId, params]
  );

  const MENU_WIDTH = 260;
  const SUBMENU_WIDTH = 260;

  const menuStyle = useMemo(() => {
    if (!anchorRect) return undefined;
    // Position: right edge of menu aligns with left edge of anchor, top aligns with anchor top
    const left = Math.max(8, Math.round(anchorRect.left - MENU_WIDTH - 8));
    const top = Math.round(anchorRect.top);
    return { top, left };
  }, [anchorRect]);

  const groups = useMemo(
    () => [
      {
        id: "open" as const,
        label: t({ ru: "Открыть", en: "Open" }),
        items: [
          {id: "open-new-tab"},
          {id: "open-as-table"},
          {id: "open-as-slicer"},
          {id: "fullscreen"},
        ],
      },
      {
        id: "export" as const,
        label: t({ ru: "Экспорт", en: "Export" }),
        items: [
          {id: "export-png"},
          {id: "export-csv"},
        ],
      },
      {
        id: "settings" as const,
        label: t({ ru: "Настройки", en: "Settings" }),
        items: [
          {id: "ai-config"},
          {id: "manual-config"},
          {id: "explain"},
        ],
      },
    ],
    [t]
  );

  const primaryActions = useMemo(() => {
    return ["connect-db"] as const;
  }, []);

  const groupedActionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const it of g.items) {
        ids.add(String((it as any).id));
      }
    }
    for (const id of primaryActions) ids.add(id);
    return ids;
  }, [groups, primaryActions]);

  const standaloneActions = useMemo(
    () => visibleActions.filter((a) => !groupedActionIds.has(a.id)),
    [visibleActions, groupedActionIds]
  );

  const renderedMenu = open ? (
    <div className="fixed inset-0 z-[2000]" aria-hidden={!open}>
      <div
        className="absolute inset-0"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }}
      />

      <div
        ref={menuRef}
        className="absolute rounded-2xl bg-slate-950/80 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/60 p-1.5"
        style={{
          ...menuStyle as any,
          transformOrigin: 'top right',
          animation: 'menuSlideIn 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        role="menu"
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onMouseLeave={() => setActiveGroup(null)}
      >
        <div className="relative flex">
          <div style={{width: MENU_WIDTH}} className="flex flex-col gap-1">
            {primaryActions.some((id) => actionById.has(id)) && (
              <>
                <div className="flex flex-col gap-1">
                  {primaryActions.map((id) => {
                    const action = actionById.get(id);
                    if (!action) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onMouseEnter={() => setActiveGroup(null)}
                        onFocus={() => setActiveGroup(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          action.onClick({chartId, params});
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>{action.label}</span>
                          {id === "connect-db" && (
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${
                                isDbConnected ? "bg-emerald-400" : "bg-slate-500"
                              }`}
                              title={isDbConnected ? "DB connected" : "Not connected"}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="my-2 h-px bg-white/10" />
              </>
            )}

            <div className="flex flex-col gap-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  ref={(el) => {
                    groupButtonRefs.current[g.id] = el;
                  }}
                  onMouseEnter={() => setActiveGroup(g.id)}
                  onFocus={() => setActiveGroup(g.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveGroup((prev) => (prev === g.id ? null : g.id));
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 rounded-xl transition-colors flex items-center justify-between"
                >
                  <span>{g.label}</span>
                  <span className="text-slate-400">&gt;</span>
                </button>
              ))}
            </div>

            {standaloneActions.length > 0 && (
              <div className="my-2 h-px bg-white/10" />
            )}

            <div className="flex flex-col gap-1">
              {standaloneActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onMouseEnter={() => setActiveGroup(null)}
                  onFocus={() => setActiveGroup(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    action.onClick({chartId, params});
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 rounded-xl transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {activeGroup && (
            <div
              className="absolute left-full ml-3 rounded-2xl bg-slate-950/80 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/60 p-1.5"
              style={{
                top: submenuTop,
                width: SUBMENU_WIDTH,
                transformOrigin: 'top left',
                animation: 'submenuSlideIn 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <div className="flex flex-col gap-1">
                {groups
                  .find((g) => g.id === activeGroup)
                  ?.items.map((it) => (
                    <button
                      key={(it as any).id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        runAction(String((it as any).id));
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 rounded-xl transition-colors"
                      disabled={!actionById.has(String((it as any).id))}
                      title={!actionById.has(String((it as any).id)) ? t({ ru: "Недоступно", en: "Unavailable" }) : undefined}
                    >
                      {submenuLabelOverride.get(String((it as any).id)) ?? actionById.get(String((it as any).id))?.label ?? String((it as any).id)}
                    </button>
                  ))}
              </div>
              {groups.find((g) => g.id === activeGroup)?.items.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">{t({ ru: "Нет действий", en: "No actions" })}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const animationStyle = open ? (
    <style>{`
      @keyframes menuSlideIn {
        0% {
          opacity: 0;
          transform: translateX(40px) scale(0.95);
        }
        50% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
        100% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
      @keyframes submenuSlideIn {
        0% {
          opacity: 0;
          transform: translateX(-12px) scale(0.95);
        }
        100% {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
    `}</style>
  ) : null;

  return (
    <div className={className ?? "relative inline-block text-left"}>
      {animationStyle}
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          setAnchorRect({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
          setOpen((v) => {
            const next = !v;
            if (next) setActiveGroup(null);
            return next;
          });
        }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t({ ru: "Действия", en: "Actions" })}
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(renderedMenu, document.body) : null}
    </div>
  );
}
