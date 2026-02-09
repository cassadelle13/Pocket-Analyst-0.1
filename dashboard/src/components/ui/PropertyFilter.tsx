"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { useDemoMode } from "../../context/DemoContext";

export interface PropertyFilter {
  key: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
}

interface Props {
  value: PropertyFilter[];
  onChange: (filters: PropertyFilter[]) => void;
  placeholder?: string;
  className?: string;
}

const operators = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "contains", label: "~" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
] as const;

// Extract unique keys from a sample of events (properties JSON)
function extractKeysFromSample(sample: any[]): string[] {
  const keySet = new Set<string>();
  for (const item of sample) {
    try {
      const props = typeof item.properties === "string" ? JSON.parse(item.properties) : item.properties || {};
      Object.keys(props).forEach((k) => keySet.add(k));
    } catch {
      // ignore malformed JSON
    }
  }
  return Array.from(keySet).sort();
}

export default function PropertyFilter({ value, onChange, placeholder = "Filter by properties", className }: Props) {
  const { isDemoMode } = useDemoMode();
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newOperator, setNewOperator] = useState<PropertyFilter["operator"]>("eq");
  const [newValue, setNewValue] = useState("");

  // Fetch sample events to extract property keys
  useEffect(() => {
    if (isDemoMode) {
      // Use mock keys in Demo Mode to avoid network requests
      setAvailableKeys(['event_name', 'user_id', 'browser', 'os', 'device', 'country', 'platform']);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/rest/events-table?limit=50", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data?: any[] };
          if (json.data) {
            const keys = extractKeysFromSample(json.data);
            setAvailableKeys(keys);
          }
        }
      } catch {
        // silently fail
      }
    })();
  }, [isDemoMode]);

  const addFilter = () => {
    if (!newKey || !newValue) return;
    onChange([...value, { key: newKey, operator: newOperator, value: newValue }]);
    setNewKey("");
    setNewValue("");
    setNewOperator("eq");
  };

  const removeFilter = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <select
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400/50 transition-all min-w-[90px]"
        >
          <option value="" className="bg-slate-800">Key...</option>
          {availableKeys.map((k) => (
            <option key={k} value={k} className="bg-slate-800">{k}</option>
          ))}
        </select>

        <select
          value={newOperator}
          onChange={(e) => setNewOperator(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400/50 transition-all w-12 text-center"
        >
          {operators.map((op) => (
            <option key={op.value} value={op.value} className="bg-slate-800">{op.label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Value..."
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFilter()}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-400/50 transition-all min-w-[80px] flex-1"
        />

        <button
          type="button"
          onClick={addFilter}
          disabled={!newKey || !newValue}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((filter, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-slate-300"
            >
              <span className="text-blue-400">{filter.key}</span>
              <span className="text-slate-500">{operators.find((o) => o.value === filter.operator)?.label}</span>
              <span>{filter.value}</span>
              <button
                type="button"
                onClick={() => removeFilter(idx)}
                className="text-slate-500 hover:text-red-400 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
