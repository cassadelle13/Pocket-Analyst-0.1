"use client";

import React, { useState, useRef, useEffect } from "react";
import { Edit3, X } from "lucide-react";
import { ChartActionsMenu } from "../charts/ChartActionsMenu";

export function ChartWindow({
  id,
  title,
  onRename,
  onDelete,
  isActive,
  onHeaderClick,
  onHeaderMouseDown,
  chartData,
  chartName,
  chartKind,
  children,
  isEditMode,
}: {
  id: string;
  title: string;
  onRename: (newTitle: string) => void;
  onDelete?: () => void;
  isActive?: boolean;
  onHeaderClick?: () => void;
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  chartData?: any;
  chartName?: string;
  chartKind?: string;
  children: React.ReactNode;
  isEditMode?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const v = value.trim();
    if (v && v !== title) onRename(v);
    setEditing(false);
  };

  const shouldIgnoreHeaderEvent = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    return Boolean(el.closest('[data-chart-actions="true"]'));
  };

  return (
    <div
      className={`flex flex-col h-full w-full rounded-xl border bg-slate-900/70 backdrop-blur-md overflow-hidden transition-all duration-300 ${
        isActive
          ? "border-emerald-400/90 ring-2 ring-emerald-400/60 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          : "border-white/15 shadow-xl"
      }`}
    >
      {/* Header */}
      <div
        data-node-drag-handle="true"
        className={`flex items-center justify-between px-3 py-2 border-b bg-slate-900/70 transition-colors duration-300 ${
          isActive ? "border-transparent" : "border-white/10"
        }`}
        onMouseDownCapture={(e) => {
          if (shouldIgnoreHeaderEvent(e)) return;
          onHeaderMouseDown?.(e);
        }}
        onClickCapture={(e) => {
          if (shouldIgnoreHeaderEvent(e)) return;
          onHeaderClick?.();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 text-[10px] font-bold tracking-wider text-emerald-200">
              SELECTED
            </span>
          )}
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setValue(title);
                  setEditing(false);
                }
              }}
              className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-sm border border-white/10 outline-none"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setEditing(true)}
              title="Double-click to edit"
              className="text-sm font-semibold text-white truncate max-w-[340px] text-left"
            >
              {title}
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1 rounded-md hover:bg-white/10 text-slate-300"
              title="Rename"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {/* Edit Mode indicator - only for tables */}
          {isEditMode && (chartKind === "Table" || chartName?.includes("Table")) && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              Edit
            </span>
          )}
          <div data-chart-actions="true">
            <ChartActionsMenu chartId={id} params={{ chartData, chartTitle: title, chartName, chartKind }} />
          </div>
          {onDelete && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmOpen((v) => !v);
                }}
                className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors"
                title="Delete chart"
              >
                <X className="w-4 h-4" />
              </button>
              {deleteConfirmOpen && (
                <div className="absolute right-0 top-8 z-30 w-64 rounded-xl border border-rose-500/25 bg-slate-950/95 p-3 shadow-2xl">
                  <div className="text-xs text-slate-200">Delete this chart? This cannot be undone.</div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmOpen(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmOpen(false);
                        onDelete();
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/25"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
