"use client";

import { useState, useEffect } from "react";
import { Database, Server, Boxes, Warehouse, Cloud, Radio } from "lucide-react";

type StatusVariant = "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";
type StatusSize = "small" | "large";

interface DatabaseConnectionStatusProps {
  variant?: StatusVariant;
  size?: StatusSize;
  onClick?: () => void;
}

export function DatabaseConnectionStatus({
  variant = "primary",
  size = "small",
  onClick,
}: DatabaseConnectionStatusProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch("/api/connection/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const serverConnected = data.connected || false;
          setIsConnected(manualOverride !== null ? manualOverride : serverConnected);
        } else {
          setIsConnected(manualOverride !== null ? manualOverride : false);
        }
      } catch (err) {
        console.error("Failed to check DB connection:", err);
        setIsConnected(manualOverride !== null ? manualOverride : false);
      } finally {
        setIsLoading(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [manualOverride]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLoading || isToggling) return;

    setIsToggling(true);
    const newState = !isConnected;
    setManualOverride(newState);
    setIsConnected(newState);
    setTimeout(() => setIsToggling(false), 300);
  };

  const variantConfig = {
    primary: { icon: Database, title: "Database Connection", connected: "БД подключена", disconnected: "Подключить БД", loading: "Проверка...", accent: "emerald" },
    schema: { icon: Server, title: "Schema Intelligence", connected: "Schema ready", disconnected: "Configure schema", loading: "Checking...", accent: "blue" },
    vector: { icon: Boxes, title: "Vector Store", connected: "Vector DB active", disconnected: "Connect Vector DB", loading: "Checking...", accent: "purple" },
    warehouse: { icon: Warehouse, title: "Data Warehouse", connected: "Warehouse connected", disconnected: "Connect Warehouse", loading: "Checking...", accent: "amber" },
    cloud: { icon: Cloud, title: "Cloud Storage", connected: "Cloud connected", disconnected: "Connect Cloud", loading: "Checking...", accent: "cyan" },
    streaming: { icon: Radio, title: "Streaming Pipeline", connected: "Pipeline active", disconnected: "Connect Pipeline", loading: "Checking...", accent: "rose" },
  };

  const config = variantConfig[variant];
  const Icon = config.icon;
  const title = config.title;
  const subtitle = isLoading ? config.loading : isConnected ? config.connected : config.disconnected;

  const heightClass = size === "large" ? "h-48" : "h-32";
  const iconSize = size === "large" ? "w-12 h-12" : "w-8 h-8";
  const spacing = size === "large" ? "gap-3" : "gap-2";
  const showTitle = size === "large";

  const accentColor = config.accent;

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
              : isConnected 
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
              : isConnected 
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
                  : isConnected 
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

          {showTitle && (
            <span className={`
              relative z-10 text-sm font-medium tracking-wide uppercase transition-all duration-500
              ${isLoading ? "text-slate-600" : isConnected ? "text-slate-300" : "text-slate-500"}
            `}>
              {title}
            </span>
          )}

          {/* Текст статуса */}
          <span className={`
            relative z-10 text-xs font-medium transition-all duration-500
            ${isLoading 
              ? "text-slate-600" 
              : isConnected 
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
        </div>
      </button>

      {/* Индикатор-toggle */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading || isToggling}
        title={isConnected ? "Отключить БД" : "Подключить БД"}
        className={`
          absolute top-3 right-3 z-20 w-4 h-4 rounded-full
          transition-all duration-300 
          hover:scale-150 active:scale-90
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-800
          ${isLoading 
            ? "bg-slate-600 animate-pulse cursor-wait" 
            : isConnected 
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
    </div>
  );
}
