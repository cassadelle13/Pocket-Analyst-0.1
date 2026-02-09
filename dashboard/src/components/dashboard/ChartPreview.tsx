"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Title, Metric, Text } from "@tremor/react";
import BaseChart from "../charts/BaseChart";
import { useGlobalFilters } from "../../store/globalFiltersContext";
import { RealTimeMetrics } from "../charts/RealTimeMetrics";
import { useTheme } from '@/context/ThemeContext';

// Динамические импорты оригинальных компонентов
const UPlotTrendModule = dynamic(() => import("../analytics/UPlotTrendModule"), { ssr: false });
const BarChartModule = dynamic(() => import("../analytics/BarChartModule"), { ssr: false });
const PulseGlobe = dynamic(() => import("../home/PulseGlobe"), { ssr: false });
const UserConstellation = dynamic(() => import("../users/UserConstellation"), { ssr: false });


interface ChartPreviewProps {
  chartName: string;
  chartType: string;
  width?: number;
  height?: number;
  chartId?: string;
  groupId?: string;
}

// Mock данные для графиков (точно как в оригинальных страницах)
// Revenue & Users Trend - данные за последние 14 дней
const mockTrendData = Array.from({ length: 14 }, (_, i) => {
  const daysAgo = 13 - i;
  const ts = Date.now() - daysAgo * 24 * 3600000;
  return {
    ts,
    revenue: 45000 + Math.random() * 15000 + Math.sin(i * 0.5) * 8000,
    users: 2500 + Math.random() * 800 + Math.sin(i * 0.4) * 400,
    conversion: 2.5 + Math.random() * 1.5 + Math.sin(i * 0.3) * 0.5,
  };
});

// Forecast данные на следующие 7 дней
const mockForecastData = Array.from({ length: 7 }, (_, i) => {
  const ts = Date.now() + (i + 1) * 24 * 3600000;
  return {
    ts,
    revenue_forecast: 52000 + Math.random() * 8000 + i * 1000,
    users_forecast: 2800 + Math.random() * 400 + i * 50,
    conversion_forecast: 3.2 + Math.random() * 0.8,
  };
});

// Activity data для других графиков
const mockActivityData = [
  { ts: Date.now() - 6 * 3600000, events: 120, users: 45 },
  { ts: Date.now() - 5 * 3600000, events: 180, users: 67 },
  { ts: Date.now() - 4 * 3600000, events: 150, users: 54 },
  { ts: Date.now() - 3 * 3600000, events: 220, users: 89 },
  { ts: Date.now() - 2 * 3600000, events: 190, users: 72 },
  { ts: Date.now() - 1 * 3600000, events: 240, users: 95 },
  { ts: Date.now(), events: 210, users: 81 },
];

const mockBarData = [
  { category: "Direct", value: 456 },
  { category: "Organic", value: 351 },
  { category: "Social", value: 271 },
  { category: "Referral", value: 191 },
];

const mockAreaData = [
  { date: "Jan 30", value: 120 },
  { date: "Jan 31", value: 180 },
  { date: "Feb 1", value: 150 },
  { date: "Feb 2", value: 220 },
  { date: "Feb 3", value: 190 },
  { date: "Feb 4", value: 240 },
  { date: "Feb 5", value: 210 },
];

const mockDonutData = [
  { name: "Desktop", value: 1230 },
  { name: "Mobile", value: 751 },
  { name: "Tablet", value: 453 },
];

const mockBarListData = [
  { name: "page_view", value: 3420 },
  { name: "click", value: 2156 },
  { name: "form_submit", value: 892 },
  { name: "download", value: 445 },
];

