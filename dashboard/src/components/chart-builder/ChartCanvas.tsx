"use client";

import { useMemo } from "react";
import type { ChartConfig } from "../../types/chart-builder";
import BaseChart from "../charts/BaseChart";
import { BarChart3, LineChart, Table } from "lucide-react";

interface ChartCanvasProps {
  config: ChartConfig;
  data: any[];
  loading: boolean;
  onChartTypeChange: (type: ChartConfig['chartType']) => void;
}

function TablePreview({ data, columns }: { data: any[]; columns: string[] }) {
  if (data.length === 0 || columns.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No data available
      </div>
    );
  }

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 max-h-[520px] overflow-x-auto overflow-y-auto rounded-2xl border border-white/10 custom-scrollbar">
      <table className="w-max min-w-full">
        <thead className="bg-white/5 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-white/10 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-white/5 transition-colors">
              {columns.map((col) => (
                <td key={`${rowIdx}.${col}`} className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                  {formatValue(row?.[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCanvas({ config, data, loading, onChartTypeChange }: ChartCanvasProps) {
  const chartOption = useMemo(() => {
    if (!config.xAxis || config.yAxis.length === 0 || data.length === 0) {
      return null;
    }

    const xName = config.xAxis.name;

    if (config.chartType === 'table') {
      const xData = data.map((row) => row[xName]);
      const series = config.yAxis.map((yField) => ({
        name: yField.name,
        type: 'bar',
        data: data.map((row) => row[yField.name]),
      }));

      return {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: '#334155',
          textStyle: { color: '#e2e8f0' },
        },
        legend: {
          data: config.yAxis.map((y) => y.name),
          textStyle: { color: '#e2e8f0' },
          top: 10,
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: 60,
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: xData,
          axisLabel: { color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series,
      };
    }

    const measureFields = config.yAxis.filter((y) => y.classification === 'measure');
    if (measureFields.length === 0) {
      return null;
    }

    const groupByField = config.yAxis.find((y) => y.classification !== 'measure');
    const groupByName = groupByField?.name;

    const xValues = data.map((row) => row[xName]);
    const xData = Array.from(new Set(xValues));

    const groups = groupByName
      ? Array.from(new Set(data.map((row) => row[groupByName])))
      : [null];

    const series = groups.flatMap((groupValue) =>
      measureFields.map((measure) => {
        const seriesName =
          groupByName && groupValue !== null && groupValue !== undefined
            ? `${String(groupValue)}: ${measure.name}`
            : measure.name;

        const pointByX = new Map<unknown, unknown>();
        for (const row of data) {
          if (groupByName) {
            if (row[groupByName] !== groupValue) continue;
          }
          pointByX.set(row[xName], row[measure.name]);
        }

        return {
          name: seriesName,
          type: config.chartType,
          data: xData.map((x) => pointByX.get(x) ?? null),
        };
      })
    );

    const legendData = series.map((s) => s.name);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
      },
      legend: {
        data: legendData,
        textStyle: { color: '#e2e8f0' },
        top: 10,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 60,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series,
    };
  }, [config, data]);

  const tableColumns = useMemo(() => {
    if (config.xAxis && config.yAxis.length > 0) {
      return [config.xAxis, ...config.yAxis].map((c) => c.name);
    }
    if (data.length > 0) {
      return Object.keys(data[0]);
    }
    return [];
  }, [config.xAxis, config.yAxis, data]);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-xl px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Chart Preview</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {config.xAxis && config.yAxis.length > 0
              ? `${config.xAxis.name} vs ${config.yAxis.map(y => y.name).join(', ')}`
              : 'Configure chart by dragging fields'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChartTypeChange('line')}
            className={`
              p-2 rounded-xl border transition-all
              ${config.chartType === 'line'
                ? 'bg-white/15 border-white/20 text-emerald-400'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
              }
            `}
            title="Line Chart"
          >
            <LineChart className="w-4 h-4" />
          </button>
          <button
            onClick={() => onChartTypeChange('bar')}
            className={`
              p-2 rounded-xl border transition-all
              ${config.chartType === 'bar'
                ? 'bg-white/15 border-white/20 text-emerald-400'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
              }
            `}
            title="Bar Chart"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onChartTypeChange('table')}
            className={`
              p-2 rounded-xl border transition-all
              ${config.chartType === 'table'
                ? 'bg-white/15 border-white/20 text-emerald-400'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
              }
            `}
            title="Table View"
          >
            <Table className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 text-sm">Loading data...</p>
            </div>
          </div>
        ) : config.chartType === 'table' ? (
          <TablePreview data={data} columns={tableColumns} />
        ) : !config.xAxis || config.yAxis.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Start Building Your Chart
              </h3>
              <p className="text-slate-400 mb-4">
                Drag fields from the left panel to the X and Y axis zones below
              </p>
              <div className="text-sm text-slate-500 space-y-1">
                <p>• Time/Dimension fields → X Axis</p>
                <p>• Measure fields → Y Axis</p>
              </div>
            </div>
          </div>
        ) : chartOption ? (
          <BaseChart option={chartOption} height={500} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-slate-400">No data to display</p>
          </div>
        )}
      </div>
    </div>
  );
}
