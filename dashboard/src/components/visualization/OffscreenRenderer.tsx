"use client";

import { useEffect, useRef, useState } from "react";
import type { OffscreenCanvasConfig, ActivityDataPoint } from "../../types/visualization";

interface OffscreenRendererProps {
  data: ActivityDataPoint[];
  width: number;
  height: number;
  onDataPointClick?: (point: ActivityDataPoint) => void;
}

export function OffscreenRenderer({
  data,
  width,
  height,
  onDataPointClick,
}: OffscreenRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Worker-based OffscreenCanvas rendering is intentionally disabled here.
    // In the current Next.js build setup, bundling TS workers via new URL(..., import.meta.url)
    // causes a build-time "Module not found" and breaks the whole frontend.
    // We keep the canvas-based fallback below to preserve performance and stability.
  }, [data, width, height, onDataPointClick]);

  // Fallback rendering on main thread if OffscreenCanvas not available
  useEffect(() => {
    if (!canvasRef.current || isReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Simple fallback visualization
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(34, 197, 94, 0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      const y = (height / 10) * i;
      
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw data points
    if (data.length > 0) {
      const maxValue = Math.max(...data.map(d => Math.max(d.events, d.users)));
      const xStep = width / data.length;

      data.forEach((point, index) => {
        const x = index * xStep;
        const eventHeight = (point.events / maxValue) * height * 0.8;
        const userHeight = (point.users / maxValue) * height * 0.8;

        // Events line
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(x, height - eventHeight);
        ctx.lineTo(x + xStep, height - (data[index + 1]?.events || point.events) / maxValue * height * 0.8);
        ctx.stroke();

        // Users line
        ctx.strokeStyle = "#3b82f6";
        ctx.shadowColor = "rgba(59, 130, 246, 0.6)";
        ctx.beginPath();
        ctx.moveTo(x, height - userHeight);
        ctx.lineTo(x + xStep, height - (data[index + 1]?.users || point.users) / maxValue * height * 0.8);
        ctx.stroke();
      });
    }

    setIsReady(true);
  }, [data, width, height, isReady]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        opacity: isReady ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
      }}
    />
  );
}
