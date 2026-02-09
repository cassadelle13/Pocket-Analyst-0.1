"use client";

import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
  children?: React.ReactNode;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-800",
        className
      )}
      {...props}
    />
  );
}

export function ShimmerCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/50 shadow-xl",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-slate-800" />
            <div className="h-3 w-2/3 rounded bg-slate-800" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-800" />
          <div className="h-3 w-4/5 rounded bg-slate-800" />
        </div>
      </div>
    </div>
  );
}

export function ShimmerGlobe({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-slate-900/80 border border-slate-800/50 shadow-2xl",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="aspect-[16/9] flex items-center justify-center">
        <div className="w-32 h-32 rounded-full bg-slate-800 shadow-inner" />
      </div>
    </div>
  );
}

export function ShimmerInsightCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800/50 shadow-xl",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded bg-slate-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-slate-800" />
            <div className="h-3 w-full rounded bg-slate-800" />
            <div className="h-3 w-5/6 rounded bg-slate-800" />
          </div>
        </div>
        <div className="h-16 w-full rounded bg-slate-800" />
      </div>
    </div>
  );
}

// Add shimmer animation to globals.css if not already present
export function addShimmerStyles() {
  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `;
    if (!document.head.querySelector('style[data-shimmer]')) {
      style.setAttribute("data-shimmer", "true");
      document.head.appendChild(style);
    }
  }
}
