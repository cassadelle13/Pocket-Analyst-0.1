"use client";

import { Users, Activity, TrendingUp, MousePointerClick } from "lucide-react";
import {
  AnalystInsights,
  RetentionChart,
  EventsTable,
} from "@/components/widgets";

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Your AI Analyst</h1>
          <p className="text-slate-500 mt-1">
            Real-time insights powered by your data
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Stats */}
          <div className="flex items-center gap-6 px-4 py-2 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-white">12.5K</span>
              <span className="text-xs text-lime-400">+8%</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-white">4.2K</span>
              <span className="text-xs text-red-400">-2%</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-white">3.2%</span>
              <span className="text-xs text-lime-400">+0.5%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - AI First Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* AI Insights - Takes 3 columns, primary focus */}
        <div className="lg:col-span-3">
          <AnalystInsights />
        </div>

        {/* Retention Chart - Takes 2 columns */}
        <div className="lg:col-span-2">
          <RetentionChart />
        </div>
      </div>

      {/* Events Table - Full width */}
      <EventsTable />
    </div>
  );
}
