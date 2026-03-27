"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { OptimizedPageTransition } from "../transitions/PageTransition";
import { ConnectionGate } from "../ConnectionGate";
import { GlobalBackgroundLayer } from "./GlobalBackgroundLayer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/connect";

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <ConnectionGate>
      <div className="relative flex min-h-screen">
        <GlobalBackgroundLayer />
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden bg-transparent border-l-0 ring-0 shadow-none -ml-px">
          <OptimizedPageTransition>
            {children}
          </OptimizedPageTransition>
        </main>
      </div>
    </ConnectionGate>
  );
}
