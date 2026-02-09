"use client";

import { TrendingDown } from "lucide-react";

interface RetentionDataPoint {
  day: string;
  retention: number;
  benchmark: number;
}

const retentionData: RetentionDataPoint[] = [
  { day: "D1", retention: 45, benchmark: 50 },
  { day: "D3", retention: 32, benchmark: 35 },
  { day: "D7", retention: 24, benchmark: 28 },
  { day: "D14", retention: 18, benchmark: 20 },
  { day: "D30", retention: 12, benchmark: 15 },
];

interface RetentionChartProps {
  title?: string;
  data?: RetentionDataPoint[];
}

export function RetentionChart({ title = "Retention Curve", data = retentionData }: RetentionChartProps) {
  const maxRetention = Math.max(...data.map(d => Math.max(d.retention, d.benchmark)));
  
  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">vs. industry benchmark</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-lime-400" />
            <span className="text-slate-400">Your app</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-slate-600" />
            <span className="text-slate-400">Benchmark</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.day} className="flex items-center gap-4">
            <span className="w-10 text-xs font-medium text-slate-500">{item.day}</span>
            <div className="flex-1 relative h-8">
              {/* Benchmark bar (background) */}
              <div
                className="absolute inset-y-0 left-0 bg-slate-700/50 rounded-lg"
                style={{ width: `${(item.benchmark / maxRetention) * 100}%` }}
              />
              {/* Retention bar */}
              <div
                className={`absolute inset-y-0 left-0 rounded-lg transition-all ${
                  item.retention < item.benchmark ? "bg-red-500/80" : "bg-lime-400"
                }`}
                style={{ width: `${(item.retention / maxRetention) * 100}%` }}
              />
              {/* Value label */}
              <div className="absolute inset-y-0 flex items-center pl-3">
                <span className="text-xs font-semibold text-white drop-shadow-lg">
                  {item.retention}%
                </span>
              </div>
            </div>
            {item.retention < item.benchmark && (
              <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-xs text-slate-500">D7 retention is 14% below benchmark</span>
        <button className="text-xs font-medium text-lime-400 hover:text-lime-300 transition-colors">
          Analyze drop-off →
        </button>
      </div>
    </div>
  );
}
