"use client";

import { forwardRef, useMemo } from "react";
import { ChartStyleConfig, ContainerSize } from "../../lib/chart-style-system/ChartStyleConfig";
import BaseChart from "./BaseChart";

// === ТИПЫ ДАННЫХ ===

export interface ChartDataPoint {
  [key: string]: any;
}

export interface ChartSeries {
  key: string;
  name: string;
  type?: 'line' | 'bar' | 'area';
  color?: string;
  yAxisIndex?: number;
}

export interface ChartTemplateProps {
  // === ДАННЫЕ ===
  data: ChartDataPoint[];
  series: ChartSeries[];
  xKey: string;
  
  // === РАЗМЕРЫ ===
  size?: ContainerSize;
  width?: number;
  height?: number;
  
  // === ОПЦИИ ===
  title?: string;
  showLegend?: boolean;
  showTooltip?: boolean;
  showGrid?: boolean;
  animation?: boolean;
  
  // === INTERACTION ===
  onDataPointClick?: (point: ChartDataPoint, series: ChartSeries) => void;
  onLegendClick?: (series: ChartSeries) => void;
  
  // === КОНФИГУРАЦИЯ ===
  customOptions?: Record<string, any>;
  className?: string;
}

// === ОСНОВНОЙ КОМПОНЕНТ ===

export const ChartTemplate = forwardRef<any, ChartTemplateProps>(({
  data,
  series,
  xKey,
  size = 'default',
  width,
  height,
  title,
  showLegend = true,
  showTooltip = true,
  showGrid = true,
  animation = true,
  onDataPointClick,
  onLegendClick,
  customOptions = {},
  className = '',
}, ref) => {
  
  // === ВЫЧИСЛЕНИЕ РАЗМЕРОВ ===
  const containerSize = useMemo(() => {
    if (width && height) {
      return { width, height };
    }
    return ChartStyleConfig.container[size];
  }, [size, width, height]);

  // === ГЕНЕРАЦИЯ ECHARTS OPTIONS ===
  const chartOption = useMemo(() => {
    const xAxisData = data.map(d => d[xKey]);
    
    // Базовая опция
    const option: any = {
      backgroundColor: ChartStyleConfig.colors.background,
      grid: showGrid ? {
        ...ChartStyleConfig.grid,
        left: ChartStyleConfig.grid.left,
        right: ChartStyleConfig.grid.right,
        top: title ? '15%' : ChartStyleConfig.grid.top,
        bottom: ChartStyleConfig.grid.bottom,
      } : { show: false },
      
      // Ось X
      xAxis: {
        ...ChartStyleConfig.axes.x,
        data: xAxisData,
      },
      
      // Оси Y (поддержка множественных осей)
      yAxis: series.map((s, index) => ({
        ...ChartStyleConfig.axes.y,
        position: index === 0 ? 'left' : 'right',
        alignTicks: true,
        axisLine: {
          show: true,
          lineStyle: {
            color: s.color || ChartStyleConfig.colors.primary,
          },
        },
        axisLabel: {
          ...ChartStyleConfig.axes.y.axisLabel,
          color: s.color || ChartStyleConfig.colors.textSecondary,
        },
        splitLine: {
          show: index === 0 && showGrid,
          lineStyle: {
            color: ChartStyleConfig.colors.grid,
          },
        },
      })),

      // Tooltip
      tooltip: showTooltip ? {
        ...ChartStyleConfig.tooltip,
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: ChartStyleConfig.colors.primary,
          },
        },
      } : { show: false },

      // Legend
      legend: showLegend ? {
        ...ChartStyleConfig.legend,
        data: series.map(s => s.name),
        top: title ? 30 : 0,
      } : { show: false },

      // Animation
      animation: animation,
      animationDuration: ChartStyleConfig.animation.duration,
      animationEasing: ChartStyleConfig.animation.easing as any,

      // Series
      series: series.map((s, index) => {
        const seriesData = data.map(d => d[s.key]);
        const color = s.color || ChartStyleConfig.colors.primary;
        
        const baseSeries = {
          name: s.name,
          type: s.type || 'line',
          data: seriesData,
          yAxisIndex: s.yAxisIndex || index,
          color: color,
          symbolSize: 6,
          emphasis: {
            focus: 'series',
            scale: true,
            scaleSize: 1.1,
          },
        };

        // Стили в зависимости от типа
        if (s.type === 'line' || s.type === 'area' || !s.type) {
          return {
            ...baseSeries,
            smooth: ChartStyleConfig.series.line.smooth,
            symbol: ChartStyleConfig.series.line.symbol,
            lineStyle: {
              width: ChartStyleConfig.series.line.lineStyle.width,
              color: color,
              shadowColor: ChartStyleConfig.colors.glowPrimary,
              shadowBlur: ChartStyleConfig.series.line.lineStyle.shadowBlur,
              shadowOffsetY: ChartStyleConfig.series.line.lineStyle.shadowOffsetY,
            },
            areaStyle: s.type === 'area' ? {
              opacity: ChartStyleConfig.series.line.areaStyle.opacity,
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: ChartStyleConfig.series.line.areaStyle.color.colorStops.map((stop: any, i: number) => ({
                  ...stop,
                  color: i === 0 ? color.replace('rgb', 'rgba').replace(')', ', 0.3)') : color.replace('rgb', 'rgba').replace(')', ', 0.05)'),
                })),
              },
            } : undefined,
          };
        }

        if (s.type === 'bar') {
          return {
            ...baseSeries,
            barWidth: ChartStyleConfig.series.bar.barWidth,
            itemStyle: {
              borderRadius: ChartStyleConfig.series.bar.itemStyle.borderRadius,
              color: color,
              shadowColor: ChartStyleConfig.colors.glowPrimary,
              shadowBlur: ChartStyleConfig.series.bar.itemStyle.shadowBlur,
              shadowOffsetY: ChartStyleConfig.series.bar.itemStyle.shadowOffsetY,
            },
            emphasis: {
              itemStyle: {
                shadowBlur: ChartStyleConfig.series.bar.itemStyle.shadowBlur * 1.5,
              },
            },
          };
        }

        return baseSeries;
      }),
    };

    // Заголовок
    if (title) {
      option.title = {
        text: title,
        left: 'left',
        top: 0,
        textStyle: {
          color: ChartStyleConfig.typography.title.color,
          fontSize: parseInt(ChartStyleConfig.typography.title.fontSize),
          fontWeight: ChartStyleConfig.typography.title.fontWeight,
        },
      };
    }

    // Обработчики кликов
    if (onDataPointClick) {
      option.events = {
        click: (params: any) => {
          const dataPoint = data[params.dataIndex];
          const seriesItem = series[params.seriesIndex];
          if (dataPoint && seriesItem) {
            onDataPointClick(dataPoint, seriesItem);
          }
        },
      };
    }

    return { ...option, ...customOptions };
  }, [data, series, xKey, title, showLegend, showTooltip, showGrid, animation, onDataPointClick, customOptions]);

  // === GLASSMORPHISM КОНТЕЙНЕР ===
  const containerStyle = useMemo(() => ({
    background: ChartStyleConfig.glassmorphism.background,
    backdropFilter: ChartStyleConfig.glassmorphism.backdropFilter,
    border: ChartStyleConfig.glassmorphism.border,
    borderRadius: ChartStyleConfig.borderRadius.container,
    boxShadow: ChartStyleConfig.glassmorphism.boxShadow,
    padding: ChartStyleConfig.spacing.container.padding,
    width: containerSize.width,
    height: containerSize.height,
  }), [containerSize]);

  return (
    <div 
      className={`chart-template ${className}`}
      style={containerStyle}
      data-chart-size={size}
      data-chart-type={series[0]?.type || 'line'}
    >
      <BaseChart
        option={chartOption}
        height={containerSize.height}
        className="w-full h-full"
      />
    </div>
  );
});

