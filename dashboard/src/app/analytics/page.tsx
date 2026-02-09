"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, Title, Text, Flex, Badge, Button, Select, SelectItem, Grid, Metric } from "@tremor/react";
import { Calendar, Download, Filter, TrendingUp, Users, Zap, Target, ActivityIcon, ZapIcon, ClockIcon, UserPlusIcon, UserCheckIcon, UserXIcon, MoreVertical, Brain, Settings2 } from "lucide-react";
import { ChartConfigModal } from "@/components/chart-config/ChartConfigModal";
import { AIChartAssistant } from "@/components/chart-config/AIChartAssistant";
import type { ChartConfig, ChartType } from "@/types/chart-config";
import { useDemoMode } from "@/context/DemoContext";
import { useGraphicsMode } from "@/context/GraphicsContext";
import { useStaggeredInit, INIT_SEQUENCES } from "@/hooks/useStaggeredInit";
import { useWorker } from "@/hooks/useWorker";
import { getPerformanceMonitor } from "@/lib/performance-monitor";
import { useChartBus } from "@/context/ChartInteractionBus";
import type { ChartInteractionPayload } from "@/types/interaction";
import { useChartClickBehavior } from "@/context/ChartClickBehavior";
import {
  generateMockTrend,
  generateMockDevices,
  generateMockTrafficSources,
  generateMockFunnel,
  generateMockRetention,
  generateMockComplexUserFlows,
} from "@/lib/mockGenerator";
import { useList } from "@refinedev/core";
import { RequireRole } from "@/components/auth";
import { TrendingUpIcon, BarChart3Icon, PieChartIcon, UsersIcon, DollarSignIcon, TargetIcon } from "lucide-react";
import { DatePicker, useDateRange, SegmentFilter, useSegments, DataState, PropertyFilter } from "@/components/ui";
import { AdvancedFilters, RealTimeMetrics } from "@/components/charts";
import { ChartPreview } from "@/components/dashboard/ChartPreview";
import { LazyMount, SimpleExportButton, VirtualizedTable } from "@/components/ui";
import { ExportButton } from "@/components/ui";
import { TableRow, TableHeaderCell, TableCell } from "@tremor/react";
import { GlobalFiltersProvider, useGlobalFilters } from "@/store/globalFiltersContext";
import { RetentionCell } from "@/types/api";

// Lazy load all heavy chart components with loading states
const LoadingPlaceholder = ({ height = 360 }: { height?: number }) => (
  <div 
    className="rounded-xl bg-white/5 border border-white/10 animate-pulse flex items-center justify-center"
    style={{ height: `${height}px` }}
  >
    <div className="text-slate-400 text-sm">Loading chart...</div>
  </div>
);

function ChartMenu({ data, filename, chartType, onConfigOpen, onAIOpen }: { 
  data: any; 
  filename: string; 
  chartType: 'uplot' | 'echarts' | 'funnel' | 'retention' | 'sankey';
  onConfigOpen: () => void;
  onAIOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = () => {
    try {
      const str = JSON.stringify(data, null, 2);
      const blob = new Blob([str], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
    setOpen(false);
  };

  const handleAIConfig = () => {
    setOpen(false);
    onAIOpen();
  };

  const handleManualConfig = () => {
    setOpen(false);
    onConfigOpen();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] backdrop-blur-xl bg-slate-900/95 border border-white/20 rounded-xl shadow-2xl py-1 animate-in fade-in duration-100">
          <button
            type="button"
            onClick={handleExport}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            type="button"
            onClick={handleAIConfig}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Brain className="w-4 h-4" />
            <span>AI настройка</span>
          </button>
          <button
            type="button"
            onClick={handleManualConfig}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            <span>Ручная настройка</span>
          </button>
        </div>
      )}
    </div>
  );
}

const TrendChartModule = dynamic(() => import("@/components/analytics/UPlotTrendModule"), { 
  ssr: false,
  loading: () => <LoadingPlaceholder height={360} />
});

const BarChartModule = dynamic(() => import("@/components/analytics/BarChartModule"), { 
  ssr: false,
  loading: () => <LoadingPlaceholder height={320} />
});

const CyberFunnelModule = dynamic(() => import("@/components/analytics/CyberFunnelModule"), { 
  ssr: false,
  loading: () => <LoadingPlaceholder height={420} />
});

const RetentionMatrix = dynamic(() => import("@/components/analytics/RetentionMatrix"), { 
  ssr: false,
  loading: () => <LoadingPlaceholder height={400} />
});

const UserFlowModule = dynamic(() => import("@/components/analytics/UserFlowModule"), { 
  ssr: false,
  loading: () => <LoadingPlaceholder height={500} />
});

