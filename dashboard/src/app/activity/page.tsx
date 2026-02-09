"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { RequireRole } from "../../components/auth";
import { 
  Card, 
  Grid, 
  Title, 
  Text,
  Metric
} from "@tremor/react";
import { ActivityIcon, ZapIcon, TrendingUpIcon, ClockIcon } from "lucide-react";
import { RealTimeMetrics, AdvancedFilters } from "../../components/charts";
import { LazyMount, ExportButton } from "../../components/ui";
import { useDemoMode } from "@/context/DemoContext";
import { useGlobalFilters } from "@/store/globalFiltersContext";

const UPlotTrendModule = dynamic(() => import("../../components/analytics/UPlotTrendModule"), { ssr: false });
const BarChartModule = dynamic(() => import("../../components/analytics/BarChartModule"), { ssr: false });

// Demo fallbacks
const demoActivityData = [
  { time: "00:00", events: 120, users: 45, errors: 2 },
  { time: "04:00", events: 80, users: 25, errors: 1 },
  { time: "08:00", events: 340, users: 156, errors: 5 },
  { time: "12:00", events: 520, users: 234, errors: 8 },
  { time: "16:00", events: 480, users: 198, errors: 6 },
  { time: "20:00", events: 290, users: 123, errors: 3 },
  { time: "23:59", events: 150, users: 67, errors: 2 },
];

const demoEventTypeData = [
  { category: "Page Views", value: 3420 },
  { category: "Clicks", value: 2156 },
  { category: "Form Submits", value: 892 },
  { category: "Downloads", value: 445 },
  { category: "Signups", value: 234 },
  { category: "Searches", value: 389 },
  { category: "Shares", value: 156 },
];

const performanceData = [
  { metric: "Total Events", value: 8456, unit: "" },
  { metric: "Active Users", value: 234, unit: "" },
  { metric: "Response Time", value: 245, unit: "ms" },
  { metric: "Uptime", value: 99.8, unit: "%" },
];

// Filter options for advanced filtering
const filterOptions = [
  {
    id: "timeRange",
    label: "Time Range",
    type: "select" as const,
    options: [
      { value: "1h", label: "Last Hour" },
      { value: "24h", label: "Last 24 Hours" },
      { value: "7d", label: "Last 7 Days" },
      { value: "30d", label: "Last 30 Days" }
    ]
  },
  {
    id: "eventType",
    label: "Event Types",
    type: "multiselect" as const,
    options: [
      { value: "page_view", label: "Page Views" },
      { value: "click", label: "Clicks" },
      { value: "form_submit", label: "Form Submits" },
      { value: "download", label: "Downloads" }
    ]
  },
  {
    id: "userType",
    label: "User Type",
    type: "select" as const,
    options: [
      { value: "all", label: "All Users" },
      { value: "new", label: "New Users" },
      { value: "returning", label: "Returning Users" }
    ]
  }
];

