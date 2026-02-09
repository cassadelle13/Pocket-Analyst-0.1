// Chart interaction event types and payloads

export type ChartSource = 'echarts' | 'uplot';
export type ChartAction = 'click' | 'hover' | 'brush' | 'zoom' | 'legend';

export type ChartId = string;
export type ChartGroupId = string;

export interface ChartInteractionPayload {
  source: ChartSource;
  action: ChartAction;
  chartId?: ChartId;
  groupId?: ChartGroupId;
  // Common fields
  x?: number | string | [number, number];
  y?: number | string;
  series?: string;
  category?: string;
  // Filters to apply / suggest
  filters?: Record<string, any>;
  // Raw vendor-specific params
  meta?: Record<string, any>;
}

export type ChartEventListener = (evt: ChartInteractionPayload) => void;
