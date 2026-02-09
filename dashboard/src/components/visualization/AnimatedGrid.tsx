"use client";

import { useEffect, useRef } from "react";

type Props = {
  gridSize?: number;
  speed?: number;
  opacity?: number;
};

export function AnimatedGrid({ gridSize = 40, speed = 0.01, opacity = 0.05 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let offset = 0;

    const tick = () => {
      offset += speed;
      const v = (offset * gridSize) % gridSize;
      el.style.backgroundPosition = `${v}px ${v}px`;
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [gridSize, speed]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        opacity,
        backgroundImage: `
          linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        maskImage: "radial-gradient(circle at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0.15) 60%, rgba(0,0,0,0) 80%)",
      }}
    />
  );
}
