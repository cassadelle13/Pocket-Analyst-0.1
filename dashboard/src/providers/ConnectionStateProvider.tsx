"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { ConnectivityProtocol } from "../lib/db-drivers/types";

interface ActiveConnection {
  id: string;
  name: string;
  type: ConnectivityProtocol;
  connectedAt: string;
}

interface ConnectionStateContextType {
  activeConnection: ActiveConnection | null;
  isLoading: boolean;
  isConnecting: boolean;
  setActiveConnection: (conn: ActiveConnection | null) => void;
  refreshConnectionState: () => Promise<void>;
  connect: (config: any) => Promise<void>;
}

const ConnectionStateContext = createContext<ConnectionStateContextType | undefined>(undefined);

const STORAGE_KEY = "pocketanalyst_active_connection";

export function ConnectionStateProvider({ children }: { children: ReactNode }) {
  const [activeConnection, setActiveConnectionState] = useState<ActiveConnection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async (config: any) => {
    setIsConnecting(true);
    try {
      const conn: ActiveConnection = {
        id: config.driver?.id || "manual",
        name: config.driver?.name || config.basicSettings?.host || "Database",
        type: config.driver?.connectivity?.protocol || "clickhouse",
        connectedAt: new Date().toISOString(),
      };
      setActiveConnectionState(conn);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const refreshConnectionState = useCallback(async () => {
    setIsLoading(true);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      try {
        ctrl.abort();
      } catch {}
    }, 2500);
    try {
      // Check localStorage first for fast initial load
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as ActiveConnection;
            setActiveConnectionState(parsed);
          } catch {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }

      let validIds: Set<string> | null = null;
      try {
        const listRes = await fetch("/api/datatalk/connections", { cache: "no-store", signal: ctrl.signal });
        if (listRes.ok) {
          const listJson = await listRes.json().catch(() => ({}));
          const rows = Array.isArray(listJson?.data) ? listJson.data : [];
          validIds = new Set(rows.map((r: { id?: string }) => String(r?.id ?? "").trim()).filter(Boolean));
        }
      } catch {
        validIds = null;
      }

      const storedParsed = (() => {
        if (typeof window === "undefined") return null;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        try {
          return JSON.parse(stored) as ActiveConnection;
        } catch {
          return null;
        }
      })();

      if (storedParsed?.id) {
        if (!validIds || validIds.has(String(storedParsed.id))) {
          setActiveConnectionState(storedParsed);
          if (!validIds) {
            return;
          }
          return;
        }
        setActiveConnectionState(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      const res = await fetch("/api/connection/status", { cache: "no-store", signal: ctrl.signal });
      if (res.ok) {
        const data = await res.json();
        if (data.connected && data.connection) {
          const conn: ActiveConnection = {
            id: data.connection.id,
            name: data.connection.name,
            type: data.connection.type,
            connectedAt: data.connection.connectedAt || new Date().toISOString(),
          };
          if (!validIds || validIds.has(conn.id)) {
            setActiveConnectionState(conn);
            if (typeof window !== "undefined") {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
            }
          }
        } else {
          setActiveConnectionState(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (err) {
      console.warn("[ConnectionState] Failed to refresh connection state:", err);
    } finally {
      try {
        window.clearTimeout(t);
      } catch {}
      setIsLoading(false);
    }
  }, []);

  const setActiveConnection = useCallback((conn: ActiveConnection | null) => {
    setActiveConnectionState(conn);
    if (typeof window !== "undefined") {
      if (conn) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Silent background health-check — never touches isLoading to avoid canvas remount
  const silentHealthCheck = useCallback(async () => {
    try {
      const res = await fetch("/api/connection/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (!data?.connected) {
        // Agent is down — only clear state when localStorage is also empty
        // (keeps UI usable if agent temporarily restarts)
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        if (!stored) setActiveConnectionState(null);
      }
    } catch {
      // Network error / timeout — ignore, don't disrupt UX
    }
  }, []);

  useEffect(() => {
    refreshConnectionState();
  }, [refreshConnectionState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void silentHealthCheck();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [silentHealthCheck]);

  return (
    <ConnectionStateContext.Provider
      value={{
        activeConnection,
        isLoading,
        isConnecting,
        setActiveConnection,
        refreshConnectionState,
        connect,
      }}
    >
      {children}
    </ConnectionStateContext.Provider>
  );
}

export function useConnectionState() {
  const context = useContext(ConnectionStateContext);
  if (context === undefined) {
    throw new Error("useConnectionState must be used within a ConnectionStateProvider");
  }
  return context;
}
