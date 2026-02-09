"use client";

import React, { useState, useRef, useEffect } from "react";
import { Edit3 } from "lucide-react";
import { ChartActionsMenu } from "../charts/ChartActionsMenu";

export function ChartWindow({
  id,
  title,
  onRename,
  children,
}: {
  id: string;
  title: string;
  onRename: (newTitle: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
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

  return (
    <div className="flex flex-col h-full w-full rounded-xl border border-white/15 bg-slate-900/70 backdrop-blur-md shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-slate-900/70">
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
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
              title="Двойной клик для редактирования"
              className="text-sm font-semibold text-white truncate max-w-[340px] text-left"
            >
              {title}
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 rounded-md hover:bg-white/10 text-slate-300"
              title="Переименовать"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
        <ChartActionsMenu chartId={id} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
