"use client";

import { useState } from "react";
import { 
  Card, 
  Title, 
  Text, 
  Button, 
  Flex,
  Select,
  SelectItem,
  Badge
} from "@tremor/react";
import { FunnelIcon } from "@heroicons/react/24/outline";

interface Segment {
  field: string;
  operator: string;
  value: string;
  label: string;
}

interface SegmentFilterProps {
  segments: Segment[];
  onChange: (segments: Segment[]) => void;
}

const SEGMENT_OPTIONS = [
  {
    field: "source",
    label: "Traffic Source",
    options: [
      { value: "organic", label: "Organic" },
      { value: "direct", label: "Direct" },
      { value: "google_ads", label: "Google Ads" },
      { value: "facebook_ads", label: "Facebook Ads" },
      { value: "twitter", label: "Twitter" },
      { value: "linkedin", label: "LinkedIn" },
      { value: "referral", label: "Referral" },
      { value: "email_campaign", label: "Email Campaign" }
    ]
  },
  {
    field: "platform",
    label: "Platform",
    options: [
      { value: "web", label: "Web" },
      { value: "mobile", label: "Mobile" },
      { value: "desktop", label: "Desktop" },
      { value: "api", label: "API" }
    ]
  },
  {
    field: "event_name",
    label: "Event Type",
    options: [
      { value: "page_view", label: "Page View" },
      { value: "signup", label: "Sign Up" },
      { value: "login", label: "Login" },
      { value: "purchase", label: "Purchase" },
      { value: "upgrade_click", label: "Upgrade Click" },
      { value: "feature_used", label: "Feature Used" }
    ]
  }
];

export function SegmentFilter({ segments, onChange }: SegmentFilterProps) {
  const [newSegment, setNewSegment] = useState({
    field: "",
    operator: "eq",
    value: ""
  });

  const addSegment = () => {
    if (!newSegment.field || !newSegment.value) return;
    
    const fieldConfig = SEGMENT_OPTIONS.find(opt => opt.field === newSegment.field);
    const valueConfig = fieldConfig?.options.find(opt => opt.value === newSegment.value);
    
    const segment: Segment = {
      field: newSegment.field,
      operator: newSegment.operator,
      value: newSegment.value,
      label: `${fieldConfig?.label}: ${valueConfig?.label || newSegment.value}`
    };
    
    onChange([...segments, segment]);
    setNewSegment({ field: "", operator: "eq", value: "" });
  };

  const removeSegment = (index: number) => {
    onChange(segments.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectedField = SEGMENT_OPTIONS.find(opt => opt.field === newSegment.field);

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex items-center gap-2">
        <FunnelIcon className="w-4 h-4 text-blue-400" />
        <span className="text-white font-medium text-sm">Segments</span>
        {segments.length > 0 && (
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
            {segments.length}
          </span>
        )}
      </div>
      
      {/* Compact Add Segment */}
      <div className="flex gap-2">
        <select
          value={newSegment.field}
          onChange={(e) => setNewSegment(prev => ({ ...prev, field: e.target.value, value: "" }))}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all"
        >
          <option value="" className="bg-slate-800">Field...</option>
          {SEGMENT_OPTIONS.map((option) => (
            <option key={option.field} value={option.field} className="bg-slate-800">
              {option.label}
            </option>
          ))}
        </select>
        
        {selectedField && (
          <select
            value={newSegment.value}
            onChange={(e) => setNewSegment(prev => ({ ...prev, value: e.target.value }))}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition-all"
          >
            <option value="" className="bg-slate-800">Value...</option>
            {selectedField.options.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-800">
                {option.label}
              </option>
            ))}
          </select>
        )}
        
        <button
          onClick={addSegment}
          disabled={!newSegment.field || !newSegment.value}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
        >
          Add
        </button>
      </div>
      
      {/* Active Segments - Compact Badges */}
      {segments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">Active filters</span>
            <button
              onClick={clearAll}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </div>
          
          <div className="flex flex-wrap gap-1.5">
            {segments.map((segment, index) => (
              <span
                key={index}
                onClick={() => removeSegment(index)}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full cursor-pointer hover:bg-blue-500/30 transition-colors"
              >
                {segment.label}
                <span className="text-blue-400 hover:text-red-400">×</span>
              </span>
            ))}
          </div>
        </div>
      )}
      
      {segments.length === 0 && (
        <div className="text-center py-2">
          <span className="text-slate-500 text-xs">
            No filters applied
          </span>
        </div>
      )}
    </div>
  );
}

export function useSegments() {
  const [segments, setSegments] = useState<Segment[]>([]);
  
  const getRefineFilters = () => {
    return segments.map(segment => ({
      field: segment.field,
      operator: segment.operator as any,
      value: segment.value
    }));
  };
  
  const getSegmentDescription = () => {
    if (segments.length === 0) return "All Users";
    return segments.map(s => s.label).join(", ");
  };
  
  return {
    segments,
    setSegments,
    getRefineFilters,
    getSegmentDescription
  };
}
