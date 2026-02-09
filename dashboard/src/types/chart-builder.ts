/**
 * Chart Builder Types
 * 
 * Simple drag-and-drop chart configuration
 */

import type { ClassifiedColumn } from '../lib/schema-intelligence';

export type ChartType = 'line' | 'bar' | 'table';

export interface ChartConfig {
  xAxis: ClassifiedColumn | null;
  yAxis: ClassifiedColumn[];
  chartType: ChartType;
  filters: ChartFilter[];
}

export interface ChartFilter {
  column: string;
  operator: 'eq' | 'gt' | 'lt' | 'contains';
  value: string;
}

export interface DraggedField {
  column: ClassifiedColumn;
  sourceType: 'dimension' | 'measure' | 'timeField';
}
