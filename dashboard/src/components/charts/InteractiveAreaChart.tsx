"use client";

import { useState } from "react";
import { AreaChart } from "@tremor/react";
import { Button } from "@tremor/react";
import { DownloadIcon, Maximize2Icon } from "lucide-react";

interface InteractiveAreaChartProps {
  data: Array<{ [key: string]: any }>;
  index: string;
  categories: string[];
  colors?: string[];
  title?: string;
  onDrillDown?: (category: string, dataPoint: any) => void;
  exportOptions?: string[];
}

export function InteractiveAreaChart({ 
  data, 
  index, 
  categories, 
  colors = ["#3B82F6", "#10B981"],
  title,
  onDrillDown,
  exportOptions = ["csv", "json"]
}: InteractiveAreaChartProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExport = (format: string) => {
    if (format === "csv") {
      const csv = [
        [index, ...categories].join(","),
        ...data.map(row => [row[index], ...categories.map(cat => row[cat])].join(","))
      ].join("\n");
      
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "chart-data"}.csv`;
      a.click();
      return;
    }

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "chart-data"}.json`;
      a.click();
    }
  };

  const handleChartClick = (dataPoint: any) => {
    if (onDrillDown && selectedCategory) {
      onDrillDown(selectedCategory, dataPoint);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-4">
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium">{title}</h3>
          {selectedCategory && (
            <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
              {selectedCategory}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Category selector */}
          <select
            value={selectedCategory || ""}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="bg-white/10 text-white border border-white/20 rounded px-2 py-1 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          
          {/* Export button */}
          <div className="relative group">
            <Button
              size="xs"
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
            >
              <DownloadIcon className="h-3 w-3" />
            </Button>
            <div className="absolute right-0 mt-1 w-24 bg-slate-800 border border-white/20 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible z-10">
              {exportOptions.map(format => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="block w-full text-left px-3 py-1 text-sm text-white hover:bg-white/10"
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          {/* Expand button */}
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            <Maximize2Icon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Chart */}
      <div className={`${isExpanded ? 'h-96' : 'h-64'} transition-all duration-300`}>
        <AreaChart
          data={data}
          index={index}
          categories={selectedCategory ? [selectedCategory] : categories}
          colors={colors}
          valueFormatter={(value) => Number(value).toLocaleString()}
          yAxisWidth={60}
          onValueChange={(payload) => {
            const p = payload as any;
            const first = p?.activePayload?.[0];
            const dp = first?.payload;
            if (dp) handleChartClick(dp);
          }}
        />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {categories.slice(0, 3).map((cat, idx) => {
          const total = data.reduce((sum, row) => sum + (row[cat] || 0), 0);
          const avg = total / data.length;
          return (
            <div key={cat} className="text-center">
              <div className="text-xs text-slate-400">{cat}</div>
              <div className="text-sm font-medium text-white">{avg.toFixed(0)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
