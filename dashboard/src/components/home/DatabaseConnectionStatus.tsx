"use client";

import { useState, useEffect } from "react";
import { Database, Server, Boxes, Warehouse, Cloud, Radio, Edit3 } from "lucide-react";

type StatusVariant = "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";
type StatusSize = "small" | "large" | "compact";

interface DatabaseConnectionStatusProps {
  variant?: StatusVariant;
  size?: StatusSize;
  onClick?: () => void;
  displayName?: string;
  onRename?: (newName: string) => void;
  bottomLabel?: string;
  isConnectedOverride?: boolean;
  onToggleConnection?: (nextState: boolean) => void;
}

export function DatabaseConnectionStatus({
  variant = "primary",
  size = "small",
  onClick,
  displayName,
  onRename,
  bottomLabel,
  isConnectedOverride,
  onToggleConnection,
}: DatabaseConnectionStatusProps) {
  const isPrimary = variant === "primary";
  const isCompact = size === "compact";
  const [serverConnected, setServerConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(displayName || "");

  useEffect(() => {
    if (!isPrimary) {
      setServerConnected(false);
      setIsLoading(false);
      setManualOverride(null);
      return;
    }

    const checkConnection = async () => {
      try {
        const res = await fetch("/api/connection/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const serverConnected = data.connected || false;
          setServerConnected(serverConnected);
        } else {
          setServerConnected(false);
        }
      } catch (err) {
        console.error("Failed to check DB connection:", err);
        setServerConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [isPrimary, manualOverride, refreshNonce]);

  // Sync edit value with display name
  useEffect(() => {
    setEditNameValue(displayName || "Database Connection");
  }, [displayName]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPrimary && !onToggleConnection) return;
    if (isLoading || isToggling) return;

    const nextState = !effectiveConnected;

    if (onToggleConnection) {
      onToggleConnection(nextState);
      return;
    }

    setIsToggling(true);
    setManualOverride(nextState);
    setTimeout(() => setIsToggling(false), 300);
  };

  const handleEditName = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditNameValue(displayName || "Database Connection");
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== displayName && onRename) {
      onRename(trimmed);
    } else {
      setEditNameValue(displayName || "Database Connection");
    }
    setIsEditingName(false);
  };

  const handleCancelName = () => {
    setEditNameValue(displayName || "Database Connection");
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      handleCancelName();
    }
  };

  const variantConfig = {
    primary: { icon: Database, title: "Database Connection", connected: "Database connected", disconnected: "Connect database", loading: "Checking...", accent: "emerald" },
    schema: { icon: Server, title: "Schema Intelligence", connected: "Schema ready", disconnected: "Configure schema", loading: "Checking...", accent: "blue" },
    vector: { icon: Boxes, title: "Vector Store", connected: "Vector DB active", disconnected: "Connect Vector DB", loading: "Checking...", accent: "purple" },
    warehouse: { icon: Warehouse, title: "Data Warehouse", connected: "Warehouse connected", disconnected: "Connect Warehouse", loading: "Checking...", accent: "amber" },
    cloud: { icon: Cloud, title: "Cloud Storage", connected: "Cloud connected", disconnected: "Connect Cloud", loading: "Checking...", accent: "cyan" },
    streaming: { icon: Radio, title: "Streaming Pipeline", connected: "Pipeline active", disconnected: "Connect Pipeline", loading: "Checking...", accent: "rose" },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;
  const variantTitle = config.title;

  const effectiveConnected = typeof isConnectedOverride === "boolean"
    ? isConnectedOverride
    : isPrimary
      ? (manualOverride !== null ? manualOverride : serverConnected)
      : false;

  const subtitle = isLoading ? config.loading : effectiveConnected ? config.connected : config.disconnected;

  const heightClass = size === "large" ? "h-48" : "h-32";
  const iconSize = size === "large" ? "w-12 h-12" : "w-8 h-8";
  const spacing = size === "large" ? "gap-3" : "gap-2";
  const showTitle = size === "large";

  const canToggle = isPrimary || !!onToggleConnection;

  const accentColor = config.accent;

  if (isCompact) {
    return (
      <div
        className={`
          w-full rounded-2xl border px-3 py-2 flex items-center gap-3
          bg-slate-900/40
          ${isLoading
            ? "border-slate-600/50"
            : effectiveConnected
              ? accentColor === "blue" ? "border-blue-500/40"
                : accentColor === "purple" ? "border-purple-500/40"
                : accentColor === "amber" ? "border-amber-500/40"
                : accentColor === "cyan" ? "border-cyan-500/40"
                : accentColor === "rose" ? "border-rose-500/40"
                : "border-emerald-500/40"
              : "border-white/10"
          }
        `}
      >
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          className="flex-1 text-left text-sm font-semibold text-white/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {displayName || "Database Connection"}
        </button>

        <button
          type="button"
          onClick={handleToggle}
          disabled={isLoading || isToggling || !canToggle}
          className={`
            w-4 h-4 rounded-full transition-all duration-300 flex-shrink-0
            focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900
            ${isLoading
              ? "bg-slate-600 animate-pulse cursor-wait"
              : effectiveConnected
                ? accentColor === "blue" ? "bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.6)]"
                  : accentColor === "purple" ? "bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]"
                  : accentColor === "amber" ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                  : accentColor === "cyan" ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.6)]"
                  : accentColor === "rose" ? "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]"
                  : "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                : "bg-slate-600 hover:bg-slate-500"
            }
          `}
          title={
            !canToggle
              ? "Not available"
              : effectiveConnected
                ? "Disconnect DB"
                : "Connect DB"
          }
          aria-label={effectiveConnected ? "Toggle connection: disconnect" : "Toggle connection: connect"}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="w-full focus:outline-none disabled:cursor-not-allowed"
      >
        <div
          className={`
            relative w-full ${heightClass} rounded-2xl
            transition-all duration-500 cursor-pointer
            flex flex-col items-center justify-center ${spacing}
            bg-slate-800/60 hover:bg-slate-800/80
            ${isLoading 
              ? "border-2 border-dashed border-slate-600/40" 
              : effectiveConnected 
                ? `border border-solid ${
                    accentColor === "blue" ? "border-blue-500/40" 
                    : accentColor === "purple" ? "border-purple-500/40"
                    : accentColor === "amber" ? "border-amber-500/40"
                    : accentColor === "cyan" ? "border-cyan-500/40"
                    : accentColor === "rose" ? "border-rose-500/40"
                    : "border-emerald-500/40"
                  }`
                : "border-2 border-dashed border-slate-600/30 hover:border-slate-500/40"
            }
          `}
        >
          {/* Иконка */}
          <div className={`
            relative z-10 ${size === "large" ? "p-4" : "p-3"} rounded-xl transition-all duration-500
            ${isLoading 
              ? "bg-slate-700/30" 
              : effectiveConnected 
                ? accentColor === "blue" ? "bg-blue-500/15"
                  : accentColor === "purple" ? "bg-purple-500/15"
                  : accentColor === "amber" ? "bg-amber-500/15"
                  : accentColor === "cyan" ? "bg-cyan-500/15"
                  : accentColor === "rose" ? "bg-rose-500/15"
                  : "bg-emerald-500/15"
                : "bg-slate-700/30"
            }
          `}>
            <Icon 
              className={`
                ${iconSize} transition-all duration-500
                ${isLoading 
                  ? "text-slate-600" 
                  : effectiveConnected 
                    ? accentColor === "blue" ? "text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      : accentColor === "purple" ? "text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                      : accentColor === "amber" ? "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      : accentColor === "cyan" ? "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      : accentColor === "rose" ? "text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                      : "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : "text-slate-600"
                }
              `}
            />
          </div>

          {/* Название БД сверху */}
          {showTitle && (
            <div className="relative z-10 flex items-center justify-center gap-1">
              {isEditingName ? (
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleSaveName}
                  className="bg-slate-700/50 border border-white/20 rounded px-1 py-0.5 text-sm font-medium tracking-wide uppercase text-white text-center outline-none focus:border-emerald-400/60"
                  style={{ minWidth: "140px" }}
                  autoFocus
                />
              ) : (
                <>
                  <span className={`
                    text-sm font-medium tracking-wide uppercase transition-all duration-500
                    ${isLoading ? "text-slate-600" : effectiveConnected ? "text-slate-300" : "text-slate-500"}
                  `}>
                    {displayName || "Database Connection"}
                  </span>
                  {onRename && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={handleEditName as any}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleEditName(e as any);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-white/10 transition-colors opacity-80 hover:opacity-100"
                      title="Rename"
                    >
                      <Edit3 className="w-4 h-4 text-slate-200" />
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Текст статуса */}
          <span className={`
            relative z-10 text-xs font-medium transition-all duration-500
            ${isLoading 
              ? "text-slate-600" 
              : effectiveConnected 
                ? accentColor === "blue" ? "text-blue-400/80"
                  : accentColor === "purple" ? "text-purple-400/80"
                  : accentColor === "amber" ? "text-amber-400/80"
                  : accentColor === "cyan" ? "text-cyan-400/80"
                  : accentColor === "rose" ? "text-rose-400/80"
                  : "text-emerald-400/80"
                : "text-slate-500"
            }
          `}>
            {subtitle}
          </span>

          {/* Тип/драйвер БД внизу */}
          {showTitle && (
            <span
              className={`
                relative z-10 text-[10px] font-medium tracking-wide uppercase transition-all duration-500
                ${isLoading
                  ? "text-slate-600/70"
                  : effectiveConnected
                    ? "text-slate-400/80"
                    : "text-slate-500/70"
                }
              `}
            >
              {String(bottomLabel || variantTitle).toUpperCase()}
            </span>
          )}
        </div>
      </button>

      {/* Индикатор-toggle */}
      {!isCompact && (
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isLoading || isToggling || !canToggle}
            title={
              !canToggle
                ? "Not available"
                : effectiveConnected
                  ? "Disconnect DB"
                  : "Connect DB"
            }
            aria-label={effectiveConnected ? "Toggle connection: disconnect" : "Toggle connection: connect"}
            className={`
              w-3.5 h-3.5 rounded-full
              transition-all duration-300
              hover:scale-150 active:scale-90
              focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-800
              ${isLoading
                ? "bg-slate-600 animate-pulse cursor-wait"
                : effectiveConnected
                  ? accentColor === "blue" ? "bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.6)] hover:bg-blue-300 focus:ring-blue-500/50"
                    : accentColor === "purple" ? "bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)] hover:bg-purple-300 focus:ring-purple-500/50"
                    : accentColor === "amber" ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)] hover:bg-amber-300 focus:ring-amber-500/50"
                    : accentColor === "cyan" ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.6)] hover:bg-cyan-300 focus:ring-cyan-500/50"
                    : accentColor === "rose" ? "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)] hover:bg-rose-300 focus:ring-rose-500/50"
                    : "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] hover:bg-emerald-300 focus:ring-emerald-500/50"
                  : "bg-slate-600 hover:bg-slate-500 focus:ring-slate-500/50"
              }
            `}
          />
          <span className="text-[10px] font-semibold text-slate-300">{effectiveConnected ? "Connected" : "Disconnected"}</span>
          {isPrimary && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRefreshNonce((v) => v + 1);
              }}
              className="px-2 py-0.5 rounded-md border border-white/10 bg-black/20 text-[10px] text-slate-300 hover:bg-white/10"
              title="Refresh connection status"
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}
