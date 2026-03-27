"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HomeIcon, X } from "lucide-react";
import { DatabaseConnectionStatus } from "../../components/home/DatabaseConnectionStatus";
import { DatabaseConnectionModal } from "../../components/connection/DatabaseConnectionModal";
import { DbExplorerModal } from "../../components/dashboard/DbExplorerModal";
import { MyProjects } from "../../components/home/MyProjects";
import { useConnectionState } from "../../providers";

type ConnectionVariant = "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";

interface ConnectedModule {
  driverId: string;
  driverName: string;
  displayName: string;
  variant: ConnectionVariant;
}

const MODULES_STORAGE_KEY = "pa_home_modules";
const MAX_SLOTS = 6;

function normalizeConnectionName(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Map driver categories to the closest ConnectionVariant */
function categoriesToVariant(categories: string[]): ConnectionVariant {
  if (categories.includes("stream")) return "streaming";
  if (categories.includes("cloud")) return "cloud";
  if (categories.includes("analytic")) return "warehouse";
  if (categories.includes("nosql")) return "vector";
  if (categories.includes("newsql")) return "schema";
  return "primary";
}

function loadModules(): (ConnectedModule | null)[] {
  if (typeof window === "undefined") return Array(MAX_SLOTS).fill(null);
  try {
    const raw = localStorage.getItem(MODULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as (ConnectedModule | null)[];
      // Ensure array is always MAX_SLOTS length and migrate old data
      const result = Array(MAX_SLOTS).fill(null);
      parsed.forEach((m, i) => { 
        if (i < MAX_SLOTS && m) {
          // Migrate old modules without displayName / normalize defaults
          // displayName is the user-editable title (default: "Database Connection")
          // driverName is shown in the bottom pill (e.g. POSTGRESQL)
          const normalizedDisplayName =
            !m.displayName || m.displayName === m.driverName
              ? "Database Connection"
              : m.displayName;
          result[i] = {
            ...m,
            displayName: normalizedDisplayName,
          };
        }
      });
      return result;
    }
  } catch { /* ignore */ }
  return Array(MAX_SLOTS).fill(null);
}

function saveModules(modules: (ConnectedModule | null)[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(modules));
}

export default function HomeClient() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Slots: each can be null (empty) or a connected module
  const [modules, setModules] = useState<(ConnectedModule | null)[]>(() => loadModules());

  const { activeConnection } = useConnectionState();
  const [projectsCount, setProjectsCount] = useState(0);

  // Wizard modal state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  // DB Explorer modal state
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerModule, setExplorerModule] = useState<ConnectedModule | null>(null);

  // Persist modules to localStorage
  useEffect(() => {
    saveModules(modules);
  }, [modules]);

  // Auto-seed Home slots from currently active backend connection (status API),
  // so pre-provisioned connections like Online_retail appear without manual wizard.
  useEffect(() => {
    const ac = activeConnection;
    if (!ac?.id) return;

    setModules((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : Array(MAX_SLOTS).fill(null);
      const acName = String(ac.name ?? "").trim();
      const acNameNorm = normalizeConnectionName(acName);
      let changed = false;

      let targetIdx = arr.findIndex((m) => m && String(m.driverId) === String(ac.id));
      if (targetIdx < 0 && acNameNorm) {
        targetIdx = arr.findIndex((m) => m && normalizeConnectionName(m.driverName) === acNameNorm);
      }

      if (targetIdx >= 0) {
        const existing = arr[targetIdx];
        if (existing) {
          const nextName = acName || existing.driverName;
          if (existing.driverId !== ac.id || existing.driverName !== nextName || existing.variant !== "primary") {
            arr[targetIdx] = { ...existing, driverId: ac.id, driverName: nextName, variant: "primary" };
            changed = true;
          }
        }
      } else {
        const emptyIdx = arr.findIndex((m) => !m);
        if (emptyIdx >= 0) {
          arr[emptyIdx] = {
            driverId: ac.id,
            driverName: acName || "Connected DB",
            displayName: "Database Connection",
            variant: "primary",
          };
          changed = true;
        }
      }

      // Remove duplicates by connection name (case-insensitive), keeping first occurrence.
      const seen = new Set<string>();
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (!m) continue;
        const key = normalizeConnectionName(m.driverName) || `id:${String(m.driverId)}`;
        if (seen.has(key)) {
          arr[i] = null;
          changed = true;
          continue;
        }
        seen.add(key);
      }

      return changed ? arr : prev;
    });
  }, [activeConnection]);

  const openWizard = useCallback((slotIndex: number) => {
    setActiveSlot(slotIndex);
    setWizardOpen(true);
  }, []);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setActiveSlot(null);
  }, []);

  const handleConnected = useCallback((driverId: string, driverName: string, driverCategories: string[]) => {
    if (activeSlot === null) return;
    const variant = categoriesToVariant(driverCategories);
    setModules((prev) => {
      const next = [...prev];
      next[activeSlot] = { driverId, driverName, displayName: "Database Connection", variant };
      return next;
    });
  }, [activeSlot]);

  const renameModule = useCallback((slotIndex: number, newName: string) => {
    setModules((prev) => {
      const next = [...prev];
      if (next[slotIndex]) {
        next[slotIndex] = { ...next[slotIndex]!, displayName: newName };
      }
      return next;
    });
  }, []);

  const removeModule = useCallback((slotIndex: number) => {
    setModules((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }, []);

  // Count how many slots to show: filled slots + up to 2 empty slots (min 2 total)
  const filledCount = modules.filter(Boolean).length;
  const visibleCount = Math.max(2, Math.min(filledCount + 2, MAX_SLOTS));

  return (
    <div className="relative min-h-screen overflow-hidden">
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
          
          {/* My Projects Section */}
          <MyProjects 
            onOpenProject={(projectId) => {
              router.push(`/dashboard?project=${projectId}`);
            }}
            onCreateProject={() => {
              router.push('/dashboard');
            }}
            onProjectsCountChange={setProjectsCount}
          />

          {filledCount === 0 && projectsCount === 0 && (
            <div className="rounded-3xl border border-white/15 bg-white/5 p-6">
              <div className="text-lg font-semibold text-white">Get started in 3 steps</div>
              <div className="mt-1 text-sm text-slate-400">Set up your first dashboard in under 2 minutes.</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Step 1</div>
                  <div className="mt-1 text-sm font-semibold text-white">Connect a database</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Step 2</div>
                  <div className="mt-1 text-sm font-semibold text-white">Open Dashboard</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Step 3</div>
                  <div className="mt-1 text-sm font-semibold text-white">Drag fields onto a chart</div>
                </div>
              </div>
            </div>
          )}

          {/* Database Module Slots */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.slice(0, visibleCount).map((mod, slotIndex) => (
              <div key={slotIndex} className="relative">
                {mod ? (
                  /* Connected module card */
                  <div className="relative">
                    <DatabaseConnectionStatus
                      variant={mod.variant}
                      size="large"
                      displayName={mod.displayName}
                      bottomLabel={mod.driverName}
                      onRename={(newName) => renameModule(slotIndex, newName)}
                      onClick={() => {
                        setExplorerModule(mod);
                        setExplorerOpen(true);
                      }}
                    />
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeModule(slotIndex); }}
                      className="absolute top-2 right-2 z-30 p-1.5 text-slate-400 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 hover:opacity-100"
                      style={{ opacity: 1 }}
                      title="Удалить модуль"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Empty "Connect to Data" slot */
                  <button
                    type="button"
                    onClick={() => openWizard(slotIndex)}
                    className="w-full h-48 rounded-2xl border-2 border-dashed border-slate-600/30 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-500/40 transition-all duration-300 flex flex-col items-center justify-center gap-3 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-700/30 flex items-center justify-center group-hover:bg-slate-700/50 transition-all">
                      <svg className="w-6 h-6 text-slate-500 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">Connect to Data</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pb-10" />
        </div>
      </div>

      <DatabaseConnectionModal
        isOpen={wizardOpen}
        onClose={closeWizard}
        onConnected={handleConnected}
      />

      <DbExplorerModal
        isOpen={explorerOpen}
        onClose={() => { setExplorerOpen(false); setExplorerModule(null); }}
        connectionId={activeConnection?.id ?? explorerModule?.driverId ?? ""}
        connectionName={explorerModule?.displayName ?? explorerModule?.driverName}
        connectionType={explorerModule?.driverId}
      />
    </div>
  );
}
