"use client";

import { Card, Title, Text } from "@tremor/react";
import { RequireRole } from "../../components/auth";
import { useRole } from "../../providers";
import { useChartSyncSettings } from "@/context/ChartSyncSettings";
import { ToggleSwitch } from "@/components/chart-config/ToggleSwitch";
import { useChartClickBehavior, ClickBehavior } from "@/context/ChartClickBehavior";
import { useTheme } from '@/context/ThemeContext';
import { useDemoMode } from "../../context/DemoContext";
import { Beaker, Brain, BarChart3, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../providers/LanguageProvider";
import { LanguageToggle } from "../../components/ui/LanguageToggle";
import {
  clearGlobalBackground,
  clearGlobalBackgroundAnimation,
  compressImageFileToJpegDataUrl,
  getGlobalBackground,
  getGlobalBackgroundAnimation,
  getGlobalBackgroundBlurEnabled,
  getGlobalBackgroundDarken,
  GLOBAL_BACKGROUND_CHANGED_EVENT,
  setGlobalBackground,
  setGlobalBackgroundAnimation,
  setGlobalBackgroundBlurEnabled,
  setGlobalBackgroundDarken,
} from "../../lib/globalBackgroundStorage";
import {
  CANVAS_BACKGROUND_CHANGED_EVENT,
  clearCanvasBackground,
  clearCanvasBackgroundAnimation,
  compressImageFileToJpegDataUrl as compressCanvasBg,
  getCanvasBackground,
  getCanvasBackgroundAnimation,
  getCanvasBackgroundBlurEnabled,
  getCanvasBackgroundDarken,
  setCanvasBackground,
  setCanvasBackgroundAnimation,
  setCanvasBackgroundBlurEnabled,
  setCanvasBackgroundDarken,
} from "../../lib/canvasBackgroundStorage";
import { deleteBackgroundMedia, saveBackgroundMedia } from "../../lib/backgroundMediaStorage";
import {
  getSidebarDarken,
  setSidebarDarken,
  SIDEBAR_STYLE_CHANGED_EVENT,
} from "../../lib/sidebarStyleStorage";

export default function SettingsPage() {
  const { role } = useRole();
  const { syncEnabled, setSyncEnabled } = useChartSyncSettings();
  const { behavior, defaultBehavior, setDefaultBehavior, setBehavior } = useChartClickBehavior();
  const { theme, toggleTheme } = useTheme();
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const { language } = useLanguage();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [bg, setBg] = useState<string>("");
  const [bgBusy, setBgBusy] = useState(false);

  const canvasFileRef = useRef<HTMLInputElement | null>(null);
  const canvasAnimRef = useRef<HTMLInputElement | null>(null);
  const [canvasBg, setCanvasBg] = useState<string>("");
  const [canvasBgBusy, setCanvasBgBusy] = useState(false);
  const [canvasBlurEnabled, setCanvasBlurEnabled] = useState(true);
  const [canvasAnim, setCanvasAnim] = useState<{ id: string; mime: string } | null>(null);
  const [canvasDarken, setCanvasDarkenState] = useState(0.35);

  const [globalBlurEnabled, setGlobalBlurEnabledState] = useState(true);
  const globalAnimRef = useRef<HTMLInputElement | null>(null);
  const [globalAnim, setGlobalAnim] = useState<{ id: string; mime: string } | null>(null);
  const [globalDarken, setGlobalDarkenState] = useState(0.35);

  const [sidebarDarkenState, setSidebarDarkenState] = useState(0);

  useEffect(() => {
    setBg(getGlobalBackground());
    setGlobalBlurEnabledState(getGlobalBackgroundBlurEnabled());
    setGlobalDarkenState(getGlobalBackgroundDarken());
    setGlobalAnim(getGlobalBackgroundAnimation());
    const handler = () => {
      setBg(getGlobalBackground());
      setGlobalBlurEnabledState(getGlobalBackgroundBlurEnabled());
      setGlobalDarkenState(getGlobalBackgroundDarken());
      setGlobalAnim(getGlobalBackgroundAnimation());
    };
    window.addEventListener(GLOBAL_BACKGROUND_CHANGED_EVENT, handler);
    return () => window.removeEventListener(GLOBAL_BACKGROUND_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    setCanvasBg(getCanvasBackground());
    setCanvasBlurEnabled(getCanvasBackgroundBlurEnabled());
    setCanvasDarkenState(getCanvasBackgroundDarken());
    setCanvasAnim(getCanvasBackgroundAnimation());
    const handler = () => {
      setCanvasBg(getCanvasBackground());
      setCanvasBlurEnabled(getCanvasBackgroundBlurEnabled());
      setCanvasDarkenState(getCanvasBackgroundDarken());
      setCanvasAnim(getCanvasBackgroundAnimation());
    };
    window.addEventListener(CANVAS_BACKGROUND_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CANVAS_BACKGROUND_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    setSidebarDarkenState(getSidebarDarken());
    const handler = () => setSidebarDarkenState(getSidebarDarken());
    window.addEventListener(SIDEBAR_STYLE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_STYLE_CHANGED_EVENT, handler);
  }, []);

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
            <Title className="text-white">Language</Title>
            <Text className="mt-2 text-slate-300">Current language: {language.toUpperCase()}</Text>
            <Text className="mt-2 text-slate-400">
              Choose your preferred interface language. Changes are saved automatically and apply immediately.
            </Text>
            <div className="mt-4">
              <LanguageToggle size="md" showLabel={true} />
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Sidebar</Title>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300">Darken</div>
                  <div className="text-xs text-slate-500 mt-0.5">Adjust sidebar background darkness.</div>
                </div>
                <div className="w-56">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(sidebarDarkenState * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setSidebarDarkenState(v);
                      setSidebarDarken(v);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Dashboard canvas background</Title>
            <Text className="mt-2 text-slate-300">
              Upload an image used only behind the dashboard canvas (under the glass blur).
            </Text>
            <div className="mt-3">
              <ToggleSwitch
                value={canvasBlurEnabled}
                onChange={(v) => {
                  setCanvasBlurEnabled(v);
                  setCanvasBackgroundBlurEnabled(v);
                }}
                label="Blur background"
                description="Toggle blur under the canvas glass layer."
              />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300">Darken</div>
                  <div className="text-xs text-slate-500 mt-0.5">Adjust background darkness under the canvas.</div>
                </div>
                <div className="w-56">
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={Math.round(canvasDarken * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setCanvasDarkenState(v);
                      setCanvasBackgroundDarken(v);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-4">
              <div className="w-64 h-36 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                {canvasBg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={canvasBg}
                    alt="Canvas background"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    No canvas background
                  </div>
                )}
              </div>

              <div className="flex-1">
                <input
                  ref={canvasFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCanvasBgBusy(true);
                    try {
                      const dataUrl = await compressCanvasBg(file, 2200, 1400, 0.72);
                      setCanvasBackground(dataUrl);
                    } finally {
                      setCanvasBgBusy(false);
                      if (canvasFileRef.current) canvasFileRef.current.value = "";
                    }
                  }}
                />

                <input
                  ref={canvasAnimRef}
                  type="file"
                  accept="video/webm,video/mp4,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setCanvasBgBusy(true);
                    try {
                      const prev = getCanvasBackgroundAnimation();
                      if (prev?.id) {
                        await deleteBackgroundMedia(prev.id).catch(() => {});
                      }
                      const saved = await saveBackgroundMedia(file);
                      setCanvasBackgroundAnimation(saved.id, saved.mime);
                    } finally {
                      setCanvasBgBusy(false);
                      if (canvasAnimRef.current) canvasAnimRef.current.value = "";
                    }
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={canvasBgBusy}
                    onClick={() => canvasFileRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    {canvasBgBusy ? "Processing..." : "Upload image"}
                  </button>
                  <button
                    type="button"
                    disabled={canvasBgBusy}
                    onClick={() => canvasAnimRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                    title="Recommended: WebM/MP4. GIF is allowed but heavier."
                  >
                    Upload animation
                  </button>
                  <button
                    type="button"
                    disabled={!canvasBg || canvasBgBusy}
                    onClick={() => clearCanvasBackground()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    disabled={!canvasAnim || canvasBgBusy}
                    onClick={async () => {
                      const prev = getCanvasBackgroundAnimation();
                      clearCanvasBackgroundAnimation();
                      if (prev?.id) {
                        await deleteBackgroundMedia(prev.id).catch(() => {});
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    Reset animation
                  </button>
                </div>

                <Text className="mt-3 text-xs text-slate-400">
                  Tip: this is also compressed automatically to keep the canvas fast.
                </Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Animation formats: WebM / MP4 (recommended), GIF (allowed).
                </Text>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Environment Mode</Title>
            <div className="mt-3">
              <ToggleSwitch
                value={isDemoMode}
                onChange={toggleDemoMode}
                label="Demo Mode"
                description={isDemoMode ? "Currently in Demo Mode with sample data" : "Currently in Live Mode with real data"}
              />
              <div className="mt-3 flex items-center gap-2">
                <Beaker className={`w-4 h-4 ${isDemoMode ? "text-amber-400 animate-pulse" : "text-slate-400"}`} />
                <Text className={`text-sm ${isDemoMode ? "text-amber-400" : "text-slate-400"}`}>
                  {isDemoMode ? "Demo Mode Active" : "Live Mode Active"}
                </Text>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Global background</Title>
            <Text className="mt-2 text-slate-300">
              Upload an image to use as the background across all tabs.
            </Text>
            <div className="mt-3">
              <ToggleSwitch
                value={globalBlurEnabled}
                onChange={(v) => {
                  setGlobalBlurEnabledState(v);
                  setGlobalBackgroundBlurEnabled(v);
                }}
                label="Blur background"
                description="Toggle blur applied to the global background image."
              />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-300">Darken</div>
                  <div className="text-xs text-slate-500 mt-0.5">Adjust global background darkness.</div>
                </div>
                <div className="w-56">
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={Math.round(globalDarken * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setGlobalDarkenState(v);
                      setGlobalBackgroundDarken(v);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-4">
              <div className="w-64 h-36 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                {bg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bg}
                    alt="Global background"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                    No background
                  </div>
                )}
              </div>

              <div className="flex-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBgBusy(true);
                    try {
                      const dataUrl = await compressImageFileToJpegDataUrl(file, 2200, 1400, 0.72);
                      setGlobalBackground(dataUrl);
                    } finally {
                      setBgBusy(false);
                      if (fileRef.current) fileRef.current.value = "";
                    }
                  }}
                />

                <input
                  ref={globalAnimRef}
                  type="file"
                  accept="video/webm,video/mp4,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBgBusy(true);
                    try {
                      const prev = getGlobalBackgroundAnimation();
                      if (prev?.id) {
                        await deleteBackgroundMedia(prev.id).catch(() => {});
                      }
                      const saved = await saveBackgroundMedia(file);
                      setGlobalBackgroundAnimation(saved.id, saved.mime);
                    } finally {
                      setBgBusy(false);
                      if (globalAnimRef.current) globalAnimRef.current.value = "";
                    }
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={bgBusy}
                    onClick={() => fileRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    {bgBusy ? "Processing..." : "Upload image"}
                  </button>
                  <button
                    type="button"
                    disabled={bgBusy}
                    onClick={() => globalAnimRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                    title="Recommended: WebM/MP4. GIF is allowed but heavier."
                  >
                    Upload animation
                  </button>
                  <button
                    type="button"
                    disabled={!bg || bgBusy}
                    onClick={() => clearGlobalBackground()}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    disabled={!globalAnim || bgBusy}
                    onClick={async () => {
                      const prev = getGlobalBackgroundAnimation();
                      clearGlobalBackgroundAnimation();
                      if (prev?.id) {
                        await deleteBackgroundMedia(prev.id).catch(() => {});
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-60"
                  >
                    Reset animation
                  </button>
                </div>

                <Text className="mt-3 text-xs text-slate-400">
                  Tip: large images are automatically compressed to keep the UI fast.
                </Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Animation formats: WebM / MP4 (recommended), GIF (allowed).
                </Text>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/40 border border-slate-800">
            <Title className="text-white">Additional Tools</Title>
            <Text className="mt-2 text-slate-300">Access additional analytics and AI features.</Text>
            <div className="mt-4 space-y-3">
              <a
                href="/ai-insights"
                className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">
                      AI Insights
                    </div>
                    <div className="text-xs text-slate-400">
                      AI-powered analytics and insights
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
              </a>
              
              <a
                href="/analytics"
                className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors">
                      Analytics
                    </div>
                    <div className="text-xs text-slate-400">
                      Detailed analytics and reporting
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
              </a>
            </div>
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
