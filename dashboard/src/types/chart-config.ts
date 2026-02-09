/**
 * Chart Configuration Types
 * Comprehensive configuration for all chart types with granular control
 */

export type ChartType = 'uplot' | 'echarts' | 'funnel' | 'retention' | 'sankey';

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientConfig {
  type: 'linear' | 'radial';
  x: number;
  y: number;
  x2: number;
  y2: number;
  colorStops: GradientStop[];
}

export interface TickConfig {
  value: number | string;
  label?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number | string;
  rotation?: number;
}

export interface AxisConfig {
  show?: boolean;
  label?: string;
  min?: number | 'auto';
  max?: number | 'auto';
  type?: 'value' | 'category' | 'time' | 'log';
  position?: 'left' | 'right' | 'top' | 'bottom';
  
  // Grid lines
  gridLines?: {
    show: boolean;
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
  
  // Axis line
  axisLine?: {
    show: boolean;
    color: string;
    width: number;
  };
  
  // Ticks
  ticks?: {
    show: boolean;
    interval?: number | 'auto';
    length?: number;
    color?: string;
    customTicks?: TickConfig[];
  };
  
  // Labels
  labels?: {
    show: boolean;
    fontSize: number;
    fontColor: string;
    fontWeight?: number | string;
    rotation: number;
    formatter?: string; // JS function as string
    padding?: number;
  };
  
  // Split area (alternating background)
  splitArea?: {
    show: boolean;
    colors: [string, string];
  };
}

export interface SeriesConfig {
  id: string;
  name: string;
  type?: 'line' | 'bar' | 'area' | 'scatter';
  color: string | GradientConfig;
  
  // Line settings
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  smooth?: boolean;
  smoothness?: number;
  
  // Area settings
  areaOpacity?: number;
  areaGradient?: GradientConfig;
  
  // Marker/Point settings
  showMarkers?: boolean;
  markerSize?: number;
  markerShape?: 'circle' | 'square' | 'triangle' | 'diamond' | 'pin' | 'arrow';
  markerColor?: string;
  markerBorderWidth?: number;
  markerBorderColor?: string;
  
  // Bar settings
  barWidth?: number | string;
  barGap?: string;
  barCategoryGap?: string;
  
  // Stack
  stack?: string;
  
  // Data labels
  dataLabels?: {
    show: boolean;
    position: 'top' | 'bottom' | 'left' | 'right' | 'inside' | 'insideLeft' | 'insideRight';
    fontSize: number;
    color: string;
    formatter?: string;
  };
  
  // Animation
  animation?: {
    enabled: boolean;
    duration: number;
    easing: 'linear' | 'quadraticIn' | 'quadraticOut' | 'cubicIn' | 'cubicOut' | 'elasticOut';
    delay?: number;
  };
}

export interface LegendConfig {
  show: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  orientation: 'horizontal' | 'vertical';
  
  // Styling
  fontSize: number;
  fontColor: string;
  fontWeight?: number | string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  
  // Layout
  itemGap?: number;
  itemWidth?: number;
  itemHeight?: number;
  
  // Interaction
  selectedMode?: boolean | 'single' | 'multiple';
}

export interface TooltipConfig {
  show: boolean;
  trigger: 'axis' | 'item' | 'none';
  axisPointer?: {
    type: 'line' | 'shadow' | 'cross' | 'none';
    lineStyle?: {
      color: string;
      width: number;
      type: 'solid' | 'dashed' | 'dotted';
    };
    shadowStyle?: {
      color: string;
      opacity: number;
    };
  };
  
  // Styling
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius?: number;
  padding?: number;
  
  // Text
  textStyle?: {
    color: string;
    fontSize: number;
    fontWeight?: number | string;
  };
  
  // Formatter
  formatter?: string; // JS function as string
  
  // Position
  position?: 'auto' | 'top' | 'bottom' | 'left' | 'right' | [number, number];
}

export interface AdvancedConfig {
  // Animation
  animation?: {
    enabled: boolean;
    duration: number;
    easing: string;
    threshold?: number;
  };
  
  // DataZoom (ECharts)
  dataZoom?: {
    enabled: boolean;
    type: 'inside' | 'slider' | 'both';
    start?: number;
    end?: number;
    zoomOnMouseWheel?: boolean;
    moveOnMouseMove?: boolean;
    height?: number;
    backgroundColor?: string;
    fillerColor?: string;
    handleStyle?: {
      color: string;
      borderColor: string;
    };
  };
  
  // Toolbox (ECharts)
  toolbox?: {
    enabled: boolean;
    features: {
      saveAsImage?: boolean;
      dataZoom?: boolean;
      restore?: boolean;
      dataView?: boolean;
      magicType?: boolean;
    };
    iconStyle?: {
      borderColor: string;
    };
  };
  
  // Performance
  progressive?: number;
  progressiveThreshold?: number;
  
