"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface ExplainModalState {
  isOpen: boolean;
  chartId?: string;
  option?: Record<string, unknown>;
}

export function ChartExplainModal() {
  const [state, setState] = useState<ExplainModalState>({ isOpen: false });

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { chartId?: string; option?: Record<string, unknown> };
      if (detail) {
        setState({ isOpen: true, chartId: detail.chartId, option: detail.option });
      }
    };

    window.addEventListener('chart:explain', handler as EventListener);
    return () => window.removeEventListener('chart:explain', handler as EventListener);
  }, []);

  const close = () => setState({ isOpen: false });

  if (!state.isOpen || !state.option) return null;

  // Extract chart information from option
  const opt = state.option as any;
  const chartType = opt.series?.[0]?.type || 'unknown';
  const xAxis = opt.xAxis?.[0]?.name || opt.xAxis?.[0]?.data?.[0] || 'Unknown';
  const series = Array.isArray(opt.series) ? opt.series : [];
  const filters = opt.filters || [];
  const aggregations = series.map((s: any) => `${s.name || 'Series'}: SUM`);

  // Mock SQL generation - in real implementation, this would come from query generator
  const generateMockSQL = () => {
    const table = 'analytics.events'; // Mock table
    const selectFields = series.map((s: any, idx: number) => `${s.name || `metric_${idx}`}`);
    const groupBy = xAxis !== 'Unknown' ? `GROUP BY ${xAxis}` : '';
    const whereClause = filters.length > 0 ? `WHERE ${filters.map((f: any) => `${f.field} ${f.operator} '${f.value}'`).join(' AND ')}` : '';

    return `SELECT
  ${xAxis} as x_axis,
  ${selectFields.join(',\n  ')}
FROM ${table}
${whereClause}
${groupBy}
ORDER BY ${xAxis}
LIMIT 1000`.trim();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Explain Chart</h2>
          <button
            onClick={close}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          <div className="space-y-6">
            {/* Chart Configuration */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Chart Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Chart Type</h4>
                  <p className="text-white bg-slate-800 rounded-lg px-3 py-2">{chartType}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">X Axis</h4>
                  <p className="text-white bg-slate-800 rounded-lg px-3 py-2">{xAxis}</p>
                </div>
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Y Axes / Metrics</h4>
                  <ul className="space-y-2">
                    {series.map((s: any, idx: number) => (
                      <li key={idx} className="text-white bg-slate-800 rounded-lg px-3 py-2">
                        {s.name || `Series ${idx + 1}`} (SUM)
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Filters */}
            {filters.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Filters</h3>
                <ul className="space-y-2">
                  {filters.map((filter: any, idx: number) => (
                    <li key={idx} className="text-white bg-slate-800 rounded-lg px-3 py-2">
                      {filter.field} {filter.operator} {filter.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generated SQL */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4">Generated SQL</h3>
              <pre className="bg-slate-950 border border-white/10 rounded-lg p-4 text-sm text-slate-200 overflow-x-auto">
                {generateMockSQL()}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-white/10">
          <button
            onClick={close}
            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
