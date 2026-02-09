"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Save, RotateCcw, Download, Upload, Bookmark } from "lucide-react";
import type { ChartConfig, ChartType } from "../../types/chart-config";
import { DEFAULT_CONFIGS } from "../../types/chart-config";
import { ColorPicker } from "./ColorPicker";
import { NumberInput } from "./NumberInput";
import { ToggleSwitch } from "./ToggleSwitch";
import { SelectDropdown } from "./SelectDropdown";
import { RangeSlider } from "./RangeSlider";

interface ChartConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartType: ChartType;
  chartName: string;
  currentConfig: Partial<ChartConfig>;
  onSave: (config: ChartConfig) => void;
}

type TabId = 'general' | 'axes' | 'series' | 'legend' | 'tooltip' | 'advanced';

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
  chartType,
  chartName,
  currentConfig,
  onSave,
}: ChartConfigModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [config, setConfig] = useState<ChartConfig>(() => {
    const defaultConfig = DEFAULT_CONFIGS[chartType] || {};
    return {
      id: chartName,
      chartType,
      ...defaultConfig,
      ...currentConfig,
    } as ChartConfig;
  });

  const [previewConfig, setPreviewConfig] = useState(config);

  useEffect(() => {
    if (isOpen) {
      const defaultConfig = DEFAULT_CONFIGS[chartType] || {};
      const merged = {
        id: chartName,
        chartType,
        ...defaultConfig,
        ...currentConfig,
      } as ChartConfig;
      setConfig(merged);
      setPreviewConfig(merged);
    }
  }, [isOpen, chartType, chartName, currentConfig]);

  // Debounced preview update
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewConfig(config);
    }, 300);
    return () => clearTimeout(timer);
  }, [config]);

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
      id: chartName,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-6xl max-h-[90vh] backdrop-blur-xl bg-slate-900/95 border border-white/20 rounded-2xl shadow-2xl flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-2xl font-bold text-white">Chart Configuration</h2>
            <p className="text-sm text-slate-400 mt-1">{chartName} • {chartType}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSavePreset}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Save as Preset"
            >
              <Bookmark className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Export Config"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Import Config"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Reset to Default"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Settings Panel */}
            <div className="space-y-6">
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
            </div>

            {/* Live Preview */}
            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="text-sm font-medium text-slate-300 mb-3">Live Preview</div>
              <div className="bg-slate-950/50 rounded-lg p-4 min-h-[400px] flex items-center justify-center">
                <div className="text-slate-400 text-sm">
                  Preview will update automatically
                  <br />
                  <span className="text-xs text-slate-500 mt-1 block">
                    Changes apply with 300ms delay
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
        </div>
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
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Series Settings</h3>
      <div className="text-sm text-slate-400">
        Series configuration will be added based on chart data
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
