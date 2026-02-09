"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConnectionState } from "../providers";

export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeConnection, isLoading } = useConnectionState();

  useEffect(() => {
    // Skip gate for /connect page itself
    if (pathname === "/connect") {
      return;
    }

    // Wait for connection state to load
    if (isLoading) {
      return;
    }

    // If no active connection, redirect to /connect
    if (!activeConnection) {
      router.push("/connect");
    }
  }, [activeConnection, isLoading, pathname, router]);

  // Show loading state while checking connection
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // If on /connect page, always show it
  if (pathname === "/connect") {
    return <>{children}</>;
  }

  // If no connection, show nothing (will redirect)
  if (!activeConnection) {
    return null;
  }

  // Connection exists, show app
  return <>{children}</>;
}
