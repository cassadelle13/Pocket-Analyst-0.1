/**
 * React hook for performance monitoring
 * Integrates PocketSentinel with React component lifecycle
 */

import { useEffect, useRef } from 'react';
import { getPerformanceMonitor, type PerformanceBottleneck } from "../lib/performance-monitor";

interface UsePerformanceMonitorOptions {
  componentName: string;
  onBottleneck?: (bottleneck: PerformanceBottleneck) => void;
  trackMount?: boolean;
  trackRender?: boolean;
}

export function usePerformanceMonitor({
  componentName,
  onBottleneck,
  trackMount = true,
  trackRender = false,
}: UsePerformanceMonitorOptions) {
  const monitor = getPerformanceMonitor();
  const renderCountRef = useRef(0);
  const mountTimeRef = useRef<number>(0);

  // Track component mount
  useEffect(() => {
    if (trackMount) {
      mountTimeRef.current = Date.now();
      monitor.mark(`${componentName}-mount`);

      return () => {
        monitor.measure(`${componentName}-mount`);
        
        const mountDuration = Date.now() - mountTimeRef.current;
        if (mountDuration > 100) {
          console.warn(
            `[Performance] ${componentName} mount took ${mountDuration}ms`
          );
        }
      };
    }
  }, [componentName, trackMount, monitor]);

  // Track renders
  useEffect(() => {
    if (trackRender) {
      renderCountRef.current++;
      
      if (renderCountRef.current > 10) {
        console.warn(
          `[Performance] ${componentName} has rendered ${renderCountRef.current} times`
        );
      }
    }
  });

  // Register bottleneck callback
  useEffect(() => {
    if (onBottleneck) {
      monitor.onBottleneck(onBottleneck);
    }
  }, [onBottleneck, monitor]);

  return {
    mark: (label: string) => monitor.mark(`${componentName}-${label}`),
    measure: (label: string) => monitor.measure(`${componentName}-${label}`),
    renderCount: renderCountRef.current,
  };
}

/**
 * Hook to track async operations performance
 */
export function useAsyncPerformance(operationName: string) {
  const monitor = getPerformanceMonitor();

  const trackAsync = async <T,>(
    operation: () => Promise<T>,
    threshold = 1000
  ): Promise<T> => {
    const startMark = `${operationName}-start`;
    const endMark = `${operationName}-end`;

    monitor.mark(startMark);
    
    try {
      const result = await operation();
      monitor.mark(endMark);
      monitor.measure(operationName);
      
      const entries = performance.getEntriesByName(operationName, 'measure');
      const duration = entries[entries.length - 1]?.duration || 0;
      
      if (duration > threshold) {
        console.warn(
          `[Performance] Async operation "${operationName}" took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
        );
      }
      
      return result;
    } catch (error) {
      monitor.mark(endMark);
      throw error;
    }
  };

  return { trackAsync };
}