const UserConstellation = dynamic(() => import("@/components/users/UserConstellation"), { ssr: false });

// ── Activity mock data ──
const activityMockData = [
  { time: "00:00", events: 120, users: 45, errors: 2 },
  { time: "04:00", events: 80, users: 25, errors: 1 },
  { time: "08:00", events: 340, users: 156, errors: 5 },
  { time: "12:00", events: 520, users: 234, errors: 8 },
  { time: "16:00", events: 480, users: 198, errors: 6 },
  { time: "20:00", events: 290, users: 123, errors: 3 },
  { time: "23:59", events: 150, users: 67, errors: 2 },
];

const eventTypeData = [
  { category: "Page Views", value: 3420 },
  { category: "Clicks", value: 2156 },
  { category: "Form Submits", value: 892 },
  { category: "Downloads", value: 445 },
  { category: "Signups", value: 234 },
  { category: "Searches", value: 389 },
  { category: "Shares", value: 156 },
];

// ── Users mock data ──
const usersMockData = [
  { id: 1, name: "John Doe", email: "john@example.com", role: "Admin", status: "Active", lastActive: "2 hours ago", sessions: 156, revenue: "$2,450" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", role: "User", status: "Active", lastActive: "1 day ago", sessions: 89, revenue: "$1,230" },
  { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "User", status: "Inactive", lastActive: "3 days ago", sessions: 45, revenue: "$670" },
  { id: 4, name: "Alice Brown", email: "alice@example.com", role: "Premium", status: "Active", lastActive: "5 minutes ago", sessions: 234, revenue: "$4,890" },
  { id: 5, name: "Charlie Wilson", email: "charlie@example.com", role: "User", status: "Active", lastActive: "12 hours ago", sessions: 67, revenue: "$890" },
];

type GraphData = {
  nodes: Array<{ id: string; name?: string; size: number; category: number; ltv?: number; lastActive?: string }>;
  links: Array<{ source: string; target: string; weight?: number }>;
  categories: Array<{ name: string }>;
};

type FunnelStep = {
  key?: string;
  name: string;
  value: number;
  conversionFromPrev: number | null;
  aiNote?: string;
};

type FunnelResponse = {
  period: "24h" | "7d" | "30d";
  steps: FunnelStep[];
};

type CyberFunnelApiResponse = {
  data: FunnelResponse;
  isDemoData: boolean;
};

// Live data will be fetched from analytics endpoints

// Filter options for advanced filtering
const filterOptions = [
  {
    id: "timeRange",
    label: "Time Range",
    type: "select" as const,
    options: [
      { value: "7d", label: "Last 7 Days" },
      { value: "30d", label: "Last 30 Days" },
      { value: "90d", label: "Last 90 Days" },
      { value: "1y", label: "Last Year" }
    ]
  },
  {
    id: "trafficSource",
    label: "Traffic Source",
    type: "multiselect" as const,
    options: [
      { value: "organic", label: "Organic Search" },
      { value: "direct", label: "Direct" },
      { value: "social", label: "Social Media" },
      { value: "referral", label: "Referral" },
      { value: "email", label: "Email Campaign" },
      { value: "paid", label: "Paid Ads" }
    ]
  },
  {
    id: "deviceType",
    label: "Device Type",
    type: "select" as const,
    options: [
      { value: "all", label: "All Devices" },
      { value: "desktop", label: "Desktop" },
      { value: "mobile", label: "Mobile" },
      { value: "tablet", label: "Tablet" }
    ]
  }
];

function AnalyticsContent() {
  const { isDemoMode } = useDemoMode();
  const { isLowGraphicsMode } = useGraphicsMode();
  const worker = useWorker();
  const monitor = getPerformanceMonitor();
  const chartBus = useChartBus();
  const clickBehavior = useChartClickBehavior();
  
  // Staggered initialization for smooth loading
  const { isStepReady } = useStaggeredInit({
    steps: INIT_SEQUENCES.analytics,
    onStepComplete: (stepId) => {
      monitor.mark(`analytics-${stepId}-complete`);
    },
  });
  
  const {
    dateRange,
    setDateRange,
    segments,
    setSegments,
    propertyFilters,
    setPropertyFilters,
    addPropertyFilter,
    removePropertyFilter,
    updatePropertyFilter,
  } = useGlobalFilters();

  const [selectedDrilldown, setSelectedDrilldown] = useState<
    | { title: string; payload: Record<string, unknown> }
    | null
  >(null);

  const [activeFilters, setActiveFilters] = useState<any[]>(filterOptions);

  const [funnelPeriod, setFunnelPeriod] = useState<FunnelResponse["period"]>("7d");
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelIsDemoData, setFunnelIsDemoData] = useState(false);

  const [retentionDays, setRetentionDays] = useState(30);
  const [retentionData, setRetentionData] = useState<RetentionCell[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(false);

  const [userFlows, setUserFlows] = useState<any>(null);
  const [userFlowsLoading, setUserFlowsLoading] = useState(false);

  const [trendData, setTrendData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [devicesData, setDevicesData] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const [trafficSourcesData, setTrafficSourcesData] = useState<any[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(false);

  // ── Chart Config Modal state ──
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configModalData, setConfigModalData] = useState<{
    chartType: ChartType;
    chartName: string;
    currentConfig: Partial<ChartConfig>;
  } | null>(null);

  const handleOpenConfig = useCallback((chartType: ChartType, chartName: string, currentConfig: Partial<ChartConfig> = {}) => {
    setConfigModalData({ chartType, chartName, currentConfig });
    setConfigModalOpen(true);
  }, []);

  const handleSaveConfig = useCallback((config: ChartConfig) => {
    localStorage.setItem(`chart_config_${config.id}`, JSON.stringify(config));
    console.log('[Analytics] Chart config saved:', config.id);
    // TODO: Apply config to actual chart
  }, []);

  // ── AI Chart Assistant state ──
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiAssistantData, setAiAssistantData] = useState<{
    chartType: string;
    chartName: string;
  } | null>(null);

  const handleOpenAIAssistant = useCallback((chartType: string, chartName: string) => {
    setAiAssistantData({ chartType, chartName });
    setAiAssistantOpen(true);
  }, []);

  // ── Activity section state ──
  const activityTrendData = useMemo(
    () =>
      activityMockData.map((d, idx) => {
        const base = Date.now() - 24 * 60 * 60 * 1000;
        const step = Math.floor((24 * 60 * 60 * 1000) / Math.max(1, activityMockData.length - 1));
        return { ts: base + idx * step, events: d.events, users: d.users, errors: d.errors, time: d.time };
      }),
    [],
  );

  // Subscribe to chart interaction bus for drilldown (Stage 1)
  useEffect(() => {
    const unsubscribe = chartBus.subscribe((evt: ChartInteractionPayload) => {
      if (evt.action === 'click') {
        const behavior = clickBehavior.getBehavior(evt.chartId);

        // Apply filter if needed
        if (behavior === 'filter' || behavior === 'both') {
          // Semantic mapping by chartId
          const cid = evt.chartId || '';
          if (cid === 'devices-bar' && evt.category) {
            addPropertyFilter({ key: 'device', operator: 'eq', value: String(evt.category) });
          } else if (cid === 'traffic-bar' && evt.category) {
            addPropertyFilter({ key: 'source', operator: 'eq', value: String(evt.category) });
          } else if (evt.category) {
            addPropertyFilter({ key: 'category', operator: 'eq', value: String(evt.category) });
          } else if (evt.series) {
            addPropertyFilter({ key: 'series', operator: 'eq', value: String(evt.series) });
          }
        }

        // Drilldown if needed
        if (behavior === 'drilldown' || behavior === 'both') {
          const title = `${evt.series ?? 'Series'}${evt.category ? ' • ' + evt.category : ''}`;
          setSelectedDrilldown({ title, payload: (evt as unknown) as Record<string, unknown> });
        }
      }
    });
    return () => unsubscribe();
  }, [chartBus, clickBehavior, addPropertyFilter]);

  // ── Users section state ──
  const [usersSearch, setUsersSearch] = useState("");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGraphLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/rest/users-graph?limit=650&fill_missing=true", { cache: "no-store" });
        const json = (await res.json()) as { data: GraphData };
        if (!cancelled) setGraph(json.data);
      } catch {
        if (!cancelled) setGraph({ nodes: [], links: [], categories: [] });
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = useMemo(() => {
    let list = usersMockData;
    if (usersSearch.trim()) {
      const s = usersSearch.trim().toLowerCase();
      list = list.filter((u) =>
        u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || u.role.toLowerCase().includes(s)
      );
    }
    return list;
  }, [usersSearch]);

  const handleDrillDown = useCallback((category: string, dataPoint: any) => {
    setSelectedDrilldown({
      title: `Details: ${category}`,
      payload: dataPoint ?? {},
    });
  }, []);

  const handleBarClick = useCallback((dataPoint: any) => {
    setSelectedDrilldown({
      title: `Details: ${String(dataPoint?.category ?? "")}`,
      payload: dataPoint ?? {},
    });
  }, []);

  const handleFiltersChange = useCallback((filters: any[]) => {
    setActiveFilters(filters);
  }, []);

  // Convert property filters to query params for funnel
  const propertyFilterParams = useMemo(() => {
    const params: Record<string, string> = {};
    propertyFilters.forEach((f) => {
      params[`prop_${f.key}`] = `${f.operator}:${f.value}`;
    });
    return params;
  }, [propertyFilters]);

  useEffect(() => {
    let cancelled = false;
    setFunnelLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (!cancelled) {
            const mockSteps = generateMockFunnel();
            setFunnel({
              steps: mockSteps.map((s, idx) => ({
                key: `step_${idx}`,
                name: s.name,
                value: s.value,
                conversionFromPrev: s.conversionFromPrev,
              })),
              period: "7d",
            });
            setFunnelIsDemoData(true);
          }
        } else {
          const params = new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
            ...propertyFilterParams,
          });
          const res = await fetch(`/api/rest/funnel?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) {
            setFunnel(json);
            setFunnelIsDemoData(json.is_demo_data || false);
          }
        }
      } catch {
        if (!cancelled) {
          setFunnel(null);
          setFunnelIsDemoData(false);
        }
      } finally {
        if (!cancelled) setFunnelLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange, propertyFilterParams, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setRetentionLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (!cancelled) {
            const rawMock = generateMockRetention(7);
            // Transform MockRetentionCohort to RetentionCell[]
            const transformed = rawMock.flatMap(cohort => {
              const baseUsers = cohort.cohort_size;
              return [
                { cohort: cohort.cohort_date, day: 0, retentionRate: 1.0, users: cohort.cohort_size },
                { cohort: cohort.cohort_date, day: 1, retentionRate: cohort.d1 / baseUsers, users: cohort.d1 },
                { cohort: cohort.cohort_date, day: 3, retentionRate: cohort.d3 / baseUsers, users: cohort.d3 },
                { cohort: cohort.cohort_date, day: 7, retentionRate: cohort.d7 / baseUsers, users: cohort.d7 },
                { cohort: cohort.cohort_date, day: 14, retentionRate: cohort.d14 / baseUsers, users: cohort.d14 },
                { cohort: cohort.cohort_date, day: 30, retentionRate: cohort.d30 / baseUsers, users: cohort.d30 },
              ];
            });
            setRetentionData(transformed);
          }
        } else {
          const params = new URLSearchParams({
            days: String(retentionDays),
            ...propertyFilterParams,
          });
          const res = await fetch(`/api/rest/retention?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) setRetentionData(Array.isArray(json.cohorts) ? json.cohorts : []);
        }
      } catch {
        if (!cancelled) setRetentionData([]);
      } finally {
        if (!cancelled) setRetentionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retentionDays, propertyFilterParams, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setUserFlowsLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          // Demo Mode: Use complex mock user flows
          await new Promise(resolve => setTimeout(resolve, 250));
          const mockFlows = generateMockComplexUserFlows({ maxNodes: 6, maxLinks: 10, throttle: true });
          if (!cancelled) setUserFlows(mockFlows);
        } else {
          // Live Mode: Fetch from API
          const params = new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
            minFlowCount: "5",
            ...propertyFilterParams,
          });
          const res = await fetch(`/api/rest/user-flows?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) setUserFlows(json);
        }
      } catch {
        if (!cancelled) setUserFlows(null);
      } finally {
        if (!cancelled) setUserFlowsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange, propertyFilterParams, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          // Demo Mode: Use mock data
          await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
          const mockData = generateMockTrend(14);
          if (!cancelled) {
            setTrendData(mockData.historical);
            setForecastData(mockData.forecast);
          }
        } else {
          // Live Mode: Fetch from API
          const params = new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
          });
          // Append property filters from current URL (prop_*)
          try {
            if (typeof window !== 'undefined') {
              const extra = new URLSearchParams(window.location.search);
              extra.forEach((v, k) => { if (k.startsWith('prop_')) params.set(k, v); });
            }
          } catch {}
          const res = await fetch(`/api/rest/analytics-trend?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          
          if (!cancelled) {
            if (json.historical && Array.isArray(json.historical)) {
              setTrendData(json.historical);
              setForecastData(json.forecast || []);
            } else if (Array.isArray(json)) {
              setTrendData(json);
              setForecastData([]);
            } else {
              setTrendData([]);
              setForecastData([]);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setTrendData([]);
          setForecastData([]);
        }
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setDevicesLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (!cancelled) setDevicesData(generateMockDevices());
        } else {
          const params = new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
          });
          try {
            if (typeof window !== 'undefined') {
              const extra = new URLSearchParams(window.location.search);
              extra.forEach((v, k) => { if (k.startsWith('prop_')) params.set(k, v); });
            }
          } catch {}
          const res = await fetch(`/api/rest/analytics-devices?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) setDevicesData(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        if (!cancelled) setDevicesData([]);
      } finally {
        if (!cancelled) setDevicesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setTrafficLoading(true);

    (async () => {
      try {
        if (isDemoMode) {
          await new Promise(resolve => setTimeout(resolve, 200));
          if (!cancelled) setTrafficSourcesData(generateMockTrafficSources());
        } else {
          const params = new URLSearchParams({
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
          });
          try {
            if (typeof window !== 'undefined') {
              const extra = new URLSearchParams(window.location.search);
              extra.forEach((v, k) => { if (k.startsWith('prop_')) params.set(k, v); });
            }
          } catch {}
          const res = await fetch(`/api/rest/analytics-traffic?${params.toString()}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) setTrafficSourcesData(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        if (!cancelled) setTrafficSourcesData([]);
      } finally {
        if (!cancelled) setTrafficLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateRange, isDemoMode]);

  const trendChartData = useMemo(() => {
    return trendData.map((d) => ({
      date: new Date(d.ts).toLocaleDateString(),
      revenue: d.revenue,
      users: d.users,
      sessions: d.sessions,
      conversion: d.conversion,
    }));
  }, [trendData]);

  const devicesChartData = useMemo(() => {
    return devicesData.map((d) => ({
      category: d.device || d.category || "Unknown",
      value: d.count || d.value || 0,
      revenue: d.revenue || 0,
    }));
  }, [devicesData]);

  const trafficChartData = useMemo(() => {
    return trafficSourcesData.map((d) => ({
      category: d.source || d.category || "Unknown",
      value: d.count || d.value || 0,
      conversion: d.conversion || 0,
      revenue: d.revenue || 0,
    }));
  }, [trafficSourcesData]);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="relative min-h-screen bg-slate-950 overflow-hidden">
        {/* Динамический градиент в стиле нефтяного пятна */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 animate-pulse" />
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 via-purple-950 to-slate-900 opacity-60 animate-pulse" style={{ animationDelay: '3s', animationDuration: '12s' }} />
          <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-amber-950/20 to-orange-950/10 rounded-full blur-[150px] opacity-30 animate-blob" />
          <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-rose-950/20 to-pink-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-gradient-to-tr from-violet-950/20 to-purple-950/10 rounded-full blur-[150px] opacity-30 animate-blob" style={{ animationDelay: '4s' }} />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-teal-950/15 to-cyan-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '6s' }} />
          <div className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] bg-gradient-to-tl from-indigo-950/15 to-blue-950/8 rounded-full blur-[150px] opacity-25 animate-blob" style={{ animationDelay: '8s' }} />
          <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gradient-to-r from-emerald-950/10 to-teal-950/5 rounded-full blur-[120px] opacity-20 animate-blob" style={{ animationDelay: '10s' }} />
        </div>

        <div className="relative z-10">
          <div className="p-8 space-y-8">
            {/* Page Header */}
            <div id="analytics-top" className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl border border-blue-400/20">
                  <BarChart3Icon className="h-8 w-8 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">Analytics Overview</h1>
                  <p className="text-slate-300 mt-2">Deep dive into your performance metrics and trends</p>
                </div>
              </div>
            </div>

            {/* Filters & Controls */}
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8 space-y-3">
              {/* Row 1: Period + Property Filter */}
              <div className="flex flex-wrap items-end gap-3">
                {/* Period Switcher */}
                <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
                  {([
                    { key: "24h", label: "24h" },
                    { key: "7d", label: "7d" },
                    { key: "30d", label: "30d" },
                  ] as const).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setFunnelPeriod(p.key)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        funnelPeriod === p.key
                          ? "bg-lime-400/15 text-lime-400"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-white/10 hidden md:block" />

                {/* Property Filter inline */}
                <div className="flex-1 min-w-[200px]">
                  <PropertyFilter
                    value={propertyFilters}
                    onChange={setPropertyFilters}
                    placeholder="Filter by properties"
                    className={propertyFilters.length > 0 ? "ring-1 ring-lime-400/50" : ""}
                  />
                </div>
              </div>

              {/* Row 2: Advanced Filters (collapsible) */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-white transition-colors select-none">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Advanced Filters</span>
                  {activeFilters.filter((f: any) => f.value !== undefined && f.value !== "").length > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                      {activeFilters.filter((f: any) => f.value !== undefined && f.value !== "").length}
                    </span>
                  )}
                </summary>
                <div className="pt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {filterOptions.map((filter) => (
                    <div key={filter.id} className="space-y-1">
                      <label className="text-xs text-slate-400">{filter.label}</label>
                      {filter.type === "select" && (
                        <select
                          value={activeFilters.find((f: any) => f.id === filter.id)?.value || ""}
                          onChange={(e) => {
                            const updated = activeFilters.map((f: any) =>
                              f.id === filter.id ? { ...f, value: e.target.value || undefined } : f
                            );
                            handleFiltersChange(updated);
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400/50"
                        >
                          <option value="" className="bg-slate-800">All</option>
                          {filter.options?.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {filter.type === "multiselect" && (
                        <div className="flex flex-wrap gap-1.5">
                          {filter.options?.map((opt) => {
                            const current = activeFilters.find((f: any) => f.id === filter.id);
                            const selected = Array.isArray(current?.value) && current.value.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  const currentVals = Array.isArray(current?.value) ? current.value : [];
                                  const newVals = selected
                                    ? currentVals.filter((v: string) => v !== opt.value)
                                    : [...currentVals, opt.value];
                                  const updated = activeFilters.map((f: any) =>
                                    f.id === filter.id ? { ...f, value: newVals.length > 0 ? newVals : undefined } : f
                                  );
                                  handleFiltersChange(updated);
                                }}
                                className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                                  selected
                                    ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="w-full h-32">
                <ChartPreview chartName="Total Users" chartType="metric" />
              </div>
              <div className="w-full h-32">
                <ChartPreview chartName="New Users" chartType="metric" />
              </div>
              <div className="w-full h-32">
                <ChartPreview chartName="Active Users" chartType="metric" />
              </div>
              <div className="w-full h-32">
                <ChartPreview chartName="Churned Users" chartType="metric" />
              </div>
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm">Conversion Rate</Text>
                <Metric className="text-white">3.24%</Metric>
                <Text className="text-emerald-400 text-sm">+0.8%</Text>
              </div>
              <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm">Bounce Rate</Text>
                <Metric className="text-white">42.1%</Metric>
                <Text className="text-amber-400 text-sm">-2.3%</Text>
              </div>
              <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm">Avg Session Duration</Text>
                <Metric className="text-white">4m 32s</Metric>
                <Text className="text-blue-400 text-sm">+18s</Text>
              </div>
              <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                <Text className="text-slate-300 text-sm">Pages per Session</Text>
                <Metric className="text-white">3.8</Metric>
                <Text className="text-purple-400 text-sm">+0.2</Text>
              </div>
            </div>

            {/* Retention Matrix */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
              <LazyMount
                className="w-full"
                fallback={<div className="h-[600px] rounded-xl bg-white/5 border border-white/10" />}
              >
                <RetentionMatrix
                  data={retentionData}
                  loading={retentionLoading}
                  days={retentionDays}
                  onDaysChange={setRetentionDays}
                />
              </LazyMount>
            </Card>

            {/* Interactive Charts */}
            <Grid numItems={1} numItemsLg={2} className="gap-6">
              {/* Cyber Funnel */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">CyberFunnel</Title>
                      <Text className="text-slate-300 mt-1">Holographic funnel with AI annotations</Text>
                    </div>
                    <ChartMenu data={funnel?.steps ?? []} filename={`cyber_funnel_${funnelPeriod}`} chartType="funnel" onConfigOpen={() => handleOpenConfig('funnel', 'CyberFunnel')} onAIOpen={() => handleOpenAIAssistant('funnel', 'CyberFunnel')} />
                  </div>
                </div>

                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[420px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  <div className="rounded-2xl overflow-hidden border border-white/10">
                    <CyberFunnelModule
                      steps={funnel?.steps ?? []}
                      height={420}
                      isDemoData={funnelIsDemoData}
                    />
                    {funnelLoading && <div className="h-[420px] -mt-[420px] bg-white/5" />}
                  </div>
                </LazyMount>
              </Card>

              {/* Interactive Revenue & Users Trend */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8 overflow-hidden">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">Revenue & Users Trend</Title>
                      <Text className="text-slate-300 mt-1">Monthly revenue and user growth with conversion rates</Text>
                    </div>
                    <ChartMenu data={trendData} filename="analytics_trend" chartType="uplot" onConfigOpen={() => handleOpenConfig('uplot', 'Revenue & Users Trend')} onAIOpen={() => handleOpenAIAssistant('uplot', 'Revenue & Users Trend')} />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  {trendLoading ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">Loading trend data...</div>
                  ) : trendData.length === 0 ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">No trend data available</div>
                  ) : (
                    <TrendChartModule
                      data={trendData}
                      xKey="ts"
                      height={360}
                      forecast={forecastData}
                      series={[
                        { key: "revenue", name: "Revenue", stroke: "#10b981", forecastKey: "revenue_forecast" },
                        { key: "users", name: "Users", stroke: "#3b82f6", forecastKey: "users_forecast" },
                        { key: "conversion", name: "Conversion", stroke: "#f59e0b" },
                      ]}
                      onPointClick={(payload) => handleDrillDown("Trend", payload)}
                      chartId="revenue-users-trend"
                      groupId="analytics-main"
                    />
                  )}
                </LazyMount>
              </Card>

              {/* Interactive Device Categories */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">Device Performance</Title>
                      <Text className="text-slate-300 mt-1">User distribution and revenue by device type</Text>
                    </div>
                    <ChartMenu data={devicesChartData} filename="analytics_devices" chartType="echarts" onConfigOpen={() => handleOpenConfig('echarts', 'Device Performance')} onAIOpen={() => handleOpenAIAssistant('echarts', 'Device Performance')} />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  {devicesLoading ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">Loading devices data...</div>
                  ) : devicesChartData.length === 0 ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">No devices data available</div>
                  ) : (
                    <BarChartModule
                      data={devicesChartData}
                      index="category"
                      valueKey="value"
                      height={360}
                      color="#a78bfa"
                      onBarClick={(payload) => handleBarClick(payload)}
                      chartId="devices-bar"
                      groupId="analytics-main"
                    />
                  )}
                </LazyMount>
              </Card>

              {/* Interactive Traffic Sources */}
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">Traffic Sources Analysis</Title>
                      <Text className="text-slate-300 mt-1">Visitor sources with conversion rates and revenue</Text>
                    </div>
                    <ChartMenu data={trafficChartData} filename="analytics_traffic" chartType="echarts" onConfigOpen={() => handleOpenConfig('echarts', 'Traffic Sources')} onAIOpen={() => handleOpenAIAssistant('echarts', 'Traffic Sources')} />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  {trafficLoading ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">Loading traffic data...</div>
                  ) : trafficChartData.length === 0 ? (
                    <div className="h-[360px] flex items-center justify-center text-slate-400">No traffic data available</div>
                  ) : (
                    <BarChartModule
                      data={trafficChartData}
                      index="category"
                      valueKey="value"
                      height={360}
                      color="#3b82f6"
                      onBarClick={(payload) => handleBarClick(payload)}
                      chartId="traffic-bar"
                      groupId="analytics-main"
                    />
                  )}
                </LazyMount>
              </Card>

              {/* User Flows (Sankey Diagram) */}
              <div className="col-span-full">
                <UserFlowModule data={userFlows} loading={userFlowsLoading} height={500} />
              </div>

            </Grid>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* ══ ACTIVITY SECTION ══ */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div id="activity-section" className="pt-4">
              <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-orange-500/20 to-orange-600/20 rounded-2xl border border-orange-400/20">
                    <ActivityIcon className="h-8 w-8 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-white">Activity Monitor</h2>
                    <p className="text-slate-300 mt-2">Real-time user activity and system performance</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-time Metrics */}
            <RealTimeMetrics />

            {/* Activity Metrics */}
            <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-6">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
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
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
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
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
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
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
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

            {/* Activity Charts */}
            <Grid numItems={1} numItemsLg={2} className="gap-6">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8 overflow-hidden">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">24 Hour Activity</Title>
                      <Text className="text-slate-300 mt-1">Events, users and errors throughout the day</Text>
                    </div>
                    <ChartMenu data={activityTrendData} filename="activity_trend" chartType="uplot" onConfigOpen={() => handleOpenConfig('uplot', '24 Hour Activity')} onAIOpen={() => handleOpenAIAssistant('uplot', '24 Hour Activity')} />
                  </div>
                </div>
                <LazyMount
                  className="w-full"
                  fallback={<div className="h-[360px] rounded-xl bg-white/5 border border-white/10" />}
                >
                  <TrendChartModule
                    data={activityTrendData}
                    xKey="ts"
                    height={360}
                    series={[
                      { key: "events", name: "Events", stroke: "#f97316" },
                      { key: "users", name: "Users", stroke: "#3b82f6" },
                      { key: "errors", name: "Errors", stroke: "#ef4444" },
                    ]}
                    onPointClick={(payload: any) => handleDrillDown("Activity", payload)}
                    chartId="activity-trend"
                    groupId="activity"
                  />
                </LazyMount>
              </Card>

              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Title className="text-white text-xl">Event Types Distribution</Title>
                      <Text className="text-slate-300 mt-1">Breakdown of user interactions by type</Text>
                    </div>
                    <ChartMenu data={eventTypeData} filename="activity_event_types" chartType="echarts" onConfigOpen={() => handleOpenConfig('echarts', 'Event Types')} onAIOpen={() => handleOpenAIAssistant('echarts', 'Event Types')} />
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
                    onBarClick={(payload: any) => handleBarClick(payload)}
                    chartId="activity-event-types"
                    groupId="activity"
                  />
                </LazyMount>
              </Card>
            </Grid>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* ══ USERS SECTION ══ */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div id="users-section" className="pt-4">
              <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-2xl border border-emerald-400/20">
                    <UsersIcon className="h-8 w-8 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-white">User Management</h2>
                    <p className="text-slate-300 mt-2">Monitor and manage your user base</p>
                  </div>
                </div>
              </div>
            </div>

            {/* User Stats */}
            <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-6">
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-xl border border-emerald-400/20">
                    <UsersIcon className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Total Users</Text>
                    <p className="text-2xl font-bold text-white">12,456</p>
                    <Text className="text-emerald-400 text-sm">+8.2%</Text>
                  </div>
                </div>
              </Card>
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl border border-blue-400/20">
                    <UserPlusIcon className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">New Users</Text>
                    <p className="text-2xl font-bold text-white">+342</p>
                    <Text className="text-blue-400 text-sm">This week</Text>
                  </div>
                </div>
              </Card>
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-xl border border-purple-400/20">
                    <UserCheckIcon className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Active Users</Text>
                    <p className="text-2xl font-bold text-white">8,234</p>
                    <Text className="text-purple-400 text-sm">66.1%</Text>
                  </div>
                </div>
              </Card>
              <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/20 rounded-xl border border-amber-400/20">
                    <UserXIcon className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <Text className="text-slate-300 text-sm">Churned Users</Text>
                    <p className="text-2xl font-bold text-white">89</p>
                    <Text className="text-amber-400 text-sm">-2.1%</Text>
                  </div>
                </div>
              </Card>
            </Grid>

            {/* Users Search + Export */}
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div className="flex-1">
                  <input
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Search users by name, email, role..."
                    className="w-full bg-white/10 text-white border border-white/20 rounded-xl px-4 py-2 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ChartMenu data={filteredUsers} filename={`users_${new Date().toISOString().split("T")[0]}`} chartType="echarts" onConfigOpen={() => handleOpenConfig('echarts', 'Users Table')} onAIOpen={() => handleOpenAIAssistant('echarts', 'Users Table')} />
                </div>
              </div>
            </div>

            {/* User Constellation */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="mb-4">
                <Title className="text-white text-xl">User Constellation</Title>
                <Text className="text-slate-300 mt-1">Graph view (Canvas). Hover to see connections.</Text>
              </div>
              <div className="rounded-2xl overflow-hidden border border-white/10">
                <UserConstellation
                  data={graph}
                  height={520}
                  onNodeClick={() => {}}
                />
                {graphLoading && <div className="h-[520px] -mt-[520px] bg-white/5" />}
              </div>
            </Card>

            {/* Users Table */}
            <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="mb-6">
                <Title className="text-white text-xl">Recent Users</Title>
                <Text className="text-slate-300 mt-1">Latest user activity and engagement</Text>
              </div>
              <VirtualizedTable
                items={filteredUsers}
                height={420}
                colSpan={6}
                estimateRowHeight={56}
                renderHeader={
                  <TableRow>
                    <TableHeaderCell className="text-slate-300">User</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Role</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Status</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Last Active</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Sessions</TableHeaderCell>
                    <TableHeaderCell className="text-slate-300">Revenue</TableHeaderCell>
                  </TableRow>
                }
                renderRow={(user) => (
                  <TableRow
                    key={user.id}
                    className="border-white/10 hover:bg-white/5 cursor-pointer"
                  >
                    <TableCell>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-slate-400 text-sm">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={user.role === "Admin" ? "red" : user.role === "Premium" ? "purple" : "blue"}
                        className="text-xs"
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge color={user.status === "Active" ? "emerald" : "slate"} className="text-xs">
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{user.lastActive}</TableCell>
                    <TableCell className="text-white">{user.sessions}</TableCell>
                    <TableCell className="text-emerald-400 font-medium">{user.revenue}</TableCell>
                  </TableRow>
                )}
              />
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

      {/* Chart Config Modal */}
      {configModalOpen && configModalData && (
        <ChartConfigModal
          isOpen={configModalOpen}
          onClose={() => setConfigModalOpen(false)}
          chartType={configModalData.chartType}
          chartName={configModalData.chartName}
          currentConfig={configModalData.currentConfig}
          onSave={handleSaveConfig}
        />
      )}

      {/* AI Chart Assistant */}
      {aiAssistantOpen && aiAssistantData && (
        <AIChartAssistant
          isOpen={aiAssistantOpen}
          onClose={() => setAiAssistantOpen(false)}
          chartType={aiAssistantData.chartType}
          chartName={aiAssistantData.chartName}
        />
      )}
    </RequireRole>
  );
}

export default function AnalyticsPage() {
  return (
    <GlobalFiltersProvider>
      <AnalyticsContent />
    </GlobalFiltersProvider>
  );
}
