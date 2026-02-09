/**
 * Command Executor
 * 
 * Executes structured commands to mutate DashboardState
 */

import type { 
  DashboardState, 
  DashboardCommand,
  DashboardFilter 
} from '../../types/dashboard-state';
import type { ClassifiedColumn, SemanticModel } from '../schema-intelligence';

export class CommandExecutor {
  /**
   * Execute a command and return new state
   */
  static execute(
    command: DashboardCommand,
    currentState: DashboardState,
    semanticModel: SemanticModel
  ): DashboardState {
    switch (command.action) {
      case 'change_chart_type':
        return this.changeChartType(currentState, command.value);

      case 'change_x_axis':
        return this.changeXAxis(currentState, command.fieldName, semanticModel);

      case 'add_y_axis':
        return this.addYAxis(currentState, command.fieldName, semanticModel);

      case 'remove_y_axis':
        return this.removeYAxis(currentState, command.fieldName);

      case 'add_filter':
        return this.addFilter(currentState, command.field, command.operator, command.value);

      case 'remove_filter':
        return this.removeFilter(currentState, command.field);

      case 'set_limit':
        return this.setLimit(currentState, command.value);

      case 'clear_state':
        return this.clearState();

      default:
        return currentState;
    }
  }

  private static changeChartType(
    state: DashboardState,
    chartType: DashboardState['chartType']
  ): DashboardState {
    return { ...state, chartType };
  }

  private static changeXAxis(
    state: DashboardState,
    fieldName: string,
    semanticModel: SemanticModel
  ): DashboardState {
    const field = this.findField(fieldName, semanticModel);
    if (!field) {
      return state;
    }

    return { ...state, xField: field };
  }

  private static addYAxis(
    state: DashboardState,
    fieldName: string,
    semanticModel: SemanticModel
  ): DashboardState {
    const field = this.findField(fieldName, semanticModel);
    if (!field) {
      return state;
    }

    if (state.yFields.some(f => f.name === field.name && f.table === field.table)) {
      return state;
    }

    if (state.yFields.length >= 3) {
      return state;
    }

    return {
      ...state,
      yFields: [...state.yFields, field],
    };
  }

  private static removeYAxis(
    state: DashboardState,
    fieldName: string
  ): DashboardState {
    return {
      ...state,
      yFields: state.yFields.filter(f => f.name !== fieldName),
    };
  }

  private static addFilter(
    state: DashboardState,
    field: string,
    operator: DashboardFilter['operator'],
    value: string
  ): DashboardState {
    const existingIndex = state.filters.findIndex(f => f.field === field);
    
    if (existingIndex >= 0) {
      const newFilters = [...state.filters];
      newFilters[existingIndex] = { field, operator, value };
      return { ...state, filters: newFilters };
    }

    return {
      ...state,
      filters: [...state.filters, { field, operator, value }],
    };
  }

  private static removeFilter(
    state: DashboardState,
    field: string
  ): DashboardState {
    return {
      ...state,
      filters: state.filters.filter(f => f.field !== field),
    };
  }

  private static setLimit(
    state: DashboardState,
    value: number
  ): DashboardState {
    return { ...state, limit: Math.max(1, Math.min(1000, value)) };
  }

  private static clearState(): DashboardState {
    return {
      chartType: 'bar',
      xField: null,
      yFields: [],
      filters: [],
      limit: 100,
    };
  }

  private static findField(
    fieldName: string,
    semanticModel: SemanticModel
  ): ClassifiedColumn | null {
    const allFields = [
      ...semanticModel.dimensions,
      ...semanticModel.measures,
      ...semanticModel.timeFields,
    ];

    const normalized = fieldName.toLowerCase().trim();

    return allFields.find(f => 
      f.name.toLowerCase() === normalized ||
      f.name.toLowerCase().includes(normalized) ||
      normalized.includes(f.name.toLowerCase())
    ) || null;
  }
}