export function ChartPreview({ chartName, chartType, width = 560, height = 360, chartId, groupId }: ChartPreviewProps) {
  const { addPropertyFilter, dateRange, propertyFilters } = useGlobalFilters();
  const { theme } = useTheme();
  const [apiLineData, setApiLineData] = useState<Array<{ ts: number; v: number }> | null>(null);
  const [apiBarCatData, setApiBarCatData] = useState<Array<{ category: string; value: number }> | null>(null);
  const [tableSort, setTableSort] = useState<{ key: 'name' | 'value' | 'trend'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });

  // Fetch for Line (time series)
  useEffect(() => {
    if (!chartName.includes("Line (time series)")) return;
    try {
      const sp = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
      });
      for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
      fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((rows: any[]) => {
          if (!Array.isArray(rows) || rows.length === 0) return;
          setApiLineData(
            rows.map((r) => ({ ts: Number(r.ts ?? 0), v: Number(r.events ?? 0) }))
          );
        })
        .catch(() => {});
    } catch {}
  }, [chartName, dateRange.start, dateRange.end, propertyFilters]);

  // Fetch for Bar (categorical)
  useEffect(() => {
    if (!chartName.includes("Bar (categorical)")) return;
    try {
      const sp = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
      });
      for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
      fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((rows: any[]) => {
          if (!Array.isArray(rows) || rows.length === 0) return;
          setApiBarCatData(
            rows.map((r) => ({ category: String(r.category ?? ""), value: Number(r.value ?? 0) }))
          );
        })
        .catch(() => {});
    } catch {}
  }, [chartName, dateRange.start, dateRange.end, propertyFilters]);
  // Generic: Line (time series)
  if (chartName.includes("Line (time series)")) {
    const data = apiLineData ?? Array.from({ length: 24 }, (_, i) => ({ ts: Date.now() - (23 - i) * 3600_000, v: 100 + Math.sin(i / 3) * 20 + Math.random() * 10 }));
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <UPlotTrendModule
          data={data}
          xKey="ts"
          series={[{ key: "v", name: "Value", stroke: theme === 'dark' ? "#10b981" : "#000" }]}
          height={Math.max(120, height - 8)}
          chartId={chartId}
          groupId={groupId}
        />
      </div>
    );
  }

  // Grouped bar
  if (chartName.includes("Grouped bar")) {
    const cats = ["A", "B", "C", "D"];
    const series1 = [320, 240, 180, 120];
    const series2 = [260, 200, 150, 100];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value' },
      series: [
        { name: 'Series 1', type: 'bar', data: series1, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
        { name: 'Series 2', type: 'bar', data: series2, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              chart.off?.('click');
              chart.on?.('click', (params: any) => {
                const name = String(params?.name ?? "");
                if (name) addPropertyFilter({ key: 'category', operator: 'eq', value: name });
              });

              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const cats = rows.map(r => String(r.category ?? ''));
                  const v = rows.map(r => Number(r.value ?? 0));
                  const rev = rows.map(r => Number(r.revenue ?? 0));
                  chart.setOption({
                    xAxis: { data: cats },
                    series: [
                      { name: 'Events', type: 'bar', data: v, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
                      { name: 'Revenue', type: 'bar', data: rev, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
                    ],
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Stacked bar
  if (chartName.includes("Stacked bar")) {
    const cats = ["A", "B", "C", "D"];
    const series1 = [120, 132, 101, 134];
    const series2 = [220, 182, 191, 234];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value' },
      series: [
        { name: 'Series 1', type: 'bar', stack: 'total', data: series1, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
        { name: 'Series 2', type: 'bar', stack: 'total', data: series2, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              chart.off?.('click');
              chart.on?.('click', (params: any) => {
                const name = String(params?.name ?? "");
                if (name) addPropertyFilter({ key: 'category', operator: 'eq', value: name });
              });
              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const cats = rows.map(r => String(r.category ?? ''));
                  const v = rows.map(r => Number(r.value ?? 0));
                  const rev = rows.map(r => Number(r.revenue ?? 0));
                  chart.setOption({
                    xAxis: { data: cats },
                    series: [
                      { name: 'Events', type: 'bar', stack: 'total', data: v, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
                      { name: 'Revenue', type: 'bar', stack: 'total', data: rev, barMaxWidth: 26, itemStyle: { borderRadius: [6,6,0,0] } },
                    ],
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Area (накопление)
  if (chartName.includes("Area") && chartName.includes("накоп")) {
    const x = Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600_000));
    const y = x.map((_, i) => Math.round(80 + i * 4 + Math.sin(i / 2) * 10));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x.map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Value', data: y, smooth: true, areaStyle: {}, showSymbol: false },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const xs = rows.map(r => new Date(Number(r.ts))).map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  const ev = rows.map(r => Number(r.events ?? 0));
                  chart.setOption({
                    xAxis: { data: xs },
                    series: [{ type: 'line', name: 'Events', data: ev, smooth: true, areaStyle: {}, showSymbol: false }],
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Stacked area
  if (chartName.includes("Stacked area")) {
    const x = Array.from({ length: 24 }, (_, i) => new Date(Date.now() - (23 - i) * 3600_000));
    const s1 = x.map((_, i) => Math.round(40 + i * 2 + Math.sin(i / 2) * 6));
    const s2 = x.map((_, i) => Math.round(30 + i * 1.5 + Math.cos(i / 3) * 5));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x.map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'S1', data: s1, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
        { type: 'line', name: 'S2', data: s2, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const xs = rows.map(r => new Date(Number(r.ts))).map(d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                  const s1 = rows.map(r => Number(r.events ?? 0));
                  const s2 = rows.map(r => Number(r.users ?? 0));
                  chart.setOption({
                    xAxis: { data: xs },
                    series: [
                      { type: 'line', name: 'Events', data: s1, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
                      { type: 'line', name: 'Users', data: s2, smooth: true, areaStyle: {}, showSymbol: false, stack: 'total' },
                    ],
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Multi-line (несколько метрик)
  if (chartName.includes("Multi-line")) {
    const x = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 24 * 3600_000).toLocaleDateString([], { month: 'short', day: '2-digit' }));
    const s1 = x.map((_, i) => Math.round(80 + Math.sin(i / 2) * 15 + Math.random() * 10));
    const s2 = x.map((_, i) => Math.round(60 + Math.cos(i / 3) * 12 + Math.random() * 8));
    const s3 = x.map((_, i) => Math.round(40 + Math.sin(i / 4) * 10 + Math.random() * 6));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Metric A', data: s1, smooth: true, showSymbol: false },
        { type: 'line', name: 'Metric B', data: s2, smooth: true, showSymbol: false },
        { type: 'line', name: 'Metric C', data: s3, smooth: true, showSymbol: false },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Rolling average
  if (chartName.includes("Rolling average")) {
    const x = Array.from({ length: 30 }, (_, i) => i + 1);
    const raw = x.map((i) => Math.round(100 + Math.sin(i / 3) * 20 + Math.random() * 10));
    const ma = raw.map((_, idx, arr) => {
      const start = Math.max(0, idx - 6);
      const slice = arr.slice(start, idx + 1);
      return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
    });
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x.map(String) },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Raw', data: raw, smooth: true, showSymbol: false, lineStyle: { opacity: 0.4 } },
        { type: 'line', name: 'MA(7)', data: ma, smooth: true, showSymbol: false },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Period-over-period comparison (WoW/MoM)
  if (chartName.includes("Period-over-period")) {
    const x = Array.from({ length: 14 }, (_, i) => `D${i + 1}`);
    const current = x.map((_, i) => Math.round(120 + Math.sin(i / 2) * 12 + Math.random() * 8));
    const prior = x.map((_, i) => Math.round(100 + Math.sin(i / 2) * 10 + Math.random() * 6));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Current', data: current, smooth: true, showSymbol: false },
        { type: 'line', name: 'Prior', data: prior, smooth: true, showSymbol: false, lineStyle: { type: 'dashed', opacity: 0.7 } },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Cumulative growth
  if (chartName.includes("Cumulative growth")) {
    const x = Array.from({ length: 20 }, (_, i) => i + 1);
    const inc = x.map(() => Math.max(1, Math.round(5 + Math.random() * 8)));
    const cum = inc.reduce<number[]>((arr, v) => { arr.push((arr.at(-1) ?? 0) + v); return arr; }, []);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x.map(String) },
      yAxis: { type: 'value' },
      series: [ { type: 'line', name: 'Cumulative', data: cum, smooth: true, areaStyle: {}, showSymbol: false } ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Rank / Top-N
  if (chartName.includes("Rank") || chartName.includes("Top-N")) {
    const cats = ["Alpha","Beta","Gamma","Delta","Epsilon","Zeta"].slice(0, 6);
    const vals = cats.map((_, i) => Math.round(500 - i * 60 + Math.random() * 20));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 24, top: 16, bottom: 16, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: cats, inverse: true },
      series: [ { type: 'bar', data: vals, barMaxWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } } ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Bottom-N
  if (chartName.includes("Bottom-N")) {
    const cats = ["Alpha","Beta","Gamma","Delta","Epsilon","Zeta"].slice(0, 6).reverse();
    const vals = cats.map((_, i) => Math.round(50 + i * 20 + Math.random() * 10));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 24, top: 16, bottom: 16, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: cats, inverse: true },
      series: [ { type: 'bar', data: vals, barMaxWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } } ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Side-by-side comparison
  if (chartName.includes("Side-by-side")) {
    const cats = ["A","B","C","D","E"];
    const a = cats.map(() => Math.round(100 + Math.random() * 80));
    const b = cats.map(() => Math.round(90 + Math.random() * 80));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value' },
      series: [
        { type: 'bar', name: 'A', data: a, barMaxWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } },
        { type: 'bar', name: 'B', data: b, barMaxWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // 100% stacked bar
  if (chartName.includes("100% stacked bar")) {
    const cats = ["A","B","C","D"];
    const s1 = cats.map(() => Math.round(20 + Math.random() * 50));
    const s2 = cats.map(() => Math.round(20 + Math.random() * 50));
    const total = s1.map((v, i) => v + s2[i]);
    const p1 = s1.map((v, i) => Math.round((v / total[i]) * 100));
    const p2 = s2.map((v, i) => 100 - p1[i]);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => `${p[0].name}<br/>${p[0].seriesName}: ${p[0].value}%<br/>${p[1].seriesName}: ${p[1].value}%` },
      legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value', max: 100 },
      series: [
        { type: 'bar', name: 'Part A', stack: 'pct', data: p1, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
        { type: 'bar', name: 'Part B', stack: 'pct', data: p2, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Treemap
  if (chartName.includes("Treemap")) {
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { formatter: '{b}: {c}' },
      series: [
        {
          type: 'treemap',
          breadcrumb: { show: false },
          roam: false,
          label: { show: true, formatter: '{b}' },
          data: [
            { name: 'A', value: 540 },
            { name: 'B', value: 320 },
            { name: 'C', value: 210 },
            { name: 'D', value: 150 },
          ],
        },
      ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Hierarchical breakdown (Sunburst-like using Treemap levels)
  if (chartName.includes("Hierarchical breakdown")) {
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { formatter: '{b}: {c}' },
      series: [
        {
          type: 'treemap',
          breadcrumb: { show: false },
          roam: false,
          label: { show: true },
          data: [
            { name: 'Group A', value: 600, children: [ { name: 'A1', value: 320 }, { name: 'A2', value: 280 } ] },
            { name: 'Group B', value: 400, children: [ { name: 'B1', value: 250 }, { name: 'B2', value: 150 } ] },
          ],
        },
      ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Histogram
  if (chartName.includes("Histogram")) {
    const bins = Array.from({ length: 12 }, () => Math.round(20 + Math.random() * 80));
    const x = bins.map((_, i) => `${i * 10}-${(i + 1) * 10}`);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: { type: 'value' },
      series: [ { type: 'bar', data: bins, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } } ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Box plot
  if (chartName.includes("Box plot")) {
    // Data format: [min, Q1, median, Q3, max]
    const cats = ['A','B','C','D'];
    const data = cats.map(() => {
      const min = Math.round(20 + Math.random() * 10);
      const q1 = min + Math.round(10 + Math.random() * 10);
      const med = q1 + Math.round(5 + Math.random() * 10);
      const q3 = med + Math.round(5 + Math.random() * 10);
      const max = q3 + Math.round(10 + Math.random() * 10);
      return [min, q1, med, q3, max];
    });
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'item' },
      grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value' },
      series: [ { name: 'box', type: 'boxplot', data } ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Density plot (KDE-like)
  if (chartName.includes("Density plot")) {
    const x = Array.from({ length: 101 }, (_, i) => -3 + i * 0.06);
    const y = x.map((t) => Math.round(100 * Math.exp(-0.5 * t * t)) / 100);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x.map((v) => v.toFixed(2)) },
      yAxis: { type: 'value' },
      series: [ { type: 'line', data: y, areaStyle: {}, smooth: true, showSymbol: false } ],
    };
    return (
      <div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} /></div>
    );
  }

  // Outlier view (scatter with highlights)
  if (chartName.includes("Outlier")) {
    const points = Array.from({ length: 80 }, () => ({ x: Math.random() * 100, y: Math.random() * 100 }));
    const outliers = Array.from({ length: 5 }, () => ({ x: 20 + Math.random() * 10, y: 90 + Math.random() * 10 }));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'item' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'value' }, yAxis: { type: 'value' },
      series: [
        { type: 'scatter', name: 'Points', data: points.map(p => [Math.round(p.x), Math.round(p.y)]) },
        { type: 'scatter', name: 'Outliers', data: outliers.map(p => [Math.round(p.x), Math.round(p.y)]), itemStyle: { color: theme === 'dark' ? '#ef4444' : '#000' } },
      ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // KPI card / KPI with delta (styled tile)
  if (chartName.includes("KPI card") || chartName.includes("KPI with delta")) {
    const value = Math.floor(Math.random() * 10000 + 1000).toLocaleString();
    const delta = (Math.random() * 10 - 2).toFixed(1);
    const isNeg = Number(delta) < 0;
    return (
      <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/20 p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="p-2 bg-white/10 rounded-lg">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div className={`text-xs font-semibold ${isNeg ? 'text-amber-400' : 'text-emerald-400'} bg-white/10 px-2 py-1 rounded`}>{isNeg ? '' : '+'}{delta}%</div>
        </div>
        <div className="text-right">
          <Metric className="text-white text-2xl font-bold mb-1 leading-tight block">{value}</Metric>
          <Text className="text-slate-300 text-xs font-medium">{chartName}</Text>
        </div>
      </div>
    );
  }

  // Conversion rate (line %)
  if (chartName.includes("Conversion rate") && !chartName.includes("Card")) {
    const x = Array.from({ length: 14 }, (_, i) => `D${i + 1}`);
    const y = x.map((_, i) => Math.round((2 + Math.sin(i / 3) * 0.8 + Math.random() * 0.6) * 10) / 10);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x }, yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
      series: [ { type: 'line', name: 'CR', data: y, smooth: true, showSymbol: false } ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Scatter plot
  if (chartName.includes("Scatter plot") && !chartName.includes("regression")) {
    const pts = Array.from({ length: 100 }, () => [Math.round(50 + Math.random() * 50), Math.round(40 + Math.random() * 60)]);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'item' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [ { type: 'scatter', data: pts } ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Scatter + regression
  if (chartName.includes("Scatter + regression")) {
    const pts = Array.from({ length: 80 }, () => [Math.round(50 + Math.random() * 50), Math.round(30 + Math.random() * 70)]);
    // Simple linear fit mock: y = a + b*x
    const a = 10, b = 0.8;
    const line = Array.from({ length: 2 }, (_, i) => {
      const x = i === 0 ? 40 : 110; return [x, a + b * x];
    });
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'item' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'value' }, yAxis: { type: 'value' },
      series: [
        { type: 'scatter', name: 'Samples', data: pts },
        { type: 'line', name: 'Fit', data: line, showSymbol: false, lineStyle: { type: 'dashed' } },
      ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Correlation matrix (heatmap)
  if (chartName.includes("Correlation matrix")) {
    const vars = ['A','B','C','D','E'];
    const data: Array<[number, number, number]> = [];
    for (let i = 0; i < vars.length; i++) for (let j = 0; j < vars.length; j++) data.push([i, j, Math.round((i === j ? 1 : (Math.random() * 2 - 1)) * 100) / 100]);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { formatter: (p: any) => `${vars[p.data[1]]} vs ${vars[p.data[0]]}: ${p.data[2]}` },
      grid: { left: 60, right: 24, top: 24, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: vars }, yAxis: { type: 'category', data: vars },
      visualMap: { min: -1, max: 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 0 },
      series: [ { type: 'heatmap', data } ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(200, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Waterfall (contribution)
  if (chartName.includes("Waterfall")) {
    const cats = ['Start','A','B','C','D','End'];
    const changes = [0, 120, -40, 80, -20, 0];
    let sum = 300;
    const start = [sum];
    const up: number[] = []; const down: number[] = []; const totals: number[] = [];
    for (let i = 1; i < cats.length - 1; i++) {
      const ch = changes[i];
      if (ch >= 0) { up.push(ch); down.push('-' as any); } else { up.push('-' as any); down.push(-ch); }
      totals.push(sum); sum += ch;
    }
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true }, xAxis: { type: 'category', data: cats }, yAxis: { type: 'value' },
      series: [
        { type: 'bar', stack: 'total', data: [start[0], ...totals, '-'], itemStyle: { color: 'transparent' } },
        { type: 'bar', name: 'Increase', stack: 'total', data: ['-', ...up, '-'] },
        { type: 'bar', name: 'Decrease', stack: 'total', data: ['-', ...down, '-'] },
      ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Decomposition (drivers)
  if (chartName.includes("Decomposition")) {
    const cats = ['Price','Volume','Mix','Promo'];
    const p = cats.map(() => Math.round(40 + Math.random() * 60));
    const n = cats.map(() => -Math.round(Math.random() * 20));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 24, top: 28, bottom: 28, containLabel: true }, xAxis: { type: 'category', data: cats }, yAxis: { type: 'value' },
      series: [
        { type: 'bar', name: 'Positive', data: p, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
        { type: 'bar', name: 'Negative', data: n, barMaxWidth: 22, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Anomaly detection (time-based)
  if (chartName.includes("Anomaly detection")) {
    const x = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const base = x.map((_, i) => Math.round(100 + Math.sin(i / 3) * 20 + Math.random() * 10));
    const anomalies = [5, 17];
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x }, yAxis: { type: 'value' },
      series: [
        { type: 'line', name: 'Value', data: base, smooth: true, showSymbol: false },
        { type: 'scatter', name: 'Anomaly', data: anomalies.map(i => [x[i], base[i]]), itemStyle: { color: theme === 'dark' ? '#ef4444' : '#000' }, symbolSize: 10 },
      ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(160, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Cohort analysis (heatmap grid)
  if (chartName.includes("Cohort analysis")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }).map((_, i) => {
            const intensity = Math.random();
            const color = intensity > 0.7 ? 'bg-emerald-500/60' : intensity > 0.4 ? 'bg-emerald-500/40' : 'bg-emerald-500/20';
            return (<div key={i} className={`h-4 ${color} rounded border border-emerald-500/20`} />);
          })}
        </div>
      </div>
    );
  }

  // Retention curve
  if (chartName.includes("Retention curve")) {
    const x = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);
    const y = x.map((_, i) => Math.max(0, Math.round(100 * Math.exp(-i / 6))));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis' }, grid: { left: 40, right: 24, top: 20, bottom: 28, containLabel: true },
      xAxis: { type: 'category', data: x }, yAxis: { type: 'value', max: 100 },
      series: [ { type: 'line', name: 'Retention %', data: y, smooth: true, showSymbol: false } ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(140, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // Graphics / Diagrams generic blocks
  if (chartName === "Graphics" || chartName === "Diagrams") {
    const x = ['Q1','Q2','Q3','Q4'];
    const bar = x.map(() => Math.round(200 + Math.random() * 200));
    const line = x.map((_, i) => Math.round(50 + i * 20 + Math.random() * 10));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      grid: { left: 40, right: 40, top: 28, bottom: 28, containLabel: true }, xAxis: { type: 'category', data: x }, yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [ { type: 'bar', name: 'Volume', data: bar, yAxisIndex: 0, barMaxWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } }, { type: 'line', name: 'Index', data: line, yAxisIndex: 1, smooth: true, showSymbol: false } ],
    };
    return (<div className="w-full h-full p-2"><BaseChart option={option} height={Math.max(180, height - 8)} chartId={chartId} groupId={groupId} /></div>);
  }

  // KPI vs target (Bullet) / Bullet chart
  if (chartName.includes("Bullet chart") || chartName.includes("KPI vs target")) {
    // Single-category bullet: actual value bar with target markLine
    const actual = 78; // % of target, demo
    const target = 90;
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff', grid: { left: 60, right: 24, top: 28, bottom: 32, containLabel: true },
      xAxis: { type: 'value', max: 100, splitLine: { show: false } },
      yAxis: { type: 'category', data: ['KPI'], axisTick: { show: false } },
      series: [
        { type: 'bar', data: [actual], barWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } },
      ],
      markLine: {
        symbol: 'none',
        label: { formatter: `Target ${target}%`, position: 'end' },
        data: [{ xAxis: target }],
      },
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(120, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-trend?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const revs = rows.map(r => Number(r.revenue ?? 0)).filter((n: number) => Number.isFinite(n));
                  const last = revs.length ? revs[revs.length - 1] : 0;
                  const avg = revs.length ? (revs.reduce((a: number, b: number) => a + b, 0) / revs.length) : 0;
                  const actualPct = Math.max(0, Math.min(100, Math.round((avg > 0 ? (last / avg) * 100 : 0))));
                  const target = 90;
                  chart.setOption({
                    series: [{ type: 'bar', data: [actualPct], barWidth: 18, itemStyle: { borderRadius: [6,6,0,0] } }],
                    xAxis: { max: 100 },
                    markLine: { symbol: 'none', label: { formatter: `Target ${target}%`, position: 'end' }, data: [{ xAxis: target }] },
                  });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }

  // Pivot table / Drill-down table / Drill-through view / Filter panel — скелеты
  if (chartName.includes("Pivot table") || chartName.includes("Drill-down table") || chartName.includes("Drill-through view") || chartName.includes("Filter panel")) {
    return (
      <div className="w-full h-full p-4 bg-slate-950">
        {chartName.includes('Filter panel') ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input placeholder="Filter key" className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs border border-white/10 w-1/3" />
              <input placeholder="Value" className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs border border-white/10 w-1/3" />
              <button className="px-2 py-1 rounded bg-white/10 text-xs text-slate-100 border border-white/20">Apply</button>
            </div>
            <div className="text-xs text-slate-400">Interactive filter controls (demo)</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 pb-1 border-b border-white/10">
              <div className="h-3 bg-emerald-500/40 rounded w-1/4" />
              <div className="h-3 bg-blue-500/40 rounded w-1/4" />
              <div className="h-3 bg-purple-500/40 rounded w-1/4" />
              <div className="h-3 bg-cyan-500/40 rounded w-1/4" />
            </div>
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="h-2 bg-slate-700/50 rounded w-1/4" />
                <div className="h-2 bg-slate-700/40 rounded w-1/4" />
                <div className="h-2 bg-slate-700/40 rounded w-1/4" />
                <div className="h-2 bg-slate-700/30 rounded w-1/4" />
              </div>
            ))}
            <div className="text-xs text-slate-500">{chartName}</div>
          </div>
        )}
      </div>
    );
  }

  // Generic: Bar (categorical)
  if (chartName.includes("Bar (categorical)")) {
    const data = apiBarCatData ?? [
      { category: "A", value: 320 },
      { category: "B", value: 240 },
      { category: "C", value: 180 },
      { category: "D", value: 120 },
    ];
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <BarChartModule
          data={data}
          index="category"
          valueKey="value"
          height={Math.max(120, height - 8)}
          color={theme === 'dark' ? "#3b82f6" : "#000"}
          chartId={chartId}
          groupId={groupId}
          onBarClick={(row) => {
            const v = String((row as any)?.category ?? "");
            if (v) addPropertyFilter({ key: "category", operator: "eq", value: v });
          }}
        />
      </div>
    );
  }

  // Generic: Pie / Donut
  if (chartName.includes("Pie") || chartName.includes("Donut")) {
    const data = [
      { name: "Group A", value: 480 },
      { name: "Group B", value: 340 },
      { name: "Group C", value: 210 },
      { name: "Group D", value: 120 },
    ];
    const isDonut = chartName.toLowerCase().includes("donut");
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { 
        top: 0, 
        textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' }, 
        orient: 'horizontal',
        data: data.map(d => d.name)
      },
      series: [
        {
          name: 'Composition',
          type: 'pie',
          radius: isDonut ? ['50%', '70%'] : ['0%', '65%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          data: data.map(d => ({ name: d.name, value: d.value })),
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={option}
          height={Math.max(160, height - 8)}
          chartId={chartId}
          groupId={groupId}
          onReady={(chart: any) => {
            try {
              chart.off?.("click");
              chart.on?.("click", (params: any) => {
                const name = String(params?.name ?? "");
                if (name) addPropertyFilter({ key: "category", operator: "eq", value: name });
              });
              const sp = new URLSearchParams({
                startDate: dateRange.start.toISOString(),
                endDate: dateRange.end.toISOString(),
              });
              for (const f of propertyFilters) sp.set(`prop_${f.key}`, `${f.operator}:${f.value}`);
              fetch(`/api/rest/analytics-traffic?${sp.toString()}`, { cache: 'no-store' })
                .then(r => r.json())
                .then((rows: any[]) => {
                  if (!Array.isArray(rows) || rows.length === 0) return;
                  const sdata = rows.map(r => ({ name: String(r.category ?? ''), value: Number(r.value ?? 0) }));
                  chart.setOption({ series: [{ data: sdata }] });
                })
                .catch(() => {});
            } catch {}
          }}
        />
      </div>
    );
  }
  // Revenue & Users Trend — Diagram (Mixed bars + line, dual-axis)
  if (chartName.includes("Revenue") && chartName.includes("Users") && chartName.includes("Trend") && chartName.includes("Diagram")) {
    const xData = mockTrendData.map(d => new Date(d.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 40, top: 20, bottom: 24, containLabel: true },
      legend: { textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
      xAxis: { type: 'category', data: xData, axisLabel: { color: theme === 'dark' ? '#94a3b8' : '#000' }, axisLine: { lineStyle: { color: theme === 'dark' ? '#334155' : '#000' } } },
      yAxis: [
        { type: 'value', axisLabel: { color: theme === 'dark' ? '#94a3b8' : '#000' }, splitLine: { lineStyle: { color: theme === 'dark' ? '#1f2937' : '#000' } } },
        { type: 'value', axisLabel: { color: theme === 'dark' ? '#94a3b8' : '#000' }, splitLine: { show: false } },
      ],
      series: [
        { type: 'bar', name: 'Revenue', data: mockTrendData.map(d => Math.round(d.revenue)), yAxisIndex: 0, itemStyle: { color: theme === 'dark' ? '#10b981' : '#000', borderRadius: [6,6,0,0] } },
        { type: 'line', name: 'Users', data: mockTrendData.map(d => Math.round(d.users)), yAxisIndex: 1, smooth: true, lineStyle: { color: theme === 'dark' ? '#3b82f6' : '#000', width: 2 } },
      ],
    };

    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6 w-full h-full">
        <div className="mb-4">
          <Title className="text-white text-xl">Revenue & Users Trend</Title>
          <Text className="text-slate-300 mt-1">Monthly revenue and user growth with conversion rates</Text>
          <div className="mt-4 flex justify-end">
            <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-sm transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Export
            </button>
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <UPlotTrendModule
            data={mockTrendData}
            xKey="ts"
            series={[
              { key: "revenue", name: "Revenue", stroke: theme === 'dark' ? "#10b981" : "#000", forecastKey: "revenue_forecast" },
              { key: "users", name: "Users", stroke: theme === 'dark' ? "#3b82f6" : "#000", forecastKey: "users_forecast" },
              { key: "conversion", name: "Conversion", stroke: theme === 'dark' ? "#f59e0b" : "#000", forecastKey: "conversion_forecast" },
            ]}
            forecast={mockForecastData}
            height={360}
          />
        </div>
      </Card>
    );
  }

  // Trend Chart (uPlot) - для других графиков
  if (chartName.includes("Trend Chart")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <UPlotTrendModule
          data={mockActivityData}
          xKey="ts"
          series={[
            { key: "events", name: "Events", stroke: theme === 'dark' ? "#10b981" : "#000" },
            { key: "users", name: "Users", stroke: theme === 'dark' ? "#3b82f6" : "#000" },
          ]}
          height={136}
        />
      </div>
    );
  }

  // 24 Hour Activity - Точная копия из activity/page.tsx (адаптировано для рабочей области)
  if (chartName.includes("24 Hour Activity")) {
    // Точные данные из activity/page.tsx
    const activityData = [
      { time: "00:00", events: 120, users: 45, errors: 2 },
      { time: "04:00", events: 80, users: 25, errors: 1 },
      { time: "08:00", events: 340, users: 156, errors: 5 },
      { time: "12:00", events: 520, users: 234, errors: 8 },
      { time: "16:00", events: 480, users: 198, errors: 6 },
      { time: "20:00", events: 290, users: 123, errors: 3 },
      { time: "23:59", events: 150, users: 67, errors: 2 },
    ];

    // Точная трансформация данных из activity/page.tsx
    const activityTrendData = activityData.map((d, idx) => {
      const base = Date.now() - 24 * 60 * 60 * 1000;
      const step = Math.floor((24 * 60 * 60 * 1000) / Math.max(1, activityData.length - 1));
      return {
        ts: base + idx * step,
        events: d.events,
        users: d.users,
        errors: d.errors,
        time: d.time,
      };
    });

    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6 pb-3 w-full h-full flex flex-col">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <Title className="text-white text-lg">24 Hour Activity</Title>
            <Text className="text-slate-300 mt-1 text-sm">Events, users and errors throughout the day</Text>
          </div>
          <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-xs transition-colors flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <UPlotTrendModule
            data={activityTrendData}
            xKey="ts"
            height={360}
            series={[
              { key: "events", name: "Events", stroke: theme === 'dark' ? "#f97316" : "#000" },
              { key: "users", name: "Users", stroke: theme === 'dark' ? "#3b82f6" : "#000" },
              { key: "errors", name: "Errors", stroke: theme === 'dark' ? "#ef4444" : "#000" },
            ]}
          />
        </div>
      </Card>
    );
  }

  // Bar Chart Module (ECharts)
  if (chartName.includes("Bar Chart Module")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <BarChartModule
          data={mockBarData}
          index="category"
          valueKey="value"
          height={136}
          color={theme === 'dark' ? "#10b981" : "#000"}
        />
      </div>
    );
  }

  // Event Types Distribution - Точная копия из activity/page.tsx (адаптировано для рабочей области)
  if (chartName.includes("Event Types")) {
    // Точные данные из activity/page.tsx
    const eventTypeData = [
      { category: "Page Views", value: 3420 },
      { category: "Clicks", value: 2156 },
      { category: "Form Submits", value: 892 },
      { category: "Downloads", value: 445 },
      { category: "Signups", value: 234 },
      { category: "Searches", value: 389 },
      { category: "Shares", value: 156 },
    ];

    return (
      <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6 pb-3 w-full h-full flex flex-col">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <Title className="text-white text-lg">Event Types Distribution</Title>
            <Text className="text-slate-300 mt-1 text-sm">Breakdown of user interactions by type</Text>
          </div>
          <button className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 text-xs transition-colors flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <BarChartModule
            data={eventTypeData}
            index="category"
            valueKey="value"
            height={360}
            color={theme === 'dark' ? "#a78bfa" : "#000"}
          />
        </div>
      </Card>
    );
  }

  // Real-time Metrics
  if (chartName.includes("Real-time Metrics") || chartName.includes("Active Now")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Metric className="text-white text-2xl">{Math.floor(Math.random() * 1000 + 500)}</Metric>
          <Text className="text-slate-400 text-xs mt-1">Live users</Text>
        </div>
      </div>
    );
  }

  // Metrics Cards (Total Users, Active Users, Events, Conversion Rate)
  if (chartName.includes("Total Users") || chartName.includes("Active Users") || 
      chartName.includes("Events This Period") || chartName.includes("Conversion Rate") ||
      chartName.includes("New Users") || chartName.includes("Churned Users") ||
      chartName.includes("Response Time") || chartName.includes("Uptime")) {
    const value = chartName.includes("Conversion") || chartName.includes("Uptime") 
      ? `${(Math.random() * 5 + 2).toFixed(1)}%`
      : chartName.includes("Response Time")
      ? `${Math.floor(Math.random() * 200 + 100)}ms`
      : Math.floor(Math.random() * 10000 + 1000).toLocaleString();
    
    const change = chartName.includes("Churned") ? "-2.1%" : "+12.5%";
    const changeColor = chartName.includes("Churned") ? "text-amber-400" : "text-emerald-400";
    
    // Иконки для разных метрик
    const getIcon = () => {
      if (chartName.includes("Total Users") || chartName.includes("New Users") || chartName.includes("Active Users") || chartName.includes("Churned Users")) {
        return (
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        );
      }
      if (chartName.includes("Events") || chartName.includes("Total Events")) {
        return (
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      }
      if (chartName.includes("Active Now")) {
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      }
      if (chartName.includes("Response Time")) {
        return (
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }
      if (chartName.includes("Uptime")) {
        return (
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }
      return (
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    };
    
    return (
      <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl rounded-2xl border border-white/20 p-5 flex flex-col justify-between">
        {/* Верхняя часть с иконкой и изменением */}
        <div className="flex items-center justify-between">
          <div className="p-2 bg-white/10 rounded-lg">
            {getIcon()}
          </div>
          <div className={`text-xs font-semibold ${changeColor} bg-white/10 px-2 py-1 rounded`}>
            {change}
          </div>
        </div>
        
        {/* Нижняя часть со значением и названием */}
        <div className="text-right">
          <Metric className="text-white text-2xl font-bold mb-1 leading-tight block">{value}</Metric>
          <Text className="text-slate-300 text-xs font-medium">
            {chartName.replace(" Module", "")}
          </Text>
        </div>
      </div>
    );
  }

  // Area Chart (unified ECharts)
  if (chartName.includes("Area Chart") || chartName.includes("Activity Overview")) {
    const x = mockAreaData.map(d => d.date);
    const y = mockAreaData.map(d => d.value);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis' },
      grid: { left: 32, right: 16, top: 8, bottom: 16, containLabel: true },
      xAxis: { type: 'category', data: x },
      yAxis: { type: 'value' },
      series: [ { type: 'line', data: y, areaStyle: {}, smooth: true, showSymbol: false } ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(120, height - 24)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Bar List (unified ECharts horizontal bar)
  if (chartName.includes("Bar List") || chartName.includes("Top Events")) {
    const cats = mockBarListData.map(d => d.name);
    const vals = mockBarListData.map(d => d.value);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: cats, inverse: true },
      series: [ { type: 'bar', data: vals, barMaxWidth: 12, itemStyle: { borderRadius: [6,6,0,0] } } ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(120, height - 24)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Donut Chart (unified ECharts)
  if (chartName.includes("Donut") || chartName.includes("Traffic")) {
    const sortedData = [...mockDonutData].sort((a, b) => b.value - a.value);
    const total = sortedData.reduce((sum, d) => sum + d.value, 0);
    const option: any = {
      backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { 
        top: 0, 
        textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' }, 
        orient: 'horizontal',
        data: sortedData.map(d => d.name)
      },
      series: [
        {
          name: 'Share',
          type: 'pie',
          radius: ['50%','70%'],
          avoidLabelOverlap: false,
          label: { show: true, formatter: '{b}' },
          labelLine: { show: true },
          data: sortedData.map(d => ({ name: d.name, value: d.value })),
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '45%',
          style: {
            text: total.toLocaleString(),
            textAlign: 'center',
            fill: theme === 'dark' ? '#fff' : '#000',
            fontSize: 20,
            fontWeight: 'bold',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '55%',
          style: {
            text: 'Total',
            textAlign: 'center',
            fill: theme === 'dark' ? '#94a3b8' : '#000',
            fontSize: 12,
          },
        },
      ],
    };
    return (
      <div className="w-full h-full p-2">
        <BaseChart option={option} height={Math.max(120, height - 24)} chartId={chartId} groupId={groupId} />
      </div>
    );
  }

  // Interactive Dashboard
  if (chartName.includes("Interactive Dashboard")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <UPlotTrendModule
          data={mockTrendData}
          xKey="ts"
          series={[
            { key: "events", name: "Events", stroke: theme === 'dark' ? "#10b981" : "#000" },
            { key: "users", name: "Users", stroke: theme === 'dark' ? "#3b82f6" : "#000" },
          ]}
          height={136}
        />
      </div>
    );
  }

  // Tables (styled mock with sorting)
  if (chartName.includes("Table") || chartName.includes("Users Table") || chartName.includes("Events Table")) {
    const rows = [
      { name: 'Alpha', value: 1240, trend: 12.4 },
      { name: 'Beta', value: 980, trend: -3.1 },
      { name: 'Gamma', value: 730, trend: 5.9 },
      { name: 'Delta', value: 540, trend: -1.4 },
      { name: 'Epsilon', value: 420, trend: 2.2 },
    ];
    const sorted = [...rows].sort((a, b) => {
      const dir = tableSort.dir === 'asc' ? 1 : -1;
      if (tableSort.key === 'name') return a.name.localeCompare(b.name) * dir;
      if (tableSort.key === 'value') return (a.value - b.value) * dir;
      return (a.trend - b.trend) * dir;
    });
    const th = (key: 'name'|'value'|'trend', label: string) => (
      <th
        className="px-3 py-2 text-left text-xs font-semibold text-slate-300 cursor-pointer select-none"
        onClick={() => setTableSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))}
      >
        <div className="inline-flex items-center gap-1">
          <span>{label}</span>
          <svg className={`w-3 h-3 ${tableSort.key === key ? 'text-white' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {tableSort.key === key && tableSort.dir === 'asc' ? (
              <path d="M12 5l6 6H6l6-6z" />
            ) : (
              <path d="M12 19l-6-6h12l-6 6z" />
            )}
          </svg>
        </div>
      </th>
    );
    return (
      <div className="w-full h-full p-3 bg-slate-950">
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                {th('name','Name')}
                {th('value','Value')}
                {th('trend','Change')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr key={r.name} className={idx % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                  <td className="px-3 py-2 text-slate-200">{r.name}</td>
                  <td className="px-3 py-2 text-slate-300">{r.value.toLocaleString()}</td>
                  <td className={`px-3 py-2 ${r.trend >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{r.trend >= 0 ? '+' : ''}{r.trend}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Anomaly Cards
  if (chartName.includes("Anomaly")) {
    return (
      <div className="w-full h-full p-3 bg-gradient-to-r from-red-950/40 to-orange-950/40 border border-red-500/30 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Text className="text-red-300 text-xs font-semibold mb-1">Critical Alert</Text>
          <Metric className="text-white text-xl">3 Anomalies</Metric>
        </div>
      </div>
    );
  }

  // Insight Feed / Analyst Insights
  if (chartName.includes("Insight") || chartName.includes("Analyst")) {
    return (
      <div className="w-full h-full p-3 space-y-2 bg-slate-950">
        {[1, 2].map((i) => (
          <div key={i} className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-lg p-3">
            <div className="flex items-start gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-lime-400 mt-1" />
              <div className="flex-1">
                <div className="h-2 bg-lime-400/30 rounded w-3/4 mb-2" />
                <div className="h-2 bg-slate-600/30 rounded w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Cyber Funnel
  if (chartName.includes("Cyber Funnel") || chartName.includes("Funnel")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950 flex items-center justify-center">
        <div className="space-y-1 w-full">
          {[100, 75, 50, 30].map((width, i) => (
            <div key={i} className="flex items-center gap-2">
              <div 
                className="h-6 bg-gradient-to-r from-emerald-500/40 to-blue-500/40 rounded border border-emerald-500/30"
                style={{ width: `${width}%` }}
              />
              <Text className="text-xs text-slate-400">{100 - i * 20}%</Text>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Retention Matrix
  if (chartName.includes("Retention")) {
    return (
      <div className="w-full h-full p-2 bg-slate-950">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }).map((_, i) => {
            const intensity = Math.random();
            const color = intensity > 0.7 ? 'bg-emerald-500/60' : intensity > 0.4 ? 'bg-emerald-500/40' : 'bg-emerald-500/20';
            return (
              <div key={i} className={`h-4 ${color} rounded border border-emerald-500/20`} />
            );
          })}
        </div>
      </div>
    );
  }

  // User Flow / Sankey
  if (chartName.includes("User Flow") || chartName.includes("Sankey")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950 flex items-center justify-center">
        <div className="relative w-full h-full">
          {/* Simplified Sankey visualization */}
          <div className="absolute left-0 top-1/4 w-1/3 space-y-2">
            <div className="h-8 bg-blue-500/40 rounded-r-lg border-r-2 border-blue-400" />
            <div className="h-6 bg-blue-500/30 rounded-r-lg border-r-2 border-blue-400" />
          </div>
          <div className="absolute right-0 top-1/3 w-1/3 space-y-2">
            <div className="h-6 bg-emerald-500/40 rounded-l-lg border-l-2 border-emerald-400" />
            <div className="h-8 bg-emerald-500/30 rounded-l-lg border-l-2 border-emerald-400" />
          </div>
        </div>
      </div>
    );
  }

  // Chart Builder - Line Chart
  if (chartName.includes("Line Chart") && chartName.includes("Builder")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950">
        <div className="relative h-full">
          <svg className="w-full h-full" viewBox="0 0 100 50">
            <polyline
              points="0,40 20,25 40,30 60,15 80,20 100,10"
              fill="none"
              stroke={theme === 'dark' ? "#10b981" : "#000"}
              strokeWidth="2"
              className="drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
            />
          </svg>
        </div>
      </div>
    );
  }

  // Chart Builder - Bar Chart
  if (chartName.includes("Bar Chart") && chartName.includes("Builder")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950 flex items-end gap-2">
        {[60, 80, 45, 90, 70].map((height, i) => (
          <div 
            key={i} 
            className="flex-1 bg-gradient-to-t from-emerald-500/60 to-blue-500/40 rounded-t border-t-2 border-emerald-400"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    );
  }

  // Chart Builder - Table View
  if (chartName.includes("Table View") || chartName.includes("Field List")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950">
        <div className="space-y-1">
          {/* Header */}
          <div className="flex gap-2 pb-1 border-b border-emerald-500/30">
            <div className="h-3 bg-emerald-500/40 rounded w-1/3" />
            <div className="h-3 bg-blue-500/40 rounded w-1/4" />
            <div className="h-3 bg-purple-500/40 rounded w-1/4" />
          </div>
          {/* Rows */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-2 bg-slate-700/50 rounded w-1/3" />
              <div className="h-2 bg-slate-700/40 rounded w-1/4" />
              <div className="h-2 bg-slate-700/40 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Events Table
  if (chartName.includes("Events Table")) {
    return (
      <div className="w-full h-full p-3 bg-slate-950">
        <div className="space-y-1">
          {/* Header with gradient */}
          <div className="flex gap-2 pb-2 border-b border-lime-400/30">
            <Text className="text-xs text-lime-400 font-semibold w-1/4">Event</Text>
            <Text className="text-xs text-blue-400 font-semibold w-1/4">User</Text>
            <Text className="text-xs text-purple-400 font-semibold w-1/4">Time</Text>
            <Text className="text-xs text-emerald-400 font-semibold w-1/4">Value</Text>
          </div>
          {/* Rows with alternating opacity */}
          {[1,2,3,4].map((i) => (
            <div key={i} className={`flex gap-2 items-center ${i % 2 === 0 ? 'bg-white/5' : ''} rounded px-1`}>
              <div className="h-2 bg-slate-600/50 rounded w-1/4" />
              <div className="h-2 bg-slate-600/40 rounded w-1/4" />
              <div className="h-2 bg-slate-600/40 rounded w-1/4" />
              <div className="h-2 bg-emerald-500/30 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Traffic Breakdown (если не Donut)
  if (chartName.includes("Traffic Breakdown") && !chartName.includes("Donut")) {
    return (
      <div className="w-full h-full p-2">
        <BaseChart
          option={{
            backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            legend: { top: 0, textStyle: { color: theme === 'dark' ? '#cbd5e1' : '#000' } },
            series: [
              {
                name: 'Traffic',
                type: 'pie',
                radius: ['50%','70%'],
                avoidLabelOverlap: false,
                label: { show: false },
                labelLine: { show: false },
                data: mockDonutData.map(d => ({ name: d.name, value: d.value })),
              },
            ],
          }}
          height={Math.max(120, height - 24)}
          chartId={chartId}
          groupId={groupId}
        />
      </div>
    );
  }

  // Default - ECharts Area (unified)
  return (
    <div className="w-full h-full p-2">
      <BaseChart
        option={{
          backgroundColor: theme === 'dark' ? 'transparent' : '#fff',
          tooltip: { trigger: 'axis' },
          grid: { left: 32, right: 16, top: 8, bottom: 16, containLabel: true },
          xAxis: { type: 'category', data: mockAreaData.map(d => d.date) },
          yAxis: { type: 'value' },
          series: [ { type: 'line', data: mockAreaData.map(d => d.value), areaStyle: {}, smooth: true, showSymbol: false } ],
        }}
        height={Math.max(120, height - 24)}
        chartId={chartId}
        groupId={groupId}
      />
    </div>
  );
}
