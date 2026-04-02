"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface PropertyFilter {
  key: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
}

export interface Segment {
  id: string;
  name: string;
  value: string;
  field?: string;
  operator?: string;
  label?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

interface GlobalFiltersState {
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
  segments: Segment[];
  setSegments: (segments: Segment[]) => void;
  propertyFilters: PropertyFilter[];
  setPropertyFilters: (filters: PropertyFilter[]) => void;
  addPropertyFilter: (filter: PropertyFilter) => void;
  removePropertyFilter: (index: number) => void;
  updatePropertyFilter: (index: number, filter: PropertyFilter) => void;
  clearAllFilters: () => void;
  
  // URL sync
  syncFromURL: () => void;
  syncToURL: () => void;
  
  // Helper methods for compatibility
  getRefineFilters: () => any[];
  getSegmentDescription: () => string;
}

const GlobalFiltersContext = createContext<GlobalFiltersState | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [propertyFilters, setPropertyFilters] = useState<PropertyFilter[]>([]);

  const addPropertyFilter = (filter: PropertyFilter) => {
    setPropertyFilters(prev => [...prev, filter]);
  };

  const removePropertyFilter = (index: number) => {
    setPropertyFilters(prev => prev.filter((_, i) => i !== index));
  };

  const updatePropertyFilter = (index: number, filter: PropertyFilter) => {
    setPropertyFilters(prev => {
      const updated = [...prev];
      updated[index] = filter;
      return updated;
    });
  };

  const clearAllFilters = () => {
    setSegments([]);
    setPropertyFilters([]);
    setDateRange(null);
  };

  // Helper methods for compatibility with existing code
  const getRefineFilters = () => {
    return segments.map(seg => ({
      field: seg.field || seg.id,
      operator: seg.operator || "eq",
      value: seg.value,
    }));
  };

  const getSegmentDescription = () => {
    if (segments.length === 0) return "All users";
    return segments.map(s => s.name || s.value).join(", ");
  };

  // Sync from URL on mount
  const syncFromURL = () => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    
    // Parse date range
    const start = params.get('start');
    const end = params.get('end');
    if (start && end) {
      setDateRange({
        start: new Date(start),
        end: new Date(end),
      });
    }
    
    // Parse segments
    const segmentsParam = params.get('segments');
    if (segmentsParam) {
      try {
        const parsedSegments = JSON.parse(segmentsParam);
        setSegments(parsedSegments);
      } catch {
        // ignore invalid JSON
      }
    }
    
    // Parse property filters
    const parsedFilters: PropertyFilter[] = [];
    params.forEach((value, key) => {
      if (key.startsWith('prop_')) {
        const propKey = key.replace('prop_', '');
        const [operator, propValue] = value.split(':');
        if (operator && propValue) {
          parsedFilters.push({
            key: propKey,
            operator: operator as PropertyFilter['operator'],
            value: propValue,
          });
        }
      }
    });
    
    if (parsedFilters.length > 0) {
      setPropertyFilters(parsedFilters);
    }
  };

  // Sync to URL when state changes
  const syncToURL = () => {
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams();
    
    // Date range
    if (dateRange?.start && dateRange?.end) {
      params.set('start', dateRange.start.toISOString());
      params.set('end', dateRange.end.toISOString());
    }
    
    // Segments
    if (segments.length > 0) {
      params.set('segments', JSON.stringify(segments));
    }
    
    // Property filters
    propertyFilters.forEach((filter) => {
      params.set(`prop_${filter.key}`, `${filter.operator}:${filter.value}`);
    });
    
    // Update URL without page reload
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
  };

  // Sync to URL on any state change
  useEffect(() => {
    if (!isHydrated) return;
    syncToURL();
  }, [dateRange, segments, propertyFilters, isHydrated]);

  // Sync from URL on mount
  useEffect(() => {
    syncFromURL();
    setIsHydrated(true);
  }, []);

  const value: GlobalFiltersState = {
    dateRange,
    setDateRange,
    segments,
    setSegments,
    propertyFilters,
    setPropertyFilters,
    addPropertyFilter,
    removePropertyFilter,
    updatePropertyFilter,
    clearAllFilters,
    syncFromURL,
    syncToURL,
    getRefineFilters,
    getSegmentDescription,
  };

  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export function useGlobalFilters(): GlobalFiltersState {
  const context = useContext(GlobalFiltersContext);
  if (!context) {
    throw new Error('useGlobalFilters must be used within GlobalFiltersProvider');
  }
  return context;
}
