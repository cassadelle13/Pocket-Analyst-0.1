"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Save, RotateCcw, Download, Upload, Bookmark, SlidersHorizontal, Plus, Sparkles, Layers } from "lucide-react";
import type { ChartConfig, ChartType } from "../../types/chart-config";
import { DEFAULT_CONFIGS } from "../../types/chart-config";
import { useRole } from "../../providers";
import { ColorPicker } from "./ColorPicker";
import { NumberInput } from "./NumberInput";
import { ToggleSwitch } from "./ToggleSwitch";
import { SelectDropdown } from "./SelectDropdown";
import { RangeSlider } from "./RangeSlider";

interface ChartConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartId?: string;
  chartType: ChartType;
  chartName: string;
  currentConfig: Partial<ChartConfig>;
  chartData?: any;
  onSave: (config: ChartConfig) => void;
  onConfigChange?: (config: ChartConfig) => void;
}

function BuildMultiDropZone({
  label,
  values,
  onDrop,
  onRemove,
  onClear,
}: {
  label: string;
  values: string[];
  onDrop: (col: string) => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const col = String(data?.column?.ref ?? data?.column?.name ?? data?.name ?? "").trim();
      if (!col) return;
      onDrop(col);
    } catch {
      // ignore
    }
  };

  const hasValues = Array.isArray(values) && values.length > 0;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border p-3 transition ${
        isDragOver ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        {hasValues && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            title="Clear"
          >
            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
          </button>
        )}
      </div>

      <div className="mt-2">
        {hasValues ? (
          <div className="flex flex-wrap gap-2">
            {values.map((v, idx) => (
              <div
                key={`${label}_${idx}_${v}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[11px] font-semibold text-white"
                title={v}
              >
                <span className="max-w-[180px] truncate">{v}</span>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="p-0.5 rounded-lg hover:bg-white/10 transition"
                  title="Remove"
                >
                  <Plus className="w-3.5 h-3.5" style={{ transform: "rotate(45deg)" }} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500 text-xs py-2">{isDragOver ? "Drop here" : "Drag fields here"}</div>
        )}
      </div>
    </div>
  );
}

function CreativeSettings({ config, updateConfig }: any) {
  const creative = config.creative || {};
  const theme = creative.colorTheme || 'custom';

  const applyPreset = (presetKey: string) => {
    const preset = CREATIVE_PRESETS[presetKey];
    if (!preset) {
      updateConfig('creative.colorTheme', 'custom');
      return;
    }
    updateConfig('creative', preset);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Creative Settings</h3>

      <div className="space-y-3">
        <div className="pt-1">
          <SelectDropdown
            label="Color Theme"
            value={theme}
            onChange={(v) => {
              updateConfig('creative.colorTheme', v);
              if (v && v !== 'custom') applyPreset(v);
            }}
            options={[
              { value: 'custom', label: 'Custom' },
              { value: 'neon-green', label: 'Neon Green' },
              { value: 'cyber-blue', label: 'Cyber Blue' },
              { value: 'sunset-orange', label: 'Sunset Orange' },
              { value: 'aurora', label: 'Aurora' },
              { value: 'synthwave', label: 'Synthwave' },
              { value: 'dashboard-glow', label: 'Dashboard Glow' },
            ]}
          />
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Line Glow</h4>
          <ToggleSwitch
            label="Enable Glow"
            value={creative.lineGlow?.enabled === true}
            onChange={(v) => updateConfig('creative.lineGlow.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <ColorPicker
              label="Glow Color"
              value={creative.lineGlow?.color || 'rgba(16,185,129,0.6)'}
              onChange={(v) => updateConfig('creative.lineGlow.color', v)}
            />
            <RangeSlider
              label="Intensity"
              value={Number(creative.lineGlow?.intensity ?? 10)}
              onChange={(v) => updateConfig('creative.lineGlow.intensity', v)}
              min={0}
              max={40}
              step={1}
            />
            <RangeSlider
              label="Spread"
              value={Number(creative.lineGlow?.spread ?? 0)}
              onChange={(v) => updateConfig('creative.lineGlow.spread', v)}
              min={0}
              max={10}
              step={1}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Area Gradient</h4>
          <ToggleSwitch
            label="Enable Gradient Fill"
            value={creative.areaGradient?.enabled === true}
            onChange={(v) => updateConfig('creative.areaGradient.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <ColorPicker
              label="Top Color"
              value={creative.areaGradient?.topColor || 'rgba(16,185,129,0.3)'}
              onChange={(v) => updateConfig('creative.areaGradient.topColor', v)}
            />
            <ColorPicker
              label="Bottom Color"
              value={creative.areaGradient?.bottomColor || 'rgba(16,185,129,0.05)'}
              onChange={(v) => updateConfig('creative.areaGradient.bottomColor', v)}
            />
            <RangeSlider
              label="Opacity"
              value={Math.round(Number(creative.areaGradient?.opacity ?? 0.3) * 100)}
              onChange={(v) => updateConfig('creative.areaGradient.opacity', v / 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
            />
            <SelectDropdown
              label="Direction"
              value={creative.areaGradient?.direction || 'vertical'}
              onChange={(v) => updateConfig('creative.areaGradient.direction', v)}
              options={[
                { value: 'vertical', label: 'Vertical' },
                { value: 'horizontal', label: 'Horizontal' },
                { value: 'radial', label: 'Radial' },
              ]}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Item Glow</h4>
          <ToggleSwitch
            label="Enable Item Glow"
            value={creative.itemGlow?.enabled === true}
            onChange={(v) => updateConfig('creative.itemGlow.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <ColorPicker
              label="Glow Color"
              value={creative.itemGlow?.color || 'rgba(16,185,129,0.45)'}
              onChange={(v) => updateConfig('creative.itemGlow.color', v)}
            />
            <RangeSlider
              label="Intensity"
              value={Number(creative.itemGlow?.intensity ?? 8)}
              onChange={(v) => updateConfig('creative.itemGlow.intensity', v)}
              min={0}
              max={40}
              step={1}
            />
            <ToggleSwitch
              label="Inner Glow"
              value={creative.itemGlow?.innerGlow === true}
              onChange={(v) => updateConfig('creative.itemGlow.innerGlow', v)}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Glassmorphism</h4>
          <ToggleSwitch
            label="Enable Glass"
            value={creative.glassmorphism?.enabled === true}
            onChange={(v) => updateConfig('creative.glassmorphism.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <RangeSlider
              label="Blur"
              value={Number(creative.glassmorphism?.blur ?? 16)}
              onChange={(v) => updateConfig('creative.glassmorphism.blur', v)}
              min={0}
              max={32}
              step={1}
              unit="px"
            />
            <ColorPicker
              label="Tint"
              value={creative.glassmorphism?.tint || 'rgba(255,255,255,0.05)'}
              onChange={(v) => updateConfig('creative.glassmorphism.tint', v)}
            />
            <ColorPicker
              label="Border Glow"
              value={creative.glassmorphism?.borderGlow || 'rgba(255,255,255,0.14)'}
              onChange={(v) => updateConfig('creative.glassmorphism.borderGlow', v)}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Pulse Markers</h4>
          <ToggleSwitch
            label="Enable Pulse"
            value={creative.pulseMarkers?.enabled === true}
            onChange={(v) => updateConfig('creative.pulseMarkers.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <ColorPicker
              label="Color"
              value={creative.pulseMarkers?.color || 'rgba(16,185,129,0.9)'}
              onChange={(v) => updateConfig('creative.pulseMarkers.color', v)}
            />
            <RangeSlider
              label="Size"
              value={Number(creative.pulseMarkers?.size ?? 8)}
              onChange={(v) => updateConfig('creative.pulseMarkers.size', v)}
              min={4}
              max={20}
              step={1}
            />
            <RangeSlider
              label="Speed"
              value={Number(creative.pulseMarkers?.speed ?? 1400)}
              onChange={(v) => updateConfig('creative.pulseMarkers.speed', v)}
              min={500}
              max={3000}
              step={50}
              unit="ms"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type TabId = 'general' | 'axes' | 'series' | 'legend' | 'tooltip' | 'advanced';

type ConfigMode = 'visualizations' | 'simple' | 'advanced' | 'creative';

const CREATIVE_PRESETS: Record<string, any> = {
  'neon-green': {
    colorTheme: 'neon-green',
    lineGlow: { enabled: true, color: 'rgba(16,185,129,0.75)', intensity: 16, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(16,185,129,0.35)', bottomColor: 'rgba(16,185,129,0.02)', opacity: 0.35, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(16,185,129,0.5)', intensity: 12, innerGlow: true },
    glassmorphism: { enabled: false, blur: 16, tint: 'rgba(255,255,255,0.05)', borderGlow: 'rgba(16,185,129,0.18)' },
    pulseMarkers: { enabled: false, color: 'rgba(16,185,129,0.9)', size: 8, speed: 1400 },
  },
  'cyber-blue': {
    colorTheme: 'cyber-blue',
    lineGlow: { enabled: true, color: 'rgba(59,130,246,0.75)', intensity: 16, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(59,130,246,0.32)', bottomColor: 'rgba(59,130,246,0.02)', opacity: 0.32, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(59,130,246,0.5)', intensity: 12, innerGlow: true },
    glassmorphism: { enabled: false, blur: 16, tint: 'rgba(255,255,255,0.05)', borderGlow: 'rgba(59,130,246,0.18)' },
    pulseMarkers: { enabled: false, color: 'rgba(59,130,246,0.9)', size: 8, speed: 1400 },
  },
  'sunset-orange': {
    colorTheme: 'sunset-orange',
    lineGlow: { enabled: true, color: 'rgba(249,115,22,0.75)', intensity: 16, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(249,115,22,0.3)', bottomColor: 'rgba(249,115,22,0.02)', opacity: 0.3, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(249,115,22,0.45)', intensity: 12, innerGlow: true },
    glassmorphism: { enabled: false, blur: 16, tint: 'rgba(255,255,255,0.05)', borderGlow: 'rgba(249,115,22,0.18)' },
    pulseMarkers: { enabled: false, color: 'rgba(249,115,22,0.9)', size: 8, speed: 1400 },
  },
  aurora: {
    colorTheme: 'aurora',
    lineGlow: { enabled: true, color: 'rgba(167,139,250,0.65)', intensity: 18, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(167,139,250,0.22)', bottomColor: 'rgba(16,185,129,0.04)', opacity: 0.28, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(167,139,250,0.45)', intensity: 12, innerGlow: false },
    glassmorphism: { enabled: true, blur: 18, tint: 'rgba(255,255,255,0.04)', borderGlow: 'rgba(167,139,250,0.16)' },
    pulseMarkers: { enabled: false, color: 'rgba(167,139,250,0.9)', size: 8, speed: 1400 },
  },
  synthwave: {
    colorTheme: 'synthwave',
    lineGlow: { enabled: true, color: 'rgba(236,72,153,0.65)', intensity: 18, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(236,72,153,0.22)', bottomColor: 'rgba(59,130,246,0.03)', opacity: 0.26, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(236,72,153,0.45)', intensity: 12, innerGlow: false },
    glassmorphism: { enabled: true, blur: 18, tint: 'rgba(255,255,255,0.035)', borderGlow: 'rgba(236,72,153,0.16)' },
    pulseMarkers: { enabled: false, color: 'rgba(236,72,153,0.9)', size: 8, speed: 1400 },
  },
  'dashboard-glow': {
    colorTheme: 'dashboard-glow',
    lineGlow: { enabled: true, color: 'rgba(16,185,129,0.18)', intensity: 14, spread: 0 },
    areaGradient: { enabled: true, topColor: 'rgba(16,185,129,0.25)', bottomColor: 'rgba(16,185,129,0.02)', opacity: 0.3, direction: 'vertical' },
    itemGlow: { enabled: true, color: 'rgba(59,130,246,0.14)', intensity: 10, innerGlow: false },
    glassmorphism: { enabled: true, blur: 0, tint: 'transparent', borderGlow: 'rgba(255,255,255,0.06)' },
    pulseMarkers: { enabled: false, color: 'rgba(16,185,129,0.9)', size: 8, speed: 1400 },
  },
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'axes', label: 'Axes' },
  { id: 'series', label: 'Series' },
  { id: 'legend', label: 'Legend' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'advanced', label: 'Advanced' },
];

export function ChartConfigModal({
  isOpen,
  onClose,
  chartId,
  chartType,
  chartName,
  currentConfig,
  chartData,
  onSave,
  onConfigChange,
}: ChartConfigModalProps) {
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [mode, setMode] = useState<ConfigMode>('visualizations');
  const [config, setConfig] = useState<ChartConfig>(() => {
    const defaultConfig = DEFAULT_CONFIGS[chartType] || {};
    return {
      id: chartId ?? chartName,
      chartType,
      ...defaultConfig,
      ...currentConfig,
    } as ChartConfig;
  });

  useEffect(() => {
    if (isOpen) {
      const defaultConfig = DEFAULT_CONFIGS[chartType] || {};
      const merged = {
        id: chartId ?? chartName,
        chartType,
        ...defaultConfig,
        ...currentConfig,
      } as ChartConfig;
      setConfig(merged);
      setActiveTab('general');
      setMode(role === 'data-admin' ? 'advanced' : 'visualizations');
    }
  }, [isOpen, chartId, chartType, chartName, currentConfig, role]);

  useEffect(() => {
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  const updateConfig = useCallback((path: string, value: any) => {
    setConfig((prev) => {
      const keys = path.split('.');
      const newConfig = JSON.parse(JSON.stringify(prev));
      let current: any = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newConfig;
    });
  }, []);

  const handleSave = () => {
    onSave({ ...config, updatedAt: new Date().toISOString() });
    onClose();
  };

  const handleReset = () => {
    const defaultConfig = DEFAULT_CONFIGS[chartType] || {};
    const reset = {
      id: chartId ?? chartName,
      chartType,
      ...defaultConfig,
    } as ChartConfig;
    setConfig(reset);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chartName}_config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target?.result as string);
            setConfig(imported);
          } catch (err) {
            console.error('Failed to import config:', err);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleSavePreset = () => {
    const presets = JSON.parse(localStorage.getItem('chart_presets') || '[]');
    const preset = {
      id: `preset_${Date.now()}`,
      name: `${chartName} Preset`,
      config,
      createdAt: new Date().toISOString(),
    };
    presets.push(preset);
    localStorage.setItem('chart_presets', JSON.stringify(presets));
    console.log('Preset saved');
  };

  if (!isOpen) return null;

  return (
    <div
      className={`h-full p-4 ${
        mode === 'simple' || mode === 'visualizations'
          ? 'w-[340px] sm:w-[380px]'
          : 'w-[420px] sm:w-[520px]'
      }`}
    >
      <div className="h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-3xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <SlidersHorizontal className="w-4 h-4 text-blue-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Chart Configuration</div>
                <div className="text-xs text-slate-400 truncate">{chartName} • {chartType}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Закрыть"
            >
              <Plus className="w-5 h-5" style={{transform: "rotate(45deg)"}} />
            </button>
          </div>

          {/* Mode toggle + action buttons */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('visualizations')}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors flex items-center gap-1 ${mode === 'visualizations' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <Layers className="w-3.5 h-3.5" />
                Build
              </button>
              <button
                type="button"
                onClick={() => setMode('simple')}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${mode === 'simple' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setMode('advanced')}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${mode === 'advanced' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                Advanced
              </button>
              <button
                type="button"
                onClick={() => setMode('creative')}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors flex items-center gap-1 ${mode === 'creative' ? 'bg-blue-500 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Creative
              </button>
            </div>
            <div className="flex-1" />
            <button type="button" onClick={handleSavePreset} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Save as Preset">
              <Bookmark className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleExport} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Export Config">
              <Download className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleImport} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Import Config">
              <Upload className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleReset} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Reset to Default">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs (advanced mode) */}
          {mode === 'advanced' && (
            <div className="mt-3 flex gap-0.5 overflow-x-auto custom-scrollbar">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
          <div className="space-y-5">
            {mode === 'visualizations' && (
              <VisualizationsSettings
                chartId={chartId}
                chartName={chartName}
                chartData={chartData}
                config={config}
                updateConfig={updateConfig}
              />
            )}
            {mode === 'simple' && (
              <SimpleSettings config={config} updateConfig={updateConfig} />
            )}

            {mode === 'advanced' && (
              <>
                {activeTab === 'general' && (
                  <GeneralSettings config={config} updateConfig={updateConfig} />
                )}
                {activeTab === 'axes' && (
                  <AxesSettings config={config} updateConfig={updateConfig} />
                )}
                {activeTab === 'series' && (
                  <SeriesSettings config={config} updateConfig={updateConfig} />
                )}
                {activeTab === 'legend' && (
                  <LegendSettings config={config} updateConfig={updateConfig} />
                )}
                {activeTab === 'tooltip' && (
                  <TooltipSettings config={config} updateConfig={updateConfig} />
                )}
                {activeTab === 'advanced' && (
                  <AdvancedSettings config={config} updateConfig={updateConfig} />
                )}
              </>
            )}

            {mode === 'creative' && (
              <CreativeSettings config={config} updateConfig={updateConfig} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SimpleSettings({ config, updateConfig }: any) {
  const heightPreset = useMemo(() => {
    const h = Number(config.general?.height ?? 360);
    if (h <= 260) return 's';
    if (h >= 520) return 'l';
    return 'm';
  }, [config.general?.height]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Simple Settings</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-300">Title</label>
          <input
            type="text"
            value={config.general?.title || ''}
            onChange={(e) => updateConfig('general.title', e.target.value)}
            className="w-full mt-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            placeholder="Chart title"
          />
        </div>

        <SelectDropdown
          label="Height"
          value={heightPreset}
          onChange={(v) => {
            const next = v === 's' ? 240 : v === 'l' ? 560 : 360;
            updateConfig('general.height', next);
          }}
          options={[
            { value: 's', label: 'Small' },
            { value: 'm', label: 'Medium' },
            { value: 'l', label: 'Large' },
          ]}
        />

        <ColorPicker
          label="Background"
          value={config.general?.backgroundColor || 'transparent'}
          onChange={(v) => updateConfig('general.backgroundColor', v)}
        />

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Legend</h4>
          <ToggleSwitch
            label="Show Legend"
            value={config.legend?.show !== false}
            onChange={(v) => updateConfig('legend.show', v)}
          />
          <div className="mt-3">
            <SelectDropdown
              label="Position"
              value={config.legend?.position || 'top'}
              onChange={(v) => updateConfig('legend.position', v)}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Axes & Grid</h4>
          <ToggleSwitch
            label="Grid Lines"
            value={config.axes?.xAxis?.gridLines?.show !== false}
            onChange={(v) => {
              updateConfig('axes.xAxis.gridLines.show', v);
              updateConfig('axes.yAxis.gridLines.show', v);
            }}
          />
          <div className="mt-3">
            <SelectDropdown
              label="X Labels"
              value={String(config.axes?.xAxis?.labels?.rotation ?? 0)}
              onChange={(v) => updateConfig('axes.xAxis.labels.rotation', Number(v))}
              options={[
                { value: '0', label: '0°' },
                { value: '45', label: '45°' },
                { value: '90', label: '90°' },
              ]}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Series</h4>
          <ToggleSwitch
            label="Smooth Lines"
            value={(config.series ?? []).some((s: any) => s?.smooth === true)}
            onChange={(v) => {
              const next = Array.isArray(config.series) ? config.series.map((s: any) => ({ ...s, smooth: v })) : [];
              updateConfig('series', next);
            }}
          />
          <ToggleSwitch
            label="Show Points"
            value={(config.series ?? []).some((s: any) => s?.showMarkers === true)}
            onChange={(v) => {
              const next = Array.isArray(config.series) ? config.series.map((s: any) => ({ ...s, showMarkers: v })) : [];
              updateConfig('series', next);
            }}
          />
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Tooltip</h4>
          <ToggleSwitch
            label="Show Tooltip"
            value={config.tooltip?.show !== false}
            onChange={(v) => updateConfig('tooltip.show', v)}
          />
        </div>
      </div>
    </div>
  );
}

function VisualizationsSettings({
  chartId,
  chartName,
  chartData,
  config,
  updateConfig,
}: {
  chartId?: string;
  chartName: string;
  chartData?: any;
  config: ChartConfig;
  updateConfig: (path: string, value: any) => void;
}) {
  const canEdit = Boolean(chartId);

  const mapping = useMemo(() => {
    const data = (chartData && typeof chartData === "object") ? chartData : null;
    const m = data?.columnMapping;
    return (m && typeof m === "object") ? m : null;
  }, [chartData]);

  const forcedViz = useMemo(() => {
    const cfgV = String(config?.general?.vizType ?? "").trim().toLowerCase();
    const data = (chartData && typeof chartData === "object") ? chartData : null;
    const legacyV = String(data?.__forceVizType ?? "").trim().toLowerCase();
    const v = cfgV || legacyV;
    return (v === "line" || v === "bar" || v === "table") ? v : "";
  }, [chartData, config?.general?.vizType]);

  const setForcedViz = (v: "line" | "bar" | "table") => {
    if (!chartId) return;
    updateConfig("general.vizType", v);
  };

  const patchMapping = (patch: any) => {
    if (!chartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev, ...patch };
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId, patch: { columnMapping: next } },
      })
    );
  };

  const clearMappingKey = (key: "xColumn" | "groupBy") => {
    if (!chartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev } as any;
    delete next[key];
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId, patch: { columnMapping: next } },
      })
    );
  };

  const clearMappingArrayKey = (key: "tooltipColumns" | "detailsColumns" | "drilldownColumns" | "details2Columns") => {
    if (!chartId) return;
    const prev = (mapping && typeof mapping === "object") ? mapping : {};
    const next = { ...prev } as any;
    delete next[key];
    window.dispatchEvent(
      new CustomEvent("dashboard:update-chart-data", {
        detail: { chartId, patch: { columnMapping: next } },
      })
    );
  };

  const addToMappingArray = (
    key: "tooltipColumns" | "detailsColumns" | "drilldownColumns" | "details2Columns",
    col: string
  ) => {
    if (!chartId) return;
    const prevArr = Array.isArray((mapping as any)?.[key]) ? (mapping as any)[key] : [];
    const nextArr = [...prevArr, col].filter((x) => String(x).trim().length > 0);
    patchMapping({ [key]: nextArr });
  };

  const removeY = (idx: number) => {
    if (!chartId) return;
    const prevY = Array.isArray(mapping?.yColumns) ? mapping!.yColumns : [];
    const nextY = prevY.filter((_: any, i: number) => i !== idx);
    patchMapping({ yColumns: nextY });
  };

  const addEmptyMeasure = () => {
    if (!chartId) return;
    const prevY = Array.isArray(mapping?.yColumns) ? mapping!.yColumns : [];
    const nextY = [...prevY, { col: "", agg: "SUM" }];
    patchMapping({ yColumns: nextY });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Visualizations (Build)</h3>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-slate-500">Visualizations</div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setForcedViz("line")}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
              (forcedViz || "line") === "line"
                ? "bg-white/15 border-white/25 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Line
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setForcedViz("bar")}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
              forcedViz === "bar"
                ? "bg-white/15 border-white/25 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Bar
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setForcedViz("table")}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
              forcedViz === "table"
                ? "bg-white/15 border-white/25 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Table
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Fields</div>
          <div className="text-[11px] text-slate-400 truncate">{chartName}</div>
        </div>

        <BuildDropZone
          label="Axis (X)"
          value={String(mapping?.xColumn ?? "")}
          onDrop={(col) => patchMapping({ xColumn: col })}
          onClear={() => clearMappingKey("xColumn")}
        />

        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-slate-500">Values</div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={addEmptyMeasure}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add
            </button>
          </div>

          {(Array.isArray(mapping?.yColumns) ? mapping!.yColumns : []).length === 0 && (
            <div className="text-xs text-slate-500">Drop measures here (multi-metric supported).</div>
          )}

          <div className="space-y-2">
            {(Array.isArray(mapping?.yColumns) ? mapping!.yColumns : []).map((m: any, idx: number) => (
              <div key={`${idx}_${String(m?.col ?? "")}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-white truncate">{String(m?.col || "(drop measure)")}</div>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => removeY(idx)}
                    className="p-1 rounded-lg hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Remove"
                  >
                    <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SelectDropdown
                    label="Agg"
                    value={String(m?.agg ?? "SUM")}
                    onChange={(v) => {
                      const prevY = Array.isArray(mapping?.yColumns) ? mapping!.yColumns : [];
                      const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, agg: v } : yy);
                      patchMapping({ yColumns: nextY });
                    }}
                    options={[
                      { value: "SUM", label: "SUM" },
                      { value: "COUNT", label: "COUNT" },
                      { value: "AVG", label: "AVG" },
                      { value: "MIN", label: "MIN" },
                      { value: "MAX", label: "MAX" },
                      { value: "LAST", label: "LAST" },
                    ]}
                  />
                  <BuildDropZone
                    label="Measure"
                    compact
                    value={String(m?.col ?? "")}
                    onDrop={(col) => {
                      const prevY = Array.isArray(mapping?.yColumns) ? mapping!.yColumns : [];
                      const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, col } : yy);
                      patchMapping({ yColumns: nextY });
                    }}
                    onClear={() => {
                      const prevY = Array.isArray(mapping?.yColumns) ? mapping!.yColumns : [];
                      const nextY = prevY.map((yy: any, i: number) => i === idx ? { ...yy, col: "" } : yy);
                      patchMapping({ yColumns: nextY });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <BuildDropZone
          label="Legend (group by)"
          value={String(mapping?.groupBy ?? "")}
          onDrop={(col) => patchMapping({ groupBy: col })}
          onClear={() => clearMappingKey("groupBy")}
        />

        <div className="pt-2 border-t border-white/10 space-y-2">
          <div className="text-xs uppercase tracking-wider text-slate-500">Legend / Tooltip / Details</div>

          <BuildMultiDropZone
            label="Tooltip"
            values={Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : []}
            onDrop={(col) => addToMappingArray("tooltipColumns", col)}
            onRemove={(idx) => {
              const prevArr = Array.isArray((mapping as any)?.tooltipColumns) ? (mapping as any).tooltipColumns : [];
              patchMapping({ tooltipColumns: prevArr.filter((_: any, i: number) => i !== idx) });
            }}
            onClear={() => clearMappingArrayKey("tooltipColumns")}
          />

          <BuildMultiDropZone
            label="Details"
            values={Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : []}
            onDrop={(col) => addToMappingArray("detailsColumns", col)}
            onRemove={(idx) => {
              const prevArr = Array.isArray((mapping as any)?.detailsColumns) ? (mapping as any).detailsColumns : [];
              patchMapping({ detailsColumns: prevArr.filter((_: any, i: number) => i !== idx) });
            }}
            onClear={() => clearMappingArrayKey("detailsColumns")}
          />

          <BuildMultiDropZone
            label="Drilldown"
            values={Array.isArray((mapping as any)?.drilldownColumns) ? (mapping as any).drilldownColumns : []}
            onDrop={(col) => addToMappingArray("drilldownColumns", col)}
            onRemove={(idx) => {
              const prevArr = Array.isArray((mapping as any)?.drilldownColumns) ? (mapping as any).drilldownColumns : [];
              patchMapping({ drilldownColumns: prevArr.filter((_: any, i: number) => i !== idx) });
            }}
            onClear={() => clearMappingArrayKey("drilldownColumns")}
          />

          <BuildMultiDropZone
            label="Details (2)"
            values={Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : []}
            onDrop={(col) => addToMappingArray("details2Columns", col)}
            onRemove={(idx) => {
              const prevArr = Array.isArray((mapping as any)?.details2Columns) ? (mapping as any).details2Columns : [];
              patchMapping({ details2Columns: prevArr.filter((_: any, i: number) => i !== idx) });
            }}
            onClear={() => clearMappingArrayKey("details2Columns")}
          />
        </div>

        <div className="pt-2 border-t border-white/10">
          <div className="text-xs text-slate-400">
            Drag fields from <span className="text-slate-200 font-semibold">Fields & Filters</span> panel into these wells.
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildDropZone({
  label,
  value,
  onDrop,
  onClear,
  compact,
}: {
  label: string;
  value: string;
  onDrop: (col: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const col = String(data?.column?.name ?? data?.name ?? "").trim();
      if (!col) return;
      onDrop(col);
    } catch {
      // ignore
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border p-3 transition ${
        isDragOver ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        {!!value && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            title="Clear"
          >
            <Plus className="w-4 h-4" style={{ transform: "rotate(45deg)" }} />
          </button>
        )}
      </div>

      <div className={compact ? "mt-1" : "mt-2"}>
        {value ? (
          <div className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-white truncate">
            {value}
          </div>
        ) : (
          <div className={`text-slate-500 ${compact ? "text-[11px] py-1" : "text-xs py-2"}`}>
            {isDragOver ? "Drop here" : "Drag field here"}
          </div>
        )}
      </div>
    </div>
  );
}

// Settings Components
function GeneralSettings({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">General Settings</h3>
      
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-300">Title</label>
          <input
            type="text"
            value={config.general?.title || ''}
            onChange={(e) => updateConfig('general.title', e.target.value)}
            className="w-full mt-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            placeholder="Chart title"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300">Subtitle</label>
          <input
            type="text"
            value={config.general?.subtitle || ''}
            onChange={(e) => updateConfig('general.subtitle', e.target.value)}
            className="w-full mt-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            placeholder="Chart subtitle"
          />
        </div>

        <NumberInput
          label="Height"
          value={config.general?.height || 360}
          onChange={(v) => updateConfig('general.height', v)}
          min={200}
          max={1000}
          step={10}
          unit="px"
        />

        <ColorPicker
          label="Background Color"
          value={config.general?.backgroundColor || 'transparent'}
          onChange={(v) => updateConfig('general.backgroundColor', v)}
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            label="Padding Top"
            value={config.general?.padding?.top || 10}
            onChange={(v) => updateConfig('general.padding.top', v)}
            min={0}
            max={100}
            unit="px"
          />
          <NumberInput
            label="Padding Right"
            value={config.general?.padding?.right || 10}
            onChange={(v) => updateConfig('general.padding.right', v)}
            min={0}
            max={100}
            unit="px"
          />
          <NumberInput
            label="Padding Bottom"
            value={config.general?.padding?.bottom || 10}
            onChange={(v) => updateConfig('general.padding.bottom', v)}
            min={0}
            max={100}
            unit="px"
          />
          <NumberInput
            label="Padding Left"
            value={config.general?.padding?.left || 10}
            onChange={(v) => updateConfig('general.padding.left', v)}
            min={0}
            max={100}
            unit="px"
          />
        </div>
      </div>
    </div>
  );
}

function AxesSettings({ config, updateConfig }: any) {
  const [activeAxis, setActiveAxis] = useState<'x' | 'y'>('x');
  const axis = activeAxis === 'x' ? config.axes?.xAxis : config.axes?.yAxis;
  const prefix = `axes.${activeAxis}Axis`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Axes Settings</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveAxis('x')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              activeAxis === 'x'
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            X Axis
          </button>
          <button
            type="button"
            onClick={() => setActiveAxis('y')}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              activeAxis === 'y'
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            Y Axis
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <ToggleSwitch
          label="Show Axis"
          value={axis?.show !== false}
          onChange={(v) => updateConfig(`${prefix}.show`, v)}
        />

        <div>
          <label className="text-xs font-medium text-slate-300">Label</label>
          <input
            type="text"
            value={axis?.label || ''}
            onChange={(e) => updateConfig(`${prefix}.label`, e.target.value)}
            className="w-full mt-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
          />
        </div>

        <SelectDropdown
          label="Type"
          value={axis?.type || 'value'}
          onChange={(v) => updateConfig(`${prefix}.type`, v)}
          options={[
            { value: 'value', label: 'Value' },
            { value: 'category', label: 'Category' },
            { value: 'time', label: 'Time' },
            { value: 'log', label: 'Logarithmic' },
          ]}
        />

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Grid Lines</h4>
          <ToggleSwitch
            label="Show Grid Lines"
            value={axis?.gridLines?.show !== false}
            onChange={(v) => updateConfig(`${prefix}.gridLines.show`, v)}
          />
          <div className="mt-3 space-y-3">
            <ColorPicker
              label="Grid Color"
              value={axis?.gridLines?.color || 'rgba(16,185,129,0.08)'}
              onChange={(v) => updateConfig(`${prefix}.gridLines.color`, v)}
            />
            <NumberInput
              label="Grid Width"
              value={axis?.gridLines?.width || 1}
              onChange={(v) => updateConfig(`${prefix}.gridLines.width`, v)}
              min={1}
              max={5}
              unit="px"
            />
            <SelectDropdown
              label="Grid Style"
              value={axis?.gridLines?.style || 'solid'}
              onChange={(v) => updateConfig(`${prefix}.gridLines.style`, v)}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Labels</h4>
          <ToggleSwitch
            label="Show Labels"
            value={axis?.labels?.show !== false}
            onChange={(v) => updateConfig(`${prefix}.labels.show`, v)}
          />
          <div className="mt-3 space-y-3">
            <NumberInput
              label="Font Size"
              value={axis?.labels?.fontSize || 11}
              onChange={(v) => updateConfig(`${prefix}.labels.fontSize`, v)}
              min={8}
              max={24}
              unit="px"
            />
            <ColorPicker
              label="Font Color"
              value={axis?.labels?.fontColor || 'rgba(148,163,184,0.55)'}
              onChange={(v) => updateConfig(`${prefix}.labels.fontColor`, v)}
            />
            <NumberInput
              label="Rotation"
              value={axis?.labels?.rotation || 0}
              onChange={(v) => updateConfig(`${prefix}.labels.rotation`, v)}
              min={-90}
              max={90}
              unit="°"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SeriesSettings({ config, updateConfig }: any) {
  const series = Array.isArray(config.series) ? config.series : [];

  const addSeries = () => {
    const next = [...series, {
      id: `series_${Date.now()}`,
      name: "",
      color: "#60a5fa",
      lineWidth: 2,
      smooth: false,
      showMarkers: false,
      markerSize: 6,
      dataLabels: {
        show: false,
        position: "top",
        fontSize: 11,
        color: "#e2e8f0",
      },
    }];
    updateConfig("series", next);
  };

  const removeSeries = (idx: number) => {
    const next = series.filter((_: any, i: number) => i !== idx);
    updateConfig("series", next);
  };

  const updateSeries = (idx: number, patch: any) => {
    const next = series.map((s: any, i: number) => (i === idx ? { ...s, ...patch } : s));
    updateConfig("series", next);
  };

  const updateSeriesDataLabels = (idx: number, patch: any) => {
    const next = series.map((s: any, i: number) => {
      if (i !== idx) return s;
      const dl = (s?.dataLabels && typeof s.dataLabels === "object") ? s.dataLabels : {};
      return { ...s, dataLabels: { ...dl, ...patch } };
    });
    updateConfig("series", next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Series Settings</h3>
        <button
          type="button"
          onClick={addSeries}
          className="px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition"
        >
          + Add series
        </button>
      </div>

      {series.length === 0 && (
        <div className="text-sm text-slate-400">
          Add at least one series style. Styles apply by series index (0..N) and optionally by name.
        </div>
      )}

      <div className="space-y-3">
        {series.map((s: any, idx: number) => {
          const dataLabels = (s?.dataLabels && typeof s.dataLabels === "object") ? s.dataLabels : {};
          return (
            <div key={String(s?.id ?? idx)} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">Series {idx + 1}</div>
                <button
                  type="button"
                  onClick={() => removeSeries(idx)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition"
                >
                  Remove
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Name (optional)</label>
                <input
                  type="text"
                  value={String(s?.name ?? "")}
                  onChange={(e) => updateSeries(idx, { name: e.target.value })}
                  className="w-full mt-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  placeholder="Match by ECharts series name (optional)"
                />
              </div>

              <ColorPicker
                label="Color"
                value={typeof s?.color === "string" ? s.color : "#60a5fa"}
                onChange={(v) => updateSeries(idx, { color: v })}
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Line width"
                  value={Number(s?.lineWidth ?? 2)}
                  onChange={(v) => updateSeries(idx, { lineWidth: v })}
                  min={0}
                  max={12}
                  unit="px"
                />
                <NumberInput
                  label="Marker size"
                  value={Number(s?.markerSize ?? 6)}
                  onChange={(v) => updateSeries(idx, { markerSize: v })}
                  min={0}
                  max={24}
                  unit="px"
                />
              </div>

              <div className="pt-2 border-t border-white/10 space-y-3">
                <ToggleSwitch
                  label="Smooth"
                  value={s?.smooth === true}
                  onChange={(v) => updateSeries(idx, { smooth: v })}
                />
                <ToggleSwitch
                  label="Show markers"
                  value={s?.showMarkers === true}
                  onChange={(v) => updateSeries(idx, { showMarkers: v })}
                />
              </div>

              <div className="pt-2 border-t border-white/10 space-y-3">
                <ToggleSwitch
                  label="Data labels"
                  value={dataLabels?.show === true}
                  onChange={(v) => updateSeriesDataLabels(idx, { show: v })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <ColorPicker
                    label="Label color"
                    value={typeof dataLabels?.color === "string" ? dataLabels.color : "#e2e8f0"}
                    onChange={(v) => updateSeriesDataLabels(idx, { color: v })}
                  />
                  <SelectDropdown
                    label="Label position"
                    value={String(dataLabels?.position ?? "top")}
                    onChange={(v) => updateSeriesDataLabels(idx, { position: v })}
                    options={[
                      { value: "top", label: "Top" },
                      { value: "bottom", label: "Bottom" },
                      { value: "left", label: "Left" },
                      { value: "right", label: "Right" },
                      { value: "inside", label: "Inside" },
                      { value: "insideLeft", label: "Inside Left" },
                      { value: "insideRight", label: "Inside Right" },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendSettings({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Legend Settings</h3>
      
      <div className="space-y-3">
        <ToggleSwitch
          label="Show Legend"
          value={config.legend?.show !== false}
          onChange={(v) => updateConfig('legend.show', v)}
        />

        <SelectDropdown
          label="Position"
          value={config.legend?.position || 'top'}
          onChange={(v) => updateConfig('legend.position', v)}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'bottom', label: 'Bottom' },
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
        />

        <SelectDropdown
          label="Orientation"
          value={config.legend?.orientation || 'horizontal'}
          onChange={(v) => updateConfig('legend.orientation', v)}
          options={[
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
          ]}
        />

        <NumberInput
          label="Font Size"
          value={config.legend?.fontSize || 12}
          onChange={(v) => updateConfig('legend.fontSize', v)}
          min={8}
          max={24}
          unit="px"
        />

        <ColorPicker
          label="Font Color"
          value={config.legend?.fontColor || '#e2e8f0'}
          onChange={(v) => updateConfig('legend.fontColor', v)}
        />
      </div>
    </div>
  );
}

function TooltipSettings({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Tooltip Settings</h3>
      
      <div className="space-y-3">
        <ToggleSwitch
          label="Show Tooltip"
          value={config.tooltip?.show !== false}
          onChange={(v) => updateConfig('tooltip.show', v)}
        />

        <SelectDropdown
          label="Trigger"
          value={config.tooltip?.trigger || 'axis'}
          onChange={(v) => updateConfig('tooltip.trigger', v)}
          options={[
            { value: 'axis', label: 'Axis' },
            { value: 'item', label: 'Item' },
            { value: 'none', label: 'None' },
          ]}
        />

        <ColorPicker
          label="Background Color"
          value={config.tooltip?.backgroundColor || 'rgba(15, 23, 42, 0.9)'}
          onChange={(v) => updateConfig('tooltip.backgroundColor', v)}
        />

        <ColorPicker
          label="Border Color"
          value={config.tooltip?.borderColor || '#334155'}
          onChange={(v) => updateConfig('tooltip.borderColor', v)}
        />

        <NumberInput
          label="Border Width"
          value={config.tooltip?.borderWidth || 1}
          onChange={(v) => updateConfig('tooltip.borderWidth', v)}
          min={0}
          max={5}
          unit="px"
        />
      </div>
    </div>
  );
}

function AdvancedSettings({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Advanced Settings</h3>
      
      <div className="space-y-3">
        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Animation</h4>
          <ToggleSwitch
            label="Enable Animation"
            value={config.advanced?.animation?.enabled !== false}
            onChange={(v) => updateConfig('advanced.animation.enabled', v)}
          />
          <div className="mt-3 space-y-3">
            <NumberInput
              label="Duration"
              value={config.advanced?.animation?.duration || 1000}
              onChange={(v) => updateConfig('advanced.animation.duration', v)}
              min={0}
              max={5000}
              step={100}
              unit="ms"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">DataZoom</h4>
          <ToggleSwitch
            label="Enable DataZoom"
            value={config.advanced?.dataZoom?.enabled === true}
            onChange={(v) => updateConfig('advanced.dataZoom.enabled', v)}
          />
        </div>

        <div className="pt-3 border-t border-white/10">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Toolbox</h4>
          <ToggleSwitch
            label="Enable Toolbox"
            value={config.advanced?.toolbox?.enabled === true}
            onChange={(v) => updateConfig('advanced.toolbox.enabled', v)}
          />
        </div>
      </div>
    </div>
  );
}
