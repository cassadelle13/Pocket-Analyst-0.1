"use client";

import { useMemo } from "react";

interface MiniMapNode {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface MiniMapProps {
  nodes: MiniMapNode[];
  activeNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  canvasSize: { width: number; height: number };
  onNavigate: (pan: { x: number; y: number }) => void;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 140;
const PADDING = 20;

export function MiniMap({ nodes, activeNodeId, zoom, pan, canvasSize, onNavigate }: MiniMapProps) {
  const { scale, offsetX, offsetY, viewportRect } = useMemo(() => {
    if (nodes.length === 0) {
      return { scale: 1, offsetX: 0, offsetY: 0, viewportRect: { x: 0, y: 0, w: MINIMAP_WIDTH, h: MINIMAP_HEIGHT } };
    }

    // Bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    }

    // Also include the current viewport in the bounding box
    const vpLeft = -pan.x / zoom;
    const vpTop = -pan.y / zoom;
    const vpRight = vpLeft + canvasSize.width / zoom;
    const vpBottom = vpTop + canvasSize.height / zoom;

    minX = Math.min(minX, vpLeft);
    minY = Math.min(minY, vpTop);
    maxX = Math.max(maxX, vpRight);
    maxY = Math.max(maxY, vpBottom);

    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;

    const innerW = MINIMAP_WIDTH - PADDING * 2;
    const innerH = MINIMAP_HEIGHT - PADDING * 2;
    const s = Math.min(innerW / contentWidth, innerH / contentHeight);

    const oX = PADDING + (innerW - contentWidth * s) / 2 - minX * s;
    const oY = PADDING + (innerH - contentHeight * s) / 2 - minY * s;

    // Viewport rectangle
    const vx = oX + vpLeft * s;
    const vy = oY + vpTop * s;
    const vw = (canvasSize.width / zoom) * s;
    const vh = (canvasSize.height / zoom) * s;

    return {
      scale: s,
      offsetX: oX,
      offsetY: oY,
      viewportRect: { x: vx, y: vy, w: vw, h: vh },
    };
  }, [nodes, zoom, pan, canvasSize]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert minimap click to world coordinates
    const worldX = (clickX - offsetX) / scale;
    const worldY = (clickY - offsetY) / scale;

    // Center viewport on clicked point
    const newPanX = canvasSize.width / 2 - worldX * zoom;
    const newPanY = canvasSize.height / 2 - worldY * zoom;

    onNavigate({ x: newPanX, y: newPanY });
  };

  return (
    <div
      className="bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden cursor-crosshair"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onClick={handleClick}
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} className="block">
        {/* Node rectangles */}
        {nodes.map((node) => {
          const x = offsetX + node.position.x * scale;
          const y = offsetY + node.position.y * scale;
          const w = node.size.width * scale;
          const h = node.size.height * scale;
          const isActive = node.id === activeNodeId;

          return (
            <rect
              key={node.id}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              fill={isActive ? "rgba(34, 197, 94, 0.4)" : "rgba(148, 163, 184, 0.3)"}
              stroke={isActive ? "rgba(34, 197, 94, 0.8)" : "rgba(148, 163, 184, 0.5)"}
              strokeWidth={1}
            />
          );
        })}

              </svg>
    </div>
  );
}
