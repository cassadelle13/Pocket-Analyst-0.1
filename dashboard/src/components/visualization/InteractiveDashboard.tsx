"use client";

import { useState, useEffect } from "react";
import { Card, Title, Text } from "@tremor/react";
import { EChartsRenderer } from "./EChartsRenderer";
import { OffscreenRenderer } from "./OffscreenRenderer";
import { AnimatedGrid } from "./AnimatedGrid";
import type { ActivityDataPoint } from "../../types/visualization";

interface InteractiveDashboardProps {
  activityData: ActivityDataPoint[];
  trafficData: Array<{ id: string; name: string; value: number }>;
  topEventsData: Array<{ id: string; name: string; value: number }>;
}

export function InteractiveDashboard({
  activityData,
  trafficData,
  topEventsData,
}: InteractiveDashboardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ActivityDataPoint | null>(null);
  const [useOffscreen, setUseOffscreen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Check OffscreenCanvas support
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const supported = !!canvas.transferControlToOffscreen;
    setUseOffscreen(supported);
  }, []);

  const handleDataPointClick = (point: ActivityDataPoint) => {
    setSelectedPoint(point);
    setModalOpen(true);
  };

  const exportToCSV = (data: any[], filename: string) => {
    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map(row => Object.values(row).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = (data: any[], filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Animated Grid Background */}
      <AnimatedGrid gridSize={40} speed={0.01} opacity={0.05} />

      {/* Activity Chart */}
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8 relative z-10">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <Title className="text-white text-2xl">Activity Overview</Title>
            <Text className="text-slate-300 mt-1 text-lg">User engagement and event volume over the last 24 hours</Text>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportToCSV(activityData, "activity-data.csv")}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-sm transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => exportToJSON(activityData, "activity-data.json")}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-sm transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>

        <div className="relative">
          {useOffscreen ? (
            <OffscreenRenderer
              data={activityData}
              width={800}
              height={400}
              onDataPointClick={handleDataPointClick}
            />
          ) : (
            <EChartsRenderer
              data={activityData}
              width={800}
              height={400}
              useWebGL={true}
              onDataPointClick={handleDataPointClick}
            />
          )}
        </div>

        {/* Performance indicator */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>Rendering: {useOffscreen ? "OffscreenCanvas (Worker)" : "Main Thread"}</span>
          <span>Points: {activityData.length}</span>
        </div>
      </Card>

      {/* Traffic Sources & Top Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <Title className="text-white text-2xl">Traffic Sources</Title>
              <Text className="text-slate-300 mt-1 text-lg">Where your users are coming from</Text>
            </div>
            <button
              onClick={() => exportToJSON(trafficData, "traffic-sources.json")}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-sm transition-colors"
            >
              Export
            </button>
          </div>

          {/* Use ECharts for donut chart */}
          <EChartsRenderer
            data={trafficData.map(item => ({
              bucket: item.name,
              events: item.value,
              users: 0,
            }))}
            width={350}
            height={350}
            useWebGL={true}
          />
        </Card>

        <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <Title className="text-white text-2xl">Top Events</Title>
              <Text className="text-slate-300 mt-1 text-lg">Most frequent user actions</Text>
            </div>
            <button
              onClick={() => exportToJSON(topEventsData, "top-events.json")}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-sm transition-colors"
            >
              Export
            </button>
          </div>

          {/* Use ECharts for bar chart */}
          <EChartsRenderer
            data={topEventsData.map(item => ({
              bucket: item.name,
              events: item.value,
              users: 0,
            }))}
            width={350}
            height={350}
            useWebGL={true}
          />
        </Card>
      </div>

      {/* Drill-down Modal */}
      {modalOpen && selectedPoint && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/20 p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <Title className="text-white text-xl">Activity Details</Title>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Text className="text-slate-400 text-sm">Time Period</Text>
                <Text className="text-white font-medium">{selectedPoint.bucket}</Text>
              </div>

              <div>
                <Text className="text-slate-400 text-sm">Events</Text>
                <Text className="text-white font-medium">{selectedPoint.events.toLocaleString()}</Text>
              </div>

              <div>
                <Text className="text-slate-400 text-sm">Active Users</Text>
                <Text className="text-white font-medium">{selectedPoint.users.toLocaleString()}</Text>
              </div>

              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={() => exportToJSON([selectedPoint], "activity-detail.json")}
                  className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg border border-blue-400/20 transition-colors"
                >
                  Export Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
