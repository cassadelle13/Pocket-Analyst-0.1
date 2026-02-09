"use client";

import {useState, useRef, useEffect} from "react";
import {useChartEnvironment, type ChartAction} from "@/context/ChartEnvironment";
import {MoreVertical} from "lucide-react";

interface Props {
  chartId?: string;
  params?: Record<string, unknown>;
  className?: string;
}

export function ChartActionsMenu({chartId, params, className}: Props) {
  const {actions} = useChartEnvironment();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const visibleActions = actions.filter((a: ChartAction) => a.isVisible ? a.isVisible({chartId, params}) : true);

  return (
    <div ref={ref} className={className ?? "relative inline-block text-left"}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 border border-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" />
        <span className="text-xs">Действия</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900/95 border border-white/10 shadow-xl z-50 p-1">
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); action.onClick({chartId, params}); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-white/5 rounded-lg"
            >
              {action.label}
            </button>
          ))}
          {visibleActions.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Нет действий</div>
          )}
        </div>
      )}
    </div>
  );
}
