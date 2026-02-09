"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Card, 
  Title, 
  Text, 
  Button, 
  Flex,
  Select,
  SelectItem
} from "@tremor/react";
import { CalendarIcon } from "@heroicons/react/24/outline";

interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

interface DatePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESET_RANGES: DateRange[] = [
  {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date(),
    label: "Last 24 hours"
  },
  {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    end: new Date(),
    label: "Last 7 days"
  },
  {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    end: new Date(),
    label: "Last 30 days"
  },
  {
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // This month
    end: new Date(),
    label: "This month"
  },
  {
    start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), // Last month
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
    label: "Last month"
  }
];

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [selectedPreset, setSelectedPreset] = useState(value.label);

  const handlePresetChange = (label: string) => {
    const preset = PRESET_RANGES.find(range => range.label === label);
    if (preset) {
      setSelectedPreset(label);
      onChange(preset);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-blue-400" />
        <span className="text-white font-medium text-sm">Date Range</span>
      </div>
      
      {/* Compact Date Select */}
      <select
        value={selectedPreset}
        onChange={(e) => handlePresetChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all"
      >
        {PRESET_RANGES.map((range) => (
          <option key={range.label} value={range.label} className="bg-slate-800">
            {range.label}
          </option>
        ))}
      </select>
      
      {/* Compact Date Display */}
      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/10">
        <div className="flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400">From:</span>
            <span className="text-white ml-1">{formatDate(value.start)}</span>
          </div>
          <span className="text-slate-500">→</span>
          <div>
            <span className="text-slate-400">To:</span>
            <span className="text-white ml-1">{formatDate(value.end)}</span>
          </div>
        </div>
      </div>
      
      {/* Days Count */}
      <div className="text-center">
        <span className="text-slate-500 text-xs">
          {Math.ceil((value.end.getTime() - value.start.getTime()) / (1000 * 60 * 60 * 24))} days
        </span>
      </div>
    </div>
  );
}

export function useDateRange(defaultRange: DateRange = PRESET_RANGES[2]) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange);
  
  return {
    dateRange,
    setDateRange,
    startDate: dateRange.start.toISOString().split('T')[0],
    endDate: dateRange.end.toISOString().split('T')[0],
    daysDiff: Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24))
  };
}
