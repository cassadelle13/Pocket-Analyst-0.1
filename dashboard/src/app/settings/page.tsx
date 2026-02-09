"use client";

import { Card, Title, Text } from "@tremor/react";
import { RequireRole } from "../../components/auth";
import { useRole } from "../../providers";
import { useChartSyncSettings } from "@/context/ChartSyncSettings";
import { ToggleSwitch } from "@/components/chart-config/ToggleSwitch";
import { useChartClickBehavior, ClickBehavior } from "@/context/ChartClickBehavior";
import { useTheme } from '@/context/ThemeContext';

export default function SettingsPage() {
  const { role } = useRole();
  const { syncEnabled, setSyncEnabled } = useChartSyncSettings();
  const { behavior, defaultBehavior, setDefaultBehavior, setBehavior } = useChartClickBehavior();
  const { theme, toggleTheme } = useTheme();

  const KNOWN_CHART_IDS: Array<{ id: string; label: string }> = [
    { id: "revenue-users-trend", label: "Revenue & Users Trend" },
    { id: "devices-bar", label: "Device Performance" },
    { id: "traffic-bar", label: "Traffic Sources Analysis" },
    { id: "activity-trend", label: "24 Hour Activity" },
    { id: "activity-event-types", label: "Event Types Distribution" },
  ];
  const allChartIds = Array.from(new Set([ ...KNOWN_CHART_IDS.map(x => x.id), ...Object.keys(behavior) ]));
  const labelFor = (id: string) => KNOWN_CHART_IDS.find(x => x.id === id)?.label ?? id;

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="relative min-h-screen overflow-hidden">
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
        <div className="relative p-6 min-h-screen space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="mt-1 text-slate-500">Environment + access profile for this workspace.</p>
          </div>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Role</Title>
            <Text className="mt-2 text-slate-300">Current role: {role}</Text>
            <Text className="mt-2 text-slate-400">
              Switch roles using the toggle in the sidebar. This is a demo RBAC layer backed by localStorage.
            </Text>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Charts synchronization</Title>
            <div className="mt-3">
              <ToggleSwitch
                value={syncEnabled}
                onChange={setSyncEnabled}
                label="Enable cross-chart synchronization"
                description="Sync hover and zoom between charts in the same group. Disable to improve performance on low-power devices."
              />
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Chart click behavior</Title>
            <Text className="mt-2 text-slate-300">Select default behavior and per-chart overrides.</Text>
            <div className="mt-4 space-y-4">
              <div>
                <Text className="text-slate-400 mb-2">Default behavior</Text>
                <div className="flex gap-2">
                  {(["drilldown","filter","both"] as ClickBehavior[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setDefaultBehavior(b)}
                      className={`px-3 py-1.5 rounded-lg border text-sm ${defaultBehavior===b? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300':'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Text className="text-slate-400 mb-2">Per-chart overrides</Text>
                <div className="space-y-2">
                  {allChartIds.map((id) => (
                    <div key={id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                      <div className="text-slate-200 text-sm">{labelFor(id)}<span className="text-slate-500"> · {id}</span></div>
                      <div className="flex gap-2">
                        {(["drilldown","filter","both"] as ClickBehavior[]).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setBehavior(id, b)}
                            className={`px-2.5 py-1 rounded-md border text-xs ${behavior[id]===b? 'bg-blue-500/20 border-blue-500/40 text-blue-300':'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'}`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Theme</Title>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Theme</h2>
              <button 
                onClick={toggleTheme}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg"
              >
                Switch to {theme === 'dark' ? 'light' : 'dark'} theme
              </button>
            </div>
          </Card>
        </div>
      </div>
    </RequireRole>
  );
}