  // Responsive
  responsive?: boolean;
  maintainAspectRatio?: boolean;
}

export interface GeneralConfig {
  title?: string;
  subtitle?: string;
  width?: number | string;
  height?: number;
  backgroundColor?: string;
  
  // Padding
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  
  // Grid (chart area)
  grid?: {
    left: number | string;
    right: number | string;
    top: number | string;
    bottom: number | string;
    containLabel?: boolean;
  };
}

export interface ChartConfig {
  id: string;
  chartType: ChartType;
  general: GeneralConfig;
  axes?: {
    xAxis?: AxisConfig;
    yAxis?: AxisConfig;
    yAxis2?: AxisConfig; // Secondary Y axis
  };
  series: SeriesConfig[];
  legend?: LegendConfig;
  tooltip?: TooltipConfig;
  advanced?: AdvancedConfig;
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  version?: string;
}

export interface ChartPreset {
  id: string;
  name: string;
  description?: string;
  config: ChartConfig;
  thumbnail?: string;
  tags?: string[];
  createdAt: string;
}

// Default configurations for each chart type
export const DEFAULT_CONFIGS: Record<ChartType, Partial<ChartConfig>> = {
  uplot: {
    chartType: 'uplot',
    general: {
      height: 360,
      backgroundColor: 'transparent',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
    axes: {
      xAxis: {
        show: true,
        type: 'time',
        gridLines: { show: true, color: 'rgba(16,185,129,0.08)', width: 1, style: 'solid' },
        labels: { show: true, fontSize: 11, fontColor: 'rgba(148,163,184,0.55)', rotation: 0 },
      },
      yAxis: {
        show: true,
        type: 'value',
        gridLines: { show: true, color: 'rgba(16,185,129,0.08)', width: 1, style: 'solid' },
        labels: { show: true, fontSize: 11, fontColor: 'rgba(148,163,184,0.55)', rotation: 0 },
      },
    },
    series: [],
    legend: {
      show: true,
      position: 'top',
      orientation: 'horizontal',
      fontSize: 12,
      fontColor: '#e2e8f0',
    },
    tooltip: {
      show: true,
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
  },
  echarts: {
    chartType: 'echarts',
    general: {
      height: 360,
      backgroundColor: 'rgba(2,6,23,0.35)',
      grid: { left: '3%', right: '4%', top: 60, bottom: '3%', containLabel: true },
    },
    axes: {
      xAxis: {
        show: true,
        type: 'category',
        gridLines: { show: true, color: 'rgba(16,185,129,0.08)', width: 1, style: 'solid' },
        axisLine: { show: true, color: '#334155', width: 1 },
        labels: { show: true, fontSize: 11, fontColor: 'rgba(148,163,184,0.9)', rotation: 0 },
      },
      yAxis: {
        show: true,
        type: 'value',
        gridLines: { show: true, color: 'rgba(16,185,129,0.08)', width: 1, style: 'solid' },
        axisLine: { show: true, color: '#334155', width: 1 },
        labels: { show: true, fontSize: 11, fontColor: 'rgba(148,163,184,0.9)', rotation: 0 },
      },
    },
    series: [],
    legend: {
      show: true,
      position: 'top',
      orientation: 'horizontal',
      fontSize: 12,
      fontColor: '#e2e8f0',
    },
    tooltip: {
      show: true,
      trigger: 'axis',
      backgroundColor: 'rgba(2,6,23,0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    advanced: {
      dataZoom: {
        enabled: true,
        type: 'both',
        start: 0,
        end: 100,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        height: 18,
        backgroundColor: 'rgba(2,6,23,0.35)',
        fillerColor: 'rgba(16,185,129,0.12)',
      },
      toolbox: {
        enabled: true,
        features: {
          dataZoom: true,
          restore: true,
        },
        iconStyle: { borderColor: 'rgba(203,213,225,0.65)' },
      },
    },
  },
  funnel: {
    chartType: 'funnel',
    general: {
      height: 420,
      backgroundColor: 'transparent',
    },
    series: [],
    legend: {
      show: false,
      position: 'bottom',
      orientation: 'horizontal',
      fontSize: 12,
      fontColor: '#e2e8f0',
    },
    tooltip: {
      show: true,
      trigger: 'item',
      backgroundColor: 'rgba(2,6,23,0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
  },
  retention: {
    chartType: 'retention',
    general: {
      height: 600,
      backgroundColor: 'transparent',
    },
    series: [],
    tooltip: {
      show: true,
      trigger: 'item',
      backgroundColor: 'rgba(2,6,23,0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
  },
  sankey: {
    chartType: 'sankey',
    general: {
      height: 500,
      backgroundColor: 'transparent',
    },
    series: [],
    tooltip: {
      show: true,
      trigger: 'item',
      backgroundColor: 'rgba(2,6,23,0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
  },
};