export default function ActivityPage() {
  const { isDemoMode } = useDemoMode();
  const { dateRange } = useGlobalFilters();
  const [selectedDrilldown, setSelectedDrilldown] = useState<
    | { title: string; payload: Record<string, unknown> }
    | null
  >(null);

  const [activeFilters, setActiveFilters] = useState<any[]>(filterOptions);

  // Real data state
  const [rawActivityData, setRawActivityData] = useState<Array<{ ts: number; events: number; users: number; errors: number }>>([]);
  const [rawEventTypes, setRawEventTypes] = useState<Array<{ category: string; value: number }>>([]);

  // Fetch 24h activity
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isDemoMode) {
          if (!cancelled) setRawActivityData([]);
          return;
        }
        const params = new URLSearchParams({
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        });
        const res = await fetch(`/api/rest/analytics-activity-24h?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json)) setRawActivityData(json);
      } catch {
        if (!cancelled) setRawActivityData([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isDemoMode, dateRange.start, dateRange.end]);

  // Fetch event types
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isDemoMode) {
          if (!cancelled) setRawEventTypes([]);
          return;
        }
        const params = new URLSearchParams({
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        });
        const res = await fetch(`/api/rest/analytics-event-types?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json)) setRawEventTypes(json as any);
      } catch {
        if (!cancelled) setRawEventTypes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isDemoMode, dateRange.start, dateRange.end]);

  const handleDrillDown = (category: string, dataPoint: any) => {
    setSelectedDrilldown({
      title: `Details: ${category}`,
      payload: dataPoint ?? {},
    });
  };

  const handleBarClick = (dataPoint: any) => {
    setSelectedDrilldown({
      title: `Event Type: ${String(dataPoint?.category ?? "")}`,
      payload: dataPoint ?? {},
    });
  };

  const handleFiltersChange = (filters: any[]) => {
    setActiveFilters(filters);
  };

  const filteredActivityData = useMemo(() => {
    const base = isDemoMode ? demoActivityData : (rawActivityData.length ? rawActivityData : demoActivityData);
    const timeRange = activeFilters?.find((f) => f.id === "timeRange")?.value;
    if (!timeRange || timeRange === "24h") return base;
    if (timeRange === "1h") return base.slice(-2);
    if (timeRange === "7d" || timeRange === "30d") return base;
    return base;
  }, [activeFilters, isDemoMode, rawActivityData]);

  const activityTrendData = useMemo(() => {
    // If real data exists, it already contains ts
    if (!isDemoMode && rawActivityData.length) return rawActivityData;
    // Otherwise synthesize stable timestamps for demo
    return filteredActivityData.map((d: any, idx: number) => {
      const baseTs = Date.now() - 24 * 60 * 60 * 1000;
      const step = Math.floor((24 * 60 * 60 * 1000) / Math.max(1, filteredActivityData.length - 1));
      return {
        ts: baseTs + idx * step,
        events: d.events,
        users: d.users,
        errors: d.errors,
        time: d.time,
      };
    });
  }, [filteredActivityData, isDemoMode, rawActivityData]);

  const eventTypeData = useMemo(() => {
    const base = isDemoMode ? demoEventTypeData : (rawEventTypes.length ? rawEventTypes : demoEventTypeData);
    return base;
  }, [isDemoMode, rawEventTypes]);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 relative overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10">
          <div className="p-8 space-y-8">
            {/* Page Header */}
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-orange-500/20 to-orange-600/20 rounded-2xl border border-orange-400/20">
                  <ActivityIcon className="h-8 w-8 text-orange-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">Activity Monitor</h1>
                  <p className="text-slate-300 mt-2">Real-time user activity and system performance</p>
                </div>
              </div>
            </div>

            {/* Advanced Filters */}
            <AdvancedFilters 
              filters={filterOptions}
              onFiltersChange={handleFiltersChange}
            />

            {/* Real-time Metrics */}
            <RealTimeMetrics />

            {/* Activity Metrics */}
            <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-6">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-orange-500/20 to-orange-600/20 rounded-xl border border-orange-400/20">
                    <ZapIcon className="h-6 w-6 text-orange-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Total Events</Text>
                    <Metric className="text-white">8,456</Metric>
                    <Text className="text-orange-400 text-sm">+15.3%</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl border border-blue-400/20">
                    <ActivityIcon className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Active Now</Text>
                    <Metric className="text-white">234</Metric>
                    <Text className="text-blue-400 text-sm">Live users</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-xl border border-emerald-400/20">
                    <TrendingUpIcon className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Response Time</Text>
                    <Metric className="text-white">245ms</Metric>
                    <Text className="text-emerald-400 text-sm">Optimal</Text>
                  </div>
                </div>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl border border-purple-400/20">
                    <ClockIcon className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Uptime</Text>
                    <Metric className="text-white">99.8%</Metric>
                    <Text className="text-purple-400 text-sm">Last 30 days</Text>
                  </div>
                </div>
              </Card>
            </Grid>

            {/* Interactive Charts */}
            <Grid numItems={1} numItemsLg={2} className="gap-6">
              {/* Interactive 24h Activity */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <Title className="text-white text-xl">24 Hour Activity</Title>
                  <Text className="text-slate-300 mt-1">Events, users and errors throughout the day</Text>
                  <div className="mt-4 flex justify-end">
                    <ExportButton data={{ data: activityTrendData, filename: "activity_trend" }} title="Export" />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  <UPlotTrendModule
                    data={activityTrendData}
                    xKey="ts"
                    height={360}
                    series={[
                      { key: "events", name: "Events", stroke: "#f97316" },
                      { key: "users", name: "Users", stroke: "#3b82f6" },
                      { key: "errors", name: "Errors", stroke: "#ef4444" },
                    ]}
                    onPointClick={(payload) => handleDrillDown("Activity", payload)}
                  />
                </LazyMount>
              </Card>

              {/* Interactive Event Types */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <Title className="text-white text-xl">Event Types Distribution</Title>
                  <Text className="text-slate-300 mt-1">Breakdown of user interactions by type</Text>
                  <div className="mt-4 flex justify-end">
                    <ExportButton data={{ data: eventTypeData, filename: "activity_event_types" }} title="Export" />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  <BarChartModule
                    data={eventTypeData}
                    index="category"
                    valueKey="value"
                    height={360}
                    color="#a78bfa"
                    onBarClick={(payload) => handleBarClick(payload)}
                  />
                </LazyMount>
              </Card>
            </Grid>

            {/* Performance Metrics */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="mb-6">
                <Title className="text-white text-xl">System Performance Metrics</Title>
                <Text className="text-slate-300 mt-1">Key performance indicators and thresholds</Text>
              </div>
              <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-4">
                {performanceData.map((metric, index) => (
                  <div key={index} className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {metric.metric === "Response Time" && <ClockIcon className="h-4 w-4 text-blue-400" />}
                      {metric.metric === "Uptime" && <TrendingUpIcon className="h-4 w-4 text-emerald-400" />}
                      {metric.metric === "Total Events" && <ZapIcon className="h-4 w-4 text-orange-400" />}
                      {metric.metric === "Active Users" && <ActivityIcon className="h-4 w-4 text-blue-400" />}
                      <Text className="text-slate-300 text-sm">{metric.metric}</Text>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Metric className="text-white text-lg">{metric.value}</Metric>
                        <span className="text-slate-400 text-xs">{metric.unit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </Grid>
            </Card>
          </div>
        </div>
      </div>

      {selectedDrilldown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedDrilldown(null)}
        >
          <div
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Card className="backdrop-blur-xl bg-slate-900/80 rounded-3xl border border-white/20 shadow-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Title className="text-white text-xl">{selectedDrilldown.title}</Title>
                  <Text className="text-slate-300 mt-1">Click outside to close</Text>
                </div>
                <button
                  className="text-slate-300 hover:text-white"
                  onClick={() => setSelectedDrilldown(null)}
                >
                  ✕
                </button>
              </div>
              <div className="mt-4 backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
                <pre className="whitespace-pre-wrap text-slate-200 text-sm">
                  {JSON.stringify(selectedDrilldown.payload, null, 2)}
                </pre>
              </div>
            </Card>
          </div>
        </div>
      )}
    </RequireRole>
  );
}
