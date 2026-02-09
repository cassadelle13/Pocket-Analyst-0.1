// OffscreenCanvas Worker - renders charts in background thread
// Keeps main thread free for UI interactions

import type { OffscreenCanvasConfig, ActivityDataPoint } from "../types/visualization";

interface WorkerMessage {
  type: "INIT" | "CLICK" | "UPDATE";
  canvas?: OffscreenCanvas;
  config?: OffscreenCanvasConfig;
  data?: ActivityDataPoint[];
  coords?: { x: number; y: number };
}

let offscreen: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D;
let config: OffscreenCanvasConfig | null = null;
let chartData: ActivityDataPoint[] = [];

// Dark theme colors
const COLORS = {
  background: "rgba(0,0,0,0)",
  grid: "rgba(34,197,94,0.1)",
  primary: "#10b981",
  secondary: "#3b82f6",
  text: "rgba(229,231,235,0.9)",
  glow: "rgba(16,185,129,0.6)",
};

// Initialize OffscreenCanvas
function initCanvas(canvas: OffscreenCanvas, canvasConfig: OffscreenCanvasConfig) {
  offscreen = canvas;
  config = canvasConfig;
  const context = offscreen.getContext("2d");
  if (!context) {
    throw new Error("Failed to get 2D context from OffscreenCanvas");
  }
  ctx = context;

  // Set canvas size
  offscreen.width = config.width * config.devicePixelRatio;
  offscreen.height = config.height * config.devicePixelRatio;
  ctx.scale(config.devicePixelRatio, config.devicePixelRatio);

  self.postMessage({ type: "READY" });
}

// Render animated grid background
function renderGrid(time: number) {
  if (!config) return;

  const { width, height } = config;
  const gridSize = 40;
  const offset = (time * 0.01) % gridSize;

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  // Vertical lines with animation
  for (let x = -gridSize + offset; x < width + gridSize; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines with animation
  for (let y = -gridSize + offset; y < height + gridSize; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

// Render chart data with glow effects
function renderChart() {
  if (!config || chartData.length === 0) return;

  const { width, height } = config;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate max values for scaling
  const maxEvents = Math.max(...chartData.map(d => d.events));
  const maxUsers = Math.max(...chartData.map(d => d.users));
  const maxValue = Math.max(maxEvents, maxUsers);

  const xStep = chartWidth / chartData.length;

  // Render events line with glow
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLORS.glow;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  chartData.forEach((point, index) => {
    const x = padding + index * xStep;
    const y = padding + chartHeight - (point.events / maxValue) * chartHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Render users line with glow
  ctx.strokeStyle = COLORS.secondary;
  ctx.shadowColor = "rgba(59,130,246,0.6)";
  ctx.shadowBlur = 8;

  ctx.beginPath();
  chartData.forEach((point, index) => {
    const x = padding + index * xStep;
    const y = padding + chartHeight - (point.users / maxValue) * chartHeight;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Render data points
  chartData.forEach((point, index) => {
    const x = padding + index * xStep;
    const eventY = padding + chartHeight - (point.events / maxValue) * chartHeight;
    const userY = padding + chartHeight - (point.users / maxValue) * chartHeight;

    // Events point
    ctx.fillStyle = COLORS.primary;
    ctx.beginPath();
    ctx.arc(x, eventY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Users point
    ctx.fillStyle = COLORS.secondary;
    ctx.beginPath();
    ctx.arc(x, userY, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Handle click events and detect data points
function handleClick(coords: { x: number; y: number }) {
  if (!config || chartData.length === 0) return;

  const { width, height } = config;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxEvents = Math.max(...chartData.map(d => d.events));
  const maxUsers = Math.max(...chartData.map(d => d.users));
  const maxValue = Math.max(maxEvents, maxUsers);

  const xStep = chartWidth / chartData.length;
  const clickedIndex = Math.floor((coords.x - padding) / xStep);

  if (clickedIndex >= 0 && clickedIndex < chartData.length) {
    const point = chartData[clickedIndex];
    
    // Check if click is near the data point
    const pointX = padding + clickedIndex * xStep;
    const eventY = padding + chartHeight - (point.events / maxValue) * chartHeight;
    const userY = padding + chartHeight - (point.users / maxValue) * chartHeight;

    const distance = Math.sqrt(
      Math.pow(coords.x - pointX, 2) + Math.pow(coords.y - eventY, 2)
    );

    if (distance < 10) { // 10px tolerance
      self.postMessage({
        type: "CLICK",
        payload: { point },
      });
    }
  }
}

// Animation loop
function animate(time: number) {
  if (!config) return;

  // Clear canvas
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, config.width, config.height);

  // Render animated grid
  renderGrid(time);

  // Render chart
  renderChart();

  // Continue animation
  requestAnimationFrame(animate);
}

// Main worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, canvas, config, data, coords } = event.data;

  switch (type) {
    case "INIT":
      if (canvas && config) {
        initCanvas(canvas, config);
        if (data) chartData = data;
        requestAnimationFrame(animate);
      }
      break;

    case "UPDATE":
      if (data) {
        chartData = data;
      }
      break;

    case "CLICK":
      if (coords) {
        handleClick(coords);
      }
      break;

    default:
      console.warn("Unknown worker message type:", type);
  }
};

export {};
