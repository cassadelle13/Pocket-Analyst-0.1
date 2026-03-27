"use client";

import { RequireRole } from "../../components/auth";
import { ChartActionsMenu } from "../../components/charts/ChartActionsMenu";

export default function VoronoiChartPage() {
  const chartId = "datalens-voronoi-demo";

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
      <div className="relative min-h-screen bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
        </div>
        <div className="relative p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-white">DataLens: Voronoi Diagram</h1>
              <ChartActionsMenu chartId={chartId} />
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-center h-[500px]">
                <div className="text-center">
                  <div className="text-6xl mb-4">📐</div>
                  <h2 className="text-2xl font-semibold text-white mb-2">Voronoi Diagram</h2>
                  <p className="text-slate-400 max-w-md">
                    Voronoi diagrams require custom rendering logic or specialized libraries.
                    This is a placeholder for advanced geometric visualization.
                  </p>
                  <p className="text-slate-500 text-sm mt-4">
                    Requires: D3.js voronoi or custom ECharts extension
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
