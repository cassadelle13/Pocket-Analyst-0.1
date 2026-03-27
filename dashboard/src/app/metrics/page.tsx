"use client";

import { useEffect, useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import {
  Card,
  Text,
  Title,
  Grid,
  Metric,
  AreaChart,
  BarList,
  DonutChart,
  Divider,
  Callout,
} from "@tremor/react";
import { RequireRole } from "../../components/auth";
import type { ActivityData, TopEventRow, MetricsResponse, TrafficSlice, FunnelRow } from "../../types/api";

interface ActivityRow {
  id: string;
  bucket: string;
  events: number;
  users: number;
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);

  const activityList = useList<ActivityRow>({
    resource: "activity",
    pagination: { mode: "off" },
  });

  const topEventsList = useList<TopEventRow>({
    resource: "top-events",
    pagination: { mode: "off" },
  });

  const trafficList = useList<TrafficSlice>({
    resource: "traffic-breakdown",
    pagination: { mode: "off" },
  });

  const funnelList = useList<FunnelRow>({
    resource: "funnel",
    pagination: { mode: "off" },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/metrics", { cache: "no-store" });
      const data = (await response.json()) as MetricsResponse;
      if (!cancelled) setMetrics(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const funnelRow = funnelList.data?.data?.[0];
  const funnelBar = useMemo(
    () =>
      funnelRow
        ? [
            { name: "signup", value: funnelRow.signup },
            { name: "upgrade_click", value: funnelRow.upgrade_click },
            { name: "purchase", value: funnelRow.purchase },
          ]
        : [],
    [funnelRow],
  );

  return (
    <RequireRole allow={["data-admin"]} fallbackHref="/dashboard">
      <div className="p-6 min-h-screen space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Metrics</h1>
          <p className="mt-1 text-slate-500">Key KPIs computed directly from ClickHouse.</p>
        </div>

        <Grid numItems={1} numItemsSm={3} className="gap-4">
          <Card className="bg-slate-900/40 border border-slate-800">
            <Text className="text-slate-400">Total Users</Text>
            <Metric className="text-white">{metrics ? metrics.totalUsers : "…"}</Metric>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Text className="text-slate-400">Active Users (7d)</Text>
            <Metric className="text-white">{metrics ? metrics.activeUsers : "…"}</Metric>
          </Card>
          <Card className="bg-slate-900/40 border border-slate-800">
            <Text className="text-slate-400">Events Today</Text>
            <Metric className="text-white">{metrics ? metrics.eventsToday : "…"}</Metric>
          </Card>
        </Grid>

        <Card className="bg-slate-900/40 border border-slate-800">
          <Title className="text-white">24h Activity</Title>
          <Text className="mt-1 text-slate-400">Events and unique users per hour.</Text>
          <div className="mt-4">
            <AreaChart
              data={activityList.data?.data ?? []}
              index="bucket"
              categories={["events", "users"]}
              colors={["lime", "cyan"]}
              showLegend
              showGridLines={false}
              className="h-64"
            />
          </div>
        </Card>

        <Grid numItems={1} numItemsLg={2} className="gap-6">
          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Top Events (30d)</Title>
            <Text className="mt-1 text-slate-400">Where the product is getting the most user activity.</Text>
            <div className="mt-6">
              <BarList data={topEventsList.data?.data ?? []} />
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Traffic Breakdown</Title>
            <Text className="mt-1 text-slate-400">Source distribution from event properties.</Text>
            <div className="mt-6">
              <DonutChart data={trafficList.data?.data ?? []} category="value" index="name" showTooltip />
            </div>
          </Card>
        </Grid>

        <Card className="bg-slate-900/40 border border-slate-800">
          <Title className="text-white">Conversion Funnel (30d)</Title>
          <Text className="mt-1 text-slate-400">signup → upgrade_click → purchase</Text>
          <Divider />

          {funnelRow ? (
            <div className="space-y-4">
              <BarList data={funnelBar} />
              <Grid numItems={1} numItemsSm={2} className="gap-4">
                <Card className="bg-black/20 border border-slate-800">
                  <Text className="text-slate-400">purchase/signup</Text>
                  <Metric className="text-white">
                    {funnelRow.purchase_per_signup === null ? "—" : funnelRow.purchase_per_signup}
                  </Metric>
                </Card>
                <Card className="bg-black/20 border border-slate-800">
                  <Text className="text-slate-400">purchase/upgrade_click</Text>
                  <Metric className="text-white">
                    {funnelRow.purchase_per_upgrade_click === null ? "—" : funnelRow.purchase_per_upgrade_click}
                  </Metric>
                </Card>
              </Grid>
            </div>
          ) : (
            <Callout title="Not enough events" color="yellow">
              Funnel requires signup / upgrade_click / purchase events in the last 30 days.
            </Callout>
          )}
        </Card>

      </div>
    </RequireRole>
  );
}
