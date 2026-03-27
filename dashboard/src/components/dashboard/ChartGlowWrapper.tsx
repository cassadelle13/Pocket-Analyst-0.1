"use client";

import { memo } from "react";
import type { CreativeContainerStyles } from "../../lib/applyChartConfig";

interface ChartGlowWrapperProps {
  styles: CreativeContainerStyles | null;
  children: React.ReactNode;
}

/**
 * Lightweight wrapper that adds CSS glow/gradient overlays around any chart.
 * When `styles` is null (no creative config active), renders children directly
 * with zero overhead — no extra DOM nodes.
 */
const ChartGlowWrapper = memo(function ChartGlowWrapper({
  styles,
  children,
}: ChartGlowWrapperProps) {
  if (!styles) return <>{children}</>;

  return (
    <div
      className="relative overflow-hidden w-full h-full rounded-xl"
      style={styles.wrapperStyle as React.CSSProperties | undefined}
    >
      {styles.overlayGradient && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-80"
          style={{
            background: styles.overlayGradient,
            filter: "blur(0.2px)",
          }}
        />
      )}
      {styles.overlayBoxShadow && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ boxShadow: styles.overlayBoxShadow }}
        />
      )}
      <div className="relative w-full h-full">{children}</div>
    </div>
  );
});

export default ChartGlowWrapper;
