// Types for Headless Visualization System

export interface VisualizationTask {
  taskId: string;
  type: 'AGGREGATE_ACTIVITY' | 'SAMPLE_DATA' | 'PREPARE_HEATMAP' | 'PREPARE_ARCS';
  payload: any;
}

export interface VisualizationResult {
  taskId: string;
  type: 'AGGREGATED_ACTIVITY' | 'SAMPLED_DATA' | 'HEATMAP_DATA' | 'ARC_DATA' | 'ERROR';
  data?: any;
  error?: string;
}

export type { ActivityData as ActivityDataPoint } from "./api";

export interface HeatmapPoint {
  coordinates: [number, number]; // [lng, lat]
  weight: number;
  timestamp: number;
}

export interface ArcData {
  source: [number, number]; // [lng, lat]
  target: [number, number]; // [lng, lat]
  value: number;
}

export interface ChartTheme {
  backgroundColor: string;
  gridColor: string;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
}

export interface EChartsConfig {
  theme: ChartTheme;
  useWebGL: boolean;
  progressive: number;
  animation: boolean;
  animationDuration: number;
}

export interface DeckGLLayer {
  type: 'heatmap' | 'arc' | 'scatter';
  data: any[];
  config: Record<string, any>;
}

export interface OffscreenCanvasConfig {
  width: number;
  height: number;
  devicePixelRatio: number;
}
