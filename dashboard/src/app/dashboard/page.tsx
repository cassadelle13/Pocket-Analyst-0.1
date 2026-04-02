"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "../../components/auth";
import { DragDropCanvas } from "../../components/dashboard/DragDropCanvas";
import { Plus, X } from "lucide-react";
import { dashboardEventBus } from "../../lib/dashboardEventBus";

interface DashboardTab {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const [effectiveProjectId, setEffectiveProjectId] = useState<string | undefined>(undefined);

  const MAX_TABS = 10;
  const TABS_STORAGE_KEY = "dashboard:tabs";
  const ACTIVE_TAB_STORAGE_KEY = "dashboard:activeTab";
  const LEGACY_NODES_KEY = "dashboard:nodes";

  const [tabs, setTabs] = useState<DashboardTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const storageKeyForTab = useCallback((tabId: string) => `dashboard:nodes:${tabId}`, []);

  useEffect(() => {
    try {
      const fromUrl = String(projectId ?? "").trim();
      if (fromUrl) {
        setEffectiveProjectId(fromUrl);
        return;
      }
      const fromStorage = String(window.localStorage.getItem("dashboard:semantic:projectId") ?? "").trim();
      setEffectiveProjectId(fromStorage || undefined);
    } catch {
      setEffectiveProjectId(String(projectId ?? "").trim() || undefined);
    }
  }, [projectId]);

  useEffect(() => {
    try {
      const rawTabs = window.localStorage.getItem(TABS_STORAGE_KEY);
      const rawActive = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);

      const parsedTabs = rawTabs ? (JSON.parse(rawTabs) as DashboardTab[]) : null;
      const initialTabs = Array.isArray(parsedTabs) && parsedTabs.length > 0
        ? parsedTabs
        : [{ id: `dash-${Date.now()}`, name: "Dashboard 1" }];

      setTabs(initialTabs);

      const nextActive = (rawActive && initialTabs.some((t) => t.id === rawActive))
        ? rawActive
        : initialTabs[0].id;
      setActiveTabId(nextActive);

      // Migrate legacy nodes into the first tab (one-time best-effort)
      const legacy = window.localStorage.getItem(LEGACY_NODES_KEY);
      if (legacy) {
        const firstTabId = initialTabs[0].id;
        const firstKey = storageKeyForTab(firstTabId);
        if (!window.localStorage.getItem(firstKey)) {
          window.localStorage.setItem(firstKey, legacy);
        }
      }
    } catch {
      const fallbackTab = { id: `dash-${Date.now()}`, name: "Dashboard 1" };
      setTabs([fallbackTab]);
      setActiveTabId(fallbackTab.id);
    }
  }, [storageKeyForTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
      if (activeTabId) {
        window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
        window.dispatchEvent(
          new CustomEvent("dashboard:tab-changed", {
            detail: { tabId: activeTabId, activeTabId },
          })
        );
        dashboardEventBus.publish("activeTabChanged", { tabId: activeTabId });
      }
    } catch {}
  }, [tabs, activeTabId]);

  const createNewTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= MAX_TABS) return prev;
      const newTab: DashboardTab = {
        id: `dash-${Date.now()}`,
        name: `Dashboard ${prev.length + 1}`,
      };
      setActiveTabId(newTab.id);
      return [...prev, newTab];
    });
  }, []);

  const deleteTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next[0]?.id ?? null);
      }
      return next.length > 0 ? next : prev;
    });

    try {
      window.localStorage.removeItem(storageKeyForTab(id));
    } catch {}
  }, [activeTabId, storageKeyForTab]);

  const startEditingTab = useCallback((tab: DashboardTab) => {
    setEditingTabId(tab.id);
    setEditingTabName(tab.name);
  }, []);

  const saveTabName = useCallback(() => {
    if (!editingTabId || !editingTabName.trim()) return;
    
    setTabs((prev) => 
      prev.map((tab) => 
        tab.id === editingTabId 
          ? { ...tab, name: editingTabName.trim() }
          : tab
      )
    );
    setEditingTabId(null);
    setEditingTabName("");
  }, [editingTabId, editingTabName]);

  const cancelEditingTab = useCallback(() => {
    setEditingTabId(null);
    setEditingTabName("");
  }, []);

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTabName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditingTab();
    }
  }, [saveTabName, cancelEditingTab]);

  // Calculate adaptive width for input
  const getInputWidth = useCallback((text: string) => {
    // Create a temporary span to measure text width
    const span = document.createElement('span');
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.style.fontSize = '0.875rem'; // text-sm
    span.style.fontWeight = '500'; // font-medium
    span.style.fontFamily = 'inherit';
    span.textContent = text || 'Dashboard'; // Minimum width text
    document.body.appendChild(span);
    const width = span.offsetWidth;
    document.body.removeChild(span);
    return Math.max(width + 20, 80); // Add padding and minimum width
  }, []);

  const activeStorageKey = useMemo(() => {
    if (!activeTabId) return null;
    return storageKeyForTab(activeTabId);
  }, [activeTabId, storageKeyForTab]);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
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
        <div className="relative h-screen">
          {/* Tabs + button floating over canvas */}
          <div className="absolute top-1 left-1 z-[60] flex items-center gap-2 rounded-lg px-2 py-2">
            <button
              onClick={createNewTab}
              disabled={tabs.length >= MAX_TABS}
              className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                tabs.length >= MAX_TABS
                  ? 'bg-transparent text-slate-600 cursor-not-allowed'
                  : 'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
              title="New dashboard tab"
            >
              <Plus className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-700" />

            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-2 px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                  activeTabId === tab.id
                    ? 'text-white bg-slate-800/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {editingTabId === tab.id ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onBlur={saveTabName}
                    onKeyDown={handleTabKeyDown}
                    className="text-sm font-medium bg-transparent border-b border-white/30 outline-none"
                    style={{ width: `${getInputWidth(editingTabName)}px` }}
                    autoFocus
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTabId(tab.id)}
                      onDoubleClick={() => startEditingTab(tab)}
                      className="text-sm font-medium"
                      title={`${tab.name} (Double-click to rename)`}
                    >
                      {tab.name}
                    </button>
                    {tabs.length > 1 && (
                      <button
                        onClick={() => deleteTab(tab.id)}
                        className="p-0.5 rounded transition-all duration-200 group"
                        title="Delete tab"
                      >
                        <X className="w-3 h-3 text-slate-400 group-hover:text-red-400 group-hover:drop-shadow-[0_0_6px_rgba(248,113,113,0.5)] transition-colors duration-200" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Canvas fills the screen */}
          <div className="relative w-full h-full">
            {activeTabId && activeStorageKey && (
              <DragDropCanvas
                key={activeTabId}
                storageKey={activeStorageKey}
                projectId={effectiveProjectId}
                activeTabId={activeTabId}
              />
            )}
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
