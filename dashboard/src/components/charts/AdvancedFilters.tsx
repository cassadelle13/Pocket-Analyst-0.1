"use client";

import { useState } from "react";
import { Card, Title, Text, Button } from "@tremor/react";
import { FilterIcon, XIcon, CalendarIcon, UserIcon, Filter } from "lucide-react";

interface FilterOption {
  id: string;
  label: string;
  type: "select" | "date" | "multiselect";
  options?: Array<{ value: string; label: string }>;
  value?: any;
}

interface AdvancedFiltersProps {
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onReset?: () => void;
}

export function AdvancedFilters({ filters, onFiltersChange, onReset }: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>(filters);

  const updateFilter = (filterId: string, value: any) => {
    const updatedFilters = activeFilters.map(filter => 
      filter.id === filterId ? { ...filter, value } : filter
    );
    setActiveFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const removeFilter = (filterId: string) => {
    const updatedFilters = activeFilters.map(filter => 
      filter.id === filterId ? { ...filter, value: undefined } : filter
    );
    setActiveFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const resetAllFilters = () => {
    const resetFilters = activeFilters.map(filter => ({ ...filter, value: undefined }));
    setActiveFilters(resetFilters);
    onFiltersChange(resetFilters);
    if (onReset) onReset();
  };

  const activeFilterCount = activeFilters.filter(f => f.value !== undefined && f.value !== "").length;

  const renderFilter = (filter: FilterOption) => {
    switch (filter.type) {
      case "select":
        return (
          <div key={filter.id} className="space-y-2">
            <label className="text-sm text-slate-300">{filter.label}</label>
            <select
              value={filter.value || ""}
              onChange={(e) => updateFilter(filter.id, e.target.value)}
              className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">All</option>
              {filter.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case "multiselect":
        return (
          <div key={filter.id} className="space-y-2">
            <label className="text-sm text-slate-300">{filter.label}</label>
            <div className="space-y-1">
              {filter.options?.map(option => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={Array.isArray(filter.value) && filter.value.includes(option.value)}
                    onChange={(e) => {
                      const currentValues = Array.isArray(filter.value) ? filter.value : [];
                      const newValues = e.target.checked
                        ? [...currentValues, option.value]
                        : currentValues.filter(v => v !== option.value);
                      updateFilter(filter.id, newValues);
                    }}
                    className="rounded border-white/20 bg-white/10 text-blue-400 focus:ring-blue-400"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        );

      case "date":
        return (
          <div key={filter.id} className="space-y-2">
            <label className="text-sm text-slate-300">{filter.label}</label>
            <input
              type="date"
              value={filter.value || ""}
              onChange={(e) => updateFilter(filter.id, e.target.value)}
              className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="h-5 w-5 text-blue-400" />
          <Title className="text-white text-lg">Advanced Filters</Title>
          {activeFilterCount > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              size="xs"
              variant="secondary"
              onClick={resetAllFilters}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
            >
              Reset All
            </Button>
          )}
          
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      {/* Active filters display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeFilters.filter(f => f.value !== undefined && f.value !== "").map(filter => (
            <div
              key={filter.id}
              className="bg-blue-500/20 border border-blue-400/30 rounded-lg px-3 py-1 flex items-center gap-2"
            >
              <span className="text-xs text-blue-300">
                {filter.label}: {Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}
              </span>
              <button
                onClick={() => removeFilter(filter.id)}
                className="text-blue-300 hover:text-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeFilters.map(renderFilter)}
        </div>
      )}

      {!isExpanded && activeFilterCount === 0 && (
        <div className="text-center py-4">
          <Filter className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <Text className="text-slate-400 text-sm">
            Click "Expand" to configure filters
          </Text>
        </div>
      )}
    </Card>
  );
}
