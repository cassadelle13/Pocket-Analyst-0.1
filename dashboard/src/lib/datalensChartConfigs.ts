/**
 * DataLens-style chart configurations adapted for PocketAnalyst dark theme
 * Based on DataLens UI gravity-charts preparers
 */

export interface DataLensChartConfig {
  smooth?: boolean;
  connectNulls?: boolean;
  stack?: string;
  emphasis?: any;
  label?: any;
  itemStyle?: any;
}

/**
 * Get DataLens-style line chart configuration
 */
export function getDataLensLineConfig(options: {
  smooth?: boolean;
  connectNulls?: boolean;
  showDataLabels?: boolean;
}) {
  const { smooth = true, connectNulls = false, showDataLabels = false } = options;

  return {
    smooth,
    smoothMonotone: 'x',
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: {
      width: 2,
    },
    emphasis: {
      focus: 'series',
      lineStyle: {
        width: 3,
      },
      itemStyle: {
        borderWidth: 2,
        borderColor: '#fff',
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.3)',
      },
    },
    connectNulls,
    label: {
      show: showDataLabels,
      position: 'top',
      fontSize: 11,
      color: '#cbd5e1',
      formatter: (params: any) => {
        if (params.value === null || params.value === undefined) return '';
        return typeof params.value === 'number' ? params.value.toFixed(2) : params.value;
      },
    },
  };
}

/**
 * Get DataLens-style bar chart configuration
 */
export function getDataLensBarConfig(options: {
  stacking?: 'normal' | 'percent' | null;
  showDataLabels?: boolean;
  barWidth?: string | number;
}) {
  const { stacking = null, showDataLabels = false, barWidth = '60%' } = options;

  return {
    barWidth,
    barGap: '10%',
    barCategoryGap: '20%',
    emphasis: {
      focus: 'series',
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        borderWidth: 1,
        borderColor: '#fff',
      },
    },
    label: {
      show: showDataLabels,
      position: stacking ? 'inside' : 'top',
      fontSize: 11,
      color: stacking ? '#fff' : '#cbd5e1',
      formatter: (params: any) => {
        if (params.value === null || params.value === undefined) return '';
        if (stacking === 'percent') {
          return `${(params.value * 100).toFixed(1)}%`;
        }
        return typeof params.value === 'number' ? params.value.toFixed(0) : params.value;
      },
    },
    stack: stacking ? 'total' : undefined,
  };
}

/**
 * Get DataLens-style pie/donut chart configuration
 */
export function getDataLensPieConfig(options: {
  isDonut?: boolean;
  showDataLabels?: boolean;
  showPercentage?: boolean;
}) {
  const { isDonut = false, showDataLabels = true, showPercentage = true } = options;

  return {
    radius: isDonut ? ['40%', '70%'] : ['0%', '70%'],
    center: ['50%', '50%'],
    avoidLabelOverlap: true,
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
      },
      label: {
        show: true,
        fontSize: 14,
        fontWeight: 'bold',
      },
    },
    label: {
      show: showDataLabels,
      fontSize: 12,
      color: '#cbd5e1',
      formatter: (params: any) => {
        if (showPercentage) {
          return `{name|${params.name}}\n{percent|${params.percent.toFixed(1)}%}`;
        }
        return `{name|${params.name}}\n{value|${params.value}}`;
      },
      rich: {
        name: {
          fontSize: 12,
          color: '#cbd5e1',
          lineHeight: 18,
        },
        percent: {
          fontSize: 11,
          color: '#94a3b8',
          lineHeight: 16,
        },
        value: {
          fontSize: 11,
          color: '#94a3b8',
          lineHeight: 16,
        },
      },
    },
    labelLine: {
      show: showDataLabels,
      length: 15,
      length2: 10,
      lineStyle: {
        color: '#475569',
      },
    },
  };
}

/**
 * Get DataLens-style scatter chart configuration
 */
export function getDataLensScatterConfig(options: {
  symbolSize?: number | ((value: any) => number);
  symbolType?: 'circle' | 'rect' | 'triangle' | 'diamond';
}) {
  const { symbolSize = 10, symbolType = 'circle' } = options;

  return {
    symbol: symbolType,
    symbolSize,
    emphasis: {
      focus: 'series',
      itemStyle: {
        borderWidth: 2,
        borderColor: '#fff',
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
      },
    },
    itemStyle: {
      opacity: 0.8,
    },
  };
}

/**
 * Get DataLens-style heatmap configuration
 */
