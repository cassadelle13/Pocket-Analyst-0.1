/**
 * 25 шаблонов графиков для PocketAnalyst
 * Используют ТОЛЬКО ChartTemplate и ChartStyleConfig
 * Никаких кастомных стилей - только структура данных
 */

import React from 'react';
import { ChartTemplate, ChartTemplateProps } from "../../components/charts/ChartTemplate";

// Экспортируем тип для использования в других файлах
export type ChartDataPoint = {
  [key: string]: any;
};

// === 1. LINE CHARTS ===

export const LineChartSingle: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: yKey, name: yKey, type: 'line' }]}
      xKey={xKey}
      size="default"
      {...options}
    />
  );
};

export const LineChartMulti: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={yKeys.map(key => ({ key, name: key, type: 'line' as const }))}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

export const LineChartDualAxis: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  leftKey: string;
  rightKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, leftKey, rightKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: leftKey, name: leftKey, type: 'line' as const, yAxisIndex: 0, color: '#10b981' },
        { key: rightKey, name: rightKey, type: 'line' as const, yAxisIndex: 1, color: '#3b82f6' }
      ]}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

// === 2. AREA CHARTS ===

export const AreaChartSingle: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: yKey, name: yKey, type: 'area' as const }]}
      xKey={xKey}
      size="default"
      {...options}
    />
  );
};

export const AreaChartStacked: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={yKeys.map(key => ({ key, name: key, type: 'area' as const }))}
      xKey={xKey}
      size="default"
      showLegend={true}
      customOptions={{ series: [{ stack: 'total' }] }}
      {...options}
    />
  );
};

export const AreaChartGradient: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: yKey, name: yKey, type: 'area' as const, color: '#10b981' }]}
      xKey={xKey}
      size="default"
      {...options}
    />
  );
};

// === 3. BAR CHARTS ===

export const BarChartVertical: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: yKey, name: yKey, type: 'bar' as const }]}
      xKey={xKey}
      size="default"
      {...options}
    />
  );
};

export const BarChartHorizontal: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: yKey, name: yKey, type: 'bar' as const }]}
      xKey={xKey}
      size="default"
      customOptions={{ 
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d[xKey]) }
      }}
      {...options}
    />
  );
};

export const BarChartStacked: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={yKeys.map(key => ({ key, name: key, type: 'bar' as const }))}
      xKey={xKey}
      size="default"
      showLegend={true}
      customOptions={{ series: [{ stack: 'total' }] }}
      {...options}
    />
  );
};

export const BarChartGrouped: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, yKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={yKeys.map(key => ({ key, name: key, type: 'bar' as const }))}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

// === 4. MIXED CHARTS ===

export const MixedLineBar: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  lineKey: string;
  barKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, lineKey, barKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: lineKey, name: lineKey, type: 'line' as const, color: '#10b981' },
        { key: barKey, name: barKey, type: 'bar' as const, color: '#3b82f6' }
      ]}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

export const MixedAreaBar: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  areaKey: string;
  barKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, areaKey, barKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: areaKey, name: areaKey, type: 'area' as const, color: '#10b981' },
        { key: barKey, name: barKey, type: 'bar' as const, color: '#3b82f6' }
      ]}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

export const MixedLineArea: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  lineKey: string;
  areaKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, lineKey, areaKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: lineKey, name: lineKey, type: 'line' as const, color: '#10b981' },
        { key: areaKey, name: areaKey, type: 'area' as const, color: '#3b82f6' }
      ]}
      xKey={xKey}
      size="default"
      showLegend={true}
      {...options}
    />
  );
};

// === 5. SPECIALIZED CHARTS ===

export const TrendChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  valueKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, valueKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: valueKey, name: 'Trend', type: 'line' as const }]}
      xKey={xKey}
      size="default"
      title="Trend Analysis"
      showGrid={true}
      {...options}
    />
  );
};

export const ComparisonChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  compareKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, compareKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={compareKeys.map(key => ({ key, name: key, type: 'bar' as const }))}
      xKey={xKey}
      size="default"
      title="Comparison"
      showLegend={true}
      {...options}
    />
  );
};

export const DistributionChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  valueKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, valueKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: valueKey, name: 'Distribution', type: 'area' as const }]}
      xKey={xKey}
      size="default"
      title="Distribution"
      {...options}
    />
  );
};

