"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Text, Title } from "@tremor/react";
import { Database, Server, Boxes, Warehouse, Cloud, Radio, HomeIcon } from "lucide-react";
import { DatabaseConnectionStatus } from "../../components/home/DatabaseConnectionStatus";
import { DatabaseConnectionModal } from "../../components/connection/DatabaseConnectionModal";

type ConnectionVariant = "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";

const DB_TYPE_OPTIONS: { variant: ConnectionVariant; label: string; icon: typeof Database; accent: string }[] = [
  { variant: "primary", label: "Database", icon: Database, accent: "text-emerald-400" },
  { variant: "schema", label: "Schema Intelligence", icon: Server, accent: "text-blue-400" },
  { variant: "vector", label: "Vector Store", icon: Boxes, accent: "text-purple-400" },
  { variant: "warehouse", label: "Data Warehouse", icon: Warehouse, accent: "text-amber-400" },
  { variant: "cloud", label: "Cloud Storage", icon: Cloud, accent: "text-cyan-400" },
  { variant: "streaming", label: "Streaming Pipeline", icon: Radio, accent: "text-rose-400" },
];

export default function HomeClient() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connectionModal, setConnectionModal] = useState<{
    open: boolean;
    variant: ConnectionVariant;
  }>({ open: false, variant: "primary" });
  const [addMenuOpen, setAddMenuOpen] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const openConnectionModal = (variant: ConnectionVariant) => {
    setConnectionModal({ open: true, variant });
    setAddMenuOpen(null);
  };

  const closeConnectionModal = () => {
    setConnectionModal((prev) => ({ ...prev, open: false }));
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(null);
      }
    };
    if (addMenuOpen !== null) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addMenuOpen]);

  
  return (
    <div className="relative min-h-screen bg-slate-950 overflow-hidden">
      {/* Динамический градиент в стиле нефтяного пятна */}
      <div className="absolute inset-0 opacity-15">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-purple-950 to-slate-900 opacity-60 animate-pulse" style={{ animationDelay: '3s', animationDuration: '12s' }} />
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-amber-950/20 to-orange-950/10 rounded-full blur-[150px] opacity-30 animate-blob" />
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-rose-950/20 to-pink-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-gradient-to-tr from-violet-950/20 to-purple-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '4s' }} />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-teal-950/15 to-cyan-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '6s' }} />
        <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-gradient-to-tl from-indigo-950/15 to-blue-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '8s' }} />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-emerald-950/10 to-teal-950/5 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '10s' }} />
      </div>
      
      <div ref={containerRef} className="relative h-screen overflow-y-auto">
        <div className="px-8 py-8 space-y-8">
          {/* Page Header */}
          <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-2xl border border-emerald-400/20">
                <HomeIcon className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Home</h1>
                <p className="text-slate-300 mt-2">Подключи свою БД и начни работу прямо сейчас!</p>
              </div>
            </div>
          </div>

          {/* Database Connection Buttons - Large, side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DatabaseConnectionStatus
              size="large"
              variant="primary"
              onClick={() => openConnectionModal("primary")}
            />
            <DatabaseConnectionStatus
              size="large"
              variant="schema"
              onClick={() => openConnectionModal("schema")}
            />
          </div>

          {/* Additional Database Connections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DatabaseConnectionStatus
              size="large"
              variant="vector"
              onClick={() => openConnectionModal("vector")}
            />
            <DatabaseConnectionStatus
              size="large"
              variant="warehouse"
              onClick={() => openConnectionModal("warehouse")}
            />
          </div>

          {/* More Database Connections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DatabaseConnectionStatus
              size="large"
              variant="cloud"
              onClick={() => openConnectionModal("cloud")}
            />
            <DatabaseConnectionStatus
              size="large"
              variant="streaming"
              onClick={() => openConnectionModal("streaming")}
            />
          </div>

          {/* Empty Placeholder Slots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[0, 1].map((slotIndex) => (
              <div key={slotIndex} className="relative">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen(addMenuOpen === slotIndex ? null : slotIndex)}
                  className="w-full h-48 rounded-2xl border-2 border-dashed border-slate-600/30 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-500/40 transition-all duration-300 flex flex-col items-center justify-center gap-3 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-700/30 flex items-center justify-center group-hover:bg-slate-700/50 transition-all">
                    <svg className="w-6 h-6 text-slate-500 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">Add Module</span>
                </button>

                {addMenuOpen === slotIndex && (
                  <div
                    ref={menuRef}
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-64 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 py-2 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  >
                    <div className="px-3 py-2 border-b border-white/10">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select DB Type</span>
                    </div>
                    {DB_TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.variant}
                          type="button"
                          onClick={() => openConnectionModal(opt.variant)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <Icon className={`w-4 h-4 ${opt.accent}`} />
                          <span className="text-sm text-slate-300">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          
          <div className="pb-10" />
        </div>
      </div>
      <DatabaseConnectionModal
        isOpen={connectionModal.open}
        variant={connectionModal.variant}
        onClose={closeConnectionModal}
      />
    </div>
  );
}
