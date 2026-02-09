"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { OptimizedPageTransition } from "../transitions/PageTransition";
import { ConnectionGate } from "../ConnectionGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/connect";

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <ConnectionGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden">
          <OptimizedPageTransition>
            {children}
          </OptimizedPageTransition>
        </main>
      </div>
    </ConnectionGate>
  );
}