export function getDataLensHeatmapConfig(options: {
  min?: number;
  max?: number;
  colorRange?: string[];
}) {
  const {
    min = 0,
    max = 100,
    colorRange = ['#1e3a8a', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  } = options;

  return {
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        borderWidth: 1,
        borderColor: '#fff',
      },
    },
    label: {
      show: false,
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%',
      inRange: {
        color: colorRange,
      },
      textStyle: {
        color: '#cbd5e1',
      },
    },
  };
}

/**
 * Get DataLens-style treemap configuration
 */
export function getDataLensTreemapConfig(options: {
  showLabels?: boolean;
}) {
  const { showLabels = true } = options;

  return {
    roam: false,
    nodeClick: 'link',
    breadcrumb: {
      show: true,
      itemStyle: {
        color: '#334155',
        borderColor: '#475569',
        textStyle: {
          color: '#cbd5e1',
        },
      },
      emphasis: {
        itemStyle: {
          color: '#475569',
          textStyle: {
            color: '#fff',
          },
        },
      },
    },
    label: {
      show: showLabels,
      formatter: '{b}',
      color: '#fff',
      fontSize: 12,
      fontWeight: 'normal',
    },
    upperLabel: {
      show: true,
      height: 30,
      color: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
    },
    itemStyle: {
      borderColor: '#1e293b',
      borderWidth: 2,
      gapWidth: 2,
    },
    emphasis: {
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 2,
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
      },
      label: {
        fontSize: 14,
        fontWeight: 'bold',
      },
    },
    levels: [
      {
        itemStyle: {
          borderWidth: 0,
          gapWidth: 5,
        },
      },
      {
        itemStyle: {
          gapWidth: 1,
        },
      },
      {
        colorSaturation: [0.35, 0.5],
        itemStyle: {
          gapWidth: 1,
          borderColorSaturation: 0.6,
        },
      },
    ],
  };
}

/**
 * Get DataLens-style sankey configuration
 */
export function getDataLensSankeyConfig() {
  return {
    nodeWidth: 20,
    nodeGap: 8,
    layoutIterations: 32,
    emphasis: {
      focus: 'adjacency',
      lineStyle: {
        opacity: 0.8,
      },
    },
    lineStyle: {
      color: 'gradient',
      curveness: 0.5,
      opacity: 0.3,
    },
    label: {
      color: '#cbd5e1',
      fontSize: 12,
      fontWeight: 'normal',
    },
    itemStyle: {
      borderWidth: 1,
      borderColor: '#1e293b',
    },
  };
}

/**
 * Get DataLens-style legend configuration
 */
export function getDataLensLegendConfig(options: {
  orient?: 'horizontal' | 'vertical';
  position?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const { orient = 'horizontal', position = 'top' } = options;

  const positionConfig: any = {};
  if (position === 'top') {
    positionConfig.top = 10;
    positionConfig.left = 'center';
  } else if (position === 'bottom') {
    positionConfig.bottom = 10;
    positionConfig.left = 'center';
  } else if (position === 'left') {
    positionConfig.left = 10;
    positionConfig.top = 'middle';
  } else {
    positionConfig.right = 10;
    positionConfig.top = 'middle';
  }

  return {
    ...positionConfig,
    orient,
    textStyle: {
      color: '#cbd5e1',
      fontSize: 12,
    },
    icon: 'roundRect',
    itemWidth: 14,
    itemHeight: 14,
    itemGap: 12,
    padding: 5,
  };
}

/**
 * Get DataLens-style tooltip configuration
 */
export function getDataLensTooltipConfig(options: {
  trigger?: 'item' | 'axis' | 'none';
  axisPointer?: any;
}) {
  const { trigger = 'axis', axisPointer } = options;

  return {
    trigger,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderColor: '#334155',
    borderWidth: 1,
    textStyle: {
      color: '#e2e8f0',
      fontSize: 12,
    },
    padding: [8, 12],
    axisPointer: axisPointer || {
      type: trigger === 'axis' ? 'cross' : 'shadow',
      crossStyle: {
        color: '#64748b',
      },
      lineStyle: {
        color: '#64748b',
        type: 'dashed',
      },
      shadowStyle: {
        color: 'rgba(100, 116, 139, 0.1)',
      },
    },
  };
}

/**
 * Get DataLens-style grid configuration
 */
export function getDataLensGridConfig(options: {
  containLabel?: boolean;
}) {
  const { containLabel = true } = options;

  return {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '15%',
    containLabel,
  };
}
