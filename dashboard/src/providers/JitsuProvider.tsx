"use client";

import { useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { jitsu } from "../lib/jitsu";

interface JitsuProviderProps {
  children: ReactNode;
}

export function JitsuProvider({ children }: JitsuProviderProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Initialize Jitsu with environment variables
    const host = process.env.NEXT_PUBLIC_JITSU_HOST || "http://localhost:8000";
    const writeKey = process.env.NEXT_PUBLIC_JITSU_WRITE_KEY || "demo_write_key";

    jitsu.init({ host, writeKey });
  }, []);

  // Track page views on route change
  useEffect(() => {
    jitsu.page(pathname);
  }, [pathname]);

  return <>{children}</>;
}
