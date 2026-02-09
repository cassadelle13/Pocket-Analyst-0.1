"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

type LazyMountProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
  once?: boolean;
  className?: string;
};

export function LazyMount({
  children,
  fallback = null,
  rootMargin = "200px",
  once = true,
  className,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible && once) return;

    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((e) => e.isIntersecting);
        if (isVisible) {
          setVisible(true);
          if (once) obs.disconnect();
        }
      },
      { rootMargin },
    );

    obs.observe(el);

    return () => obs.disconnect();
  }, [rootMargin, once, visible]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : fallback}
    </div>
  );
}
