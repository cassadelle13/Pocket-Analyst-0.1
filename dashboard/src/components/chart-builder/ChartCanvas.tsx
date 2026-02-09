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

export function ChartCanvas({ config, data, loading, onChartTypeChange }: ChartCanvasProps) {
  const chartOption = useMemo(() => {
    if (!config.xAxis || config.yAxis.length === 0 || data.length === 0) {
      return null;
    }

    const xData = data.map(row => row[config.xAxis!.name]);
    const series = config.yAxis.map(yField => ({
      name: yField.name,
      type: config.chartType === 'table' ? 'bar' : config.chartType,
      data: data.map(row => row[yField.name]),
    }));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
      },
      legend: {
        data: config.yAxis.map(y => y.name),
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

  return (
    <div className="flex-1 flex flex-col bg-slate-950">
      <div className="border-b border-slate-700 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Chart Preview</h2>
          <p className="text-sm text-slate-400 mt-1">
            {config.xAxis && config.yAxis.length > 0
              ? `${config.xAxis.name} vs ${config.yAxis.map(y => y.name).join(', ')}`
              : 'Configure chart by dragging fields'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onChartTypeChange('line')}
            className={`
              p-2 rounded-lg transition-colors
              ${config.chartType === 'line'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }
            `}
            title="Line Chart"
          >
            <LineChart className="w-5 h-5" />
          </button>
          <button
            onClick={() => onChartTypeChange('bar')}
            className={`
              p-2 rounded-lg transition-colors
              ${config.chartType === 'bar'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }
            `}
            title="Bar Chart"
          >
            <BarChart3 className="w-5 h-5" />
          </button>
          <button
            onClick={() => onChartTypeChange('table')}
            className={`
              p-2 rounded-lg transition-colors
              ${config.chartType === 'table'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }
            `}
            title="Table View"
          >
            <Table className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400">Loading data...</p>
            </div>
          </div>
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
        ) : config.chartType === 'table' ? (
          <TableView data={data} config={config} />
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

function TableView({ data, config }: { data: any[]; config: ChartConfig }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No data available
      </div>
    );
  }

  const columns = [config.xAxis!, ...config.yAxis];

  return (
    <div className="overflow-auto rounded-lg border border-slate-700">
      <table className="min-w-full">
        <thead className="bg-slate-800 sticky top-0">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={`${col.name}.${idx}`}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-700"
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-slate-900 divide-y divide-slate-800">
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-slate-800/50 transition-colors">
              {columns.map((col, colIdx) => (
                <td
                  key={`${rowIdx}.${colIdx}`}
                  className="px-4 py-3 text-sm text-slate-300"
                >
                  {row[col.name] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