ChartTemplate.displayName = 'ChartTemplate';

// === ХЕЛПЕРЫ ДЛЯ СОЗДАНИЯ ГРАФИКОВ ===

export const createLineChart = (
  data: ChartDataPoint[],
  xKey: string,
  yKeys: string[],
  options?: Partial<ChartTemplateProps>
) => {
  const series = yKeys.map(key => ({
    key,
    name: key,
    type: 'line' as const,
  }));
  
  return (
    <ChartTemplate
      data={data}
      series={series}
      xKey={xKey}
      {...options}
    />
  );
};

export const createAreaChart = (
  data: ChartDataPoint[],
  xKey: string,
  yKeys: string[],
  options?: Partial<ChartTemplateProps>
) => {
  const series = yKeys.map(key => ({
    key,
    name: key,
    type: 'area' as const,
  }));
  
  return (
    <ChartTemplate
      data={data}
      series={series}
      xKey={xKey}
      {...options}
    />
  );
};

export const createBarChart = (
  data: ChartDataPoint[],
  xKey: string,
  yKeys: string[],
  options?: Partial<ChartTemplateProps>
) => {
  const series = yKeys.map(key => ({
    key,
    name: key,
    type: 'bar' as const,
  }));
  
  return (
    <ChartTemplate
      data={data}
      series={series}
      xKey={xKey}
      {...options}
    />
  );
};

export const createMixedChart = (
  data: ChartDataPoint[],
  xKey: string,
  seriesConfig: Array<{ key: string; name: string; type: 'line' | 'bar' | 'area' }>,
  options?: Partial<ChartTemplateProps>
) => {
  const series = seriesConfig.map(config => ({
    ...config,
  }));
  
  return (
    <ChartTemplate
      data={data}
      series={series}
      xKey={xKey}
      {...options}
    />
  );
};
