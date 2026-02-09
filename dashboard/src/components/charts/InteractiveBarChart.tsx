"use client";

import { useState } from "react";
import { BarChart } from "@tremor/react";
import { Button } from "@tremor/react";
import { DownloadIcon, Maximize2Icon, SearchIcon } from "lucide-react";

interface InteractiveBarChartProps {
  data: Array<{ [key: string]: any }>;
  index: string;
  category: string;
  color?: string;
  title?: string;
  onDrillDown?: (dataPoint: any) => void;
  searchable?: boolean;
  exportOptions?: string[];
}

export function InteractiveBarChart({ 
  data, 
  index, 
  category, 
  color = "#8B5CF6",
  title,
  onDrillDown,
  searchable = true,
  exportOptions = ["csv", "json"]
}: InteractiveBarChartProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"asc" | "desc" | "none">("none");

  const filteredData = data.filter(item => {
    if (!searchTerm) return true;
    return item[index].toLowerCase().includes(searchTerm.toLowerCase());
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (sortBy === "none") return 0;
    return sortBy === "asc" 
      ? a[category] - b[category]
      : b[category] - a[category];
  });

  const handleExport = (format: string) => {
    if (format === "csv") {
      const csv = [
        [index, category].join(","),
        ...sortedData.map(row => [row[index], row[category]].join(","))
      ].join("\n");
      
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "bar-chart-data"}.csv`;
      a.click();
      return;
    }

    if (format === "json") {
      const blob = new Blob([JSON.stringify(sortedData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "bar-chart-data"}.json`;
      a.click();
    }
  };

  const handleBarClick = (dataPoint: any) => {
    if (onDrillDown) {
      onDrillDown(dataPoint);
    }
  };

  const totalValue = sortedData.reduce((sum, item) => sum + (item[category] || 0), 0);
  const averageValue = totalValue / sortedData.length;

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-2xl border border-white/20 p-4">
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-medium">{title}</h3>
        
        <div className="flex items-center gap-2">
          {/* Sort controls */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "asc" | "desc" | "none")}
            className="bg-white/10 text-white border border-white/20 rounded px-2 py-1 text-sm"
          >
            <option value="none">Default</option>
            <option value="desc">Highest First</option>
            <option value="asc">Lowest First</option>
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

      {/* Search bar */}
      {searchable && (
        <div className="relative mb-4">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white/10 text-white border border-white/20 rounded-lg pl-10 pr-4 py-2 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400"
          />
        </div>
      )}

      {/* Chart */}
      <div className={`${isExpanded ? 'h-96' : 'h-64'} transition-all duration-300`}>
        <BarChart
          data={sortedData}
          index={index}
          categories={[category]}
          colors={[color]}
          valueFormatter={(value) => Number(value).toLocaleString()}
          yAxisWidth={60}
          onValueChange={(payload) => {
            const p = payload as any;
            const first = p?.activePayload?.[0];
            const dp = first?.payload;
            if (dp) handleBarClick(dp);
          }}
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="text-center">
          <div className="text-xs text-slate-400">Total</div>
          <div className="text-sm font-medium text-white">{totalValue.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400">Average</div>
          <div className="text-sm font-medium text-white">{averageValue.toFixed(0)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400">Items</div>
          <div className="text-sm font-medium text-white">{sortedData.length}</div>
        </div>
      </div>
    </div>
  );
}