export const PerformanceChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  metricKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, metricKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={metricKeys.map((key, index) => ({ 
        key, 
        name: key, 
        type: 'line' as const,
        color: ['#10b981', '#3b82f6', '#a78bfa'][index] || '#10b981'
      }))}
      xKey={xKey}
      size="default"
      title="Performance Metrics"
      showLegend={true}
      {...options}
    />
  );
};

export const GrowthChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  growthKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, growthKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: growthKey, name: 'Growth Rate', type: 'area' as const, color: '#10b981' }]}
      xKey={xKey}
      size="default"
      title="Growth Analysis"
      {...options}
    />
  );
};

export const ForecastChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  actualKey: string;
  forecastKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, actualKey, forecastKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: actualKey, name: 'Actual', type: 'line' as const, color: '#10b981' },
        { key: forecastKey, name: 'Forecast', type: 'line' as const, color: '#3b82f6' }
      ]}
      xKey={xKey}
      size="default"
      title="Forecast vs Actual"
      showLegend={true}
      {...options}
    />
  );
};

export const CorrelationChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  corrKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, corrKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={corrKeys.map((key, index) => ({ 
        key, 
        name: key, 
        type: 'line' as const,
        yAxisIndex: index % 2,
        color: ['#10b981', '#3b82f6'][index] || '#10b981'
      }))}
      xKey={xKey}
      size="default"
      title="Correlation Analysis"
      showLegend={true}
      {...options}
    />
  );
};

export const AnomalyChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  valueKey: string;
  anomalyKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, valueKey, anomalyKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[
        { key: valueKey, name: 'Value', type: 'line' as const, color: '#10b981' },
        { key: anomalyKey, name: 'Anomaly', type: 'bar' as const, color: '#ef4444' }
      ]}
      xKey={xKey}
      size="default"
      title="Anomaly Detection"
      showLegend={true}
      {...options}
    />
  );
};

export const FunnelChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  valueKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, valueKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: valueKey, name: 'Funnel', type: 'bar' as const, color: '#10b981' }]}
      xKey={xKey}
      size="default"
      title="Conversion Funnel"
      customOptions={{ 
        series: [{ barWidth: '80%' }],
        xAxis: { axisLabel: { rotate: 45 } }
      }}
      {...options}
    />
  );
};

export const RealTimeChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  metricKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, metricKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={metricKeys.map((key, index) => ({ 
        key, 
        name: key, 
        type: 'line' as const,
        color: ['#10b981', '#3b82f6', '#a78bfa'][index] || '#10b981'
      }))}
      xKey={xKey}
      size="default"
      title="Real-time Metrics"
      showLegend={true}
      animation={true}
      {...options}
    />
  );
};

export const SummaryChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  summaryKeys: string[];
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, summaryKeys, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={summaryKeys.map((key, index) => ({ 
        key, 
        name: key, 
        type: index % 2 === 0 ? 'bar' as const : 'line' as const,
        color: ['#10b981', '#3b82f6', '#a78bfa', '#f59e0b'][index] || '#10b981'
      }))}
      xKey={xKey}
      size="default"
      title="Summary Dashboard"
      showLegend={true}
      {...options}
    />
  );
};

// === 25. COMPACT METRIC CHART ===

export const CompactMetricChart: React.FC<{
  data: ChartDataPoint[];
  xKey: string;
  valueKey: string;
  options?: Partial<ChartTemplateProps>;
}> = ({ data, xKey, valueKey, options }) => {
  return (
    <ChartTemplate
      data={data}
      series={[{ key: valueKey, name: 'Metric', type: 'area' as const }]}
      xKey={xKey}
      size="compact"
      title=""
      showLegend={false}
      showGrid={false}
      {...options}
    />
  );
};

// === EXPORT ALL TEMPLATES ===

export const ChartTemplates = {
  // Line Charts
  LineChartSingle,
  LineChartMulti,
  LineChartDualAxis,
  
  // Area Charts
  AreaChartSingle,
  AreaChartStacked,
  AreaChartGradient,
  
  // Bar Charts
  BarChartVertical,
  BarChartHorizontal,
  BarChartStacked,
  BarChartGrouped,
  
  // Mixed Charts
  MixedLineBar,
  MixedAreaBar,
  MixedLineArea,
  
  // Specialized Charts
  TrendChart,
  ComparisonChart,
  DistributionChart,
  PerformanceChart,
  GrowthChart,
  ForecastChart,
  CorrelationChart,
  AnomalyChart,
  FunnelChart,
  RealTimeChart,
  SummaryChart,
  
  // Compact
  CompactMetricChart,
} as const;

export type ChartTemplateKey = keyof typeof ChartTemplates;
