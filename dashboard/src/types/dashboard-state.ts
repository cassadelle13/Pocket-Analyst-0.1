/**
 * Dashboard State Types
 * 
 * Unified state for chart builder with command-based mutations
 */

import type { ClassifiedColumn } from '../lib/schema-intelligence';

export type ChartType = 'line' | 'bar' | 'table';

export interface DashboardState {
  chartType: ChartType;
  xField: ClassifiedColumn | null;
  yFields: ClassifiedColumn[];
  filters: DashboardFilter[];
  limit: number;
}

export interface DashboardFilter {
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'contains';
  value: string;
}

/**
 * Command Types - structured output from LLM parser
 */

export type DashboardCommand =
  | ChangeChartTypeCommand
  | ChangeXAxisCommand
  | AddYAxisCommand
  | RemoveYAxisCommand
  | AddFilterCommand
  | RemoveFilterCommand
  | SetLimitCommand
  | ClearStateCommand;

export interface ChangeChartTypeCommand {
  action: 'change_chart_type';
  value: ChartType;
}

export interface ChangeXAxisCommand {
  action: 'change_x_axis';
  fieldName: string;
}

export interface AddYAxisCommand {
  action: 'add_y_axis';
  fieldName: string;
}

export interface RemoveYAxisCommand {
  action: 'remove_y_axis';
  fieldName: string;
}

export interface AddFilterCommand {
  action: 'add_filter';
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'contains';
  value: string;
}

export interface RemoveFilterCommand {
  action: 'remove_filter';
  field: string;
}

export interface SetLimitCommand {
  action: 'set_limit';
  value: number;
}

export interface ClearStateCommand {
  action: 'clear_state';
}

/**
 * LLM Parser Response
 */
export interface ParsedCommandResponse {
  success: boolean;
  command?: DashboardCommand;
  error?: string;
  interpretation?: string;
}
