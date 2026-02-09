/**
 * PocketSentinel Performance Monitor
 * Tracks Long Tasks (>100ms) and reports performance bottlenecks to anomaly system
 */

export interface PerformanceBottleneck {
  type: 'long_task' | 'memory_pressure' | 'layout_shift';
  duration: number;
  timestamp: number;
  component?: string;
  severity: 'warning' | 'critical';
}

export interface MemoryPressureEvent {
  type: 'MEMORY_PRESSURE_RELIEF';
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
  timestamp: number;
  actions: string[];
}

// Global registry for disposable chart instances
interface DisposableChart {
  id: string;
  dispose: () => void;
  isVisible: () => boolean;
  lastAccessed: number;
}

class PerformanceMonitor {
  private observer: PerformanceObserver | null = null;
  private bottlenecks: PerformanceBottleneck[] = [];
  private readonly LONG_TASK_THRESHOLD = 100; // ms
  private readonly MAX_BOTTLENECKS = 50;
  private readonly MEMORY_THRESHOLD = 500 * 1024 * 1024; // 500MB
  private onBottleneckCallback?: (bottleneck: PerformanceBottleneck) => void;
  private onMemoryPressureCallback?: (event: MemoryPressureEvent) => void;
  private chartRegistry = new Map<string, DisposableChart>();
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.initLongTaskObserver();
    this.initMemoryMonitor();
  }

  private initLongTaskObserver() {
    if (!('PerformanceObserver' in window)) {
      console.warn('[PocketSentinel] PerformanceObserver not supported');
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > this.LONG_TASK_THRESHOLD) {
            const bottleneck: PerformanceBottleneck = {
              type: 'long_task',
              duration: entry.duration,
              timestamp: Date.now(),
              component: this.detectComponent(entry),
              severity: entry.duration > 300 ? 'critical' : 'warning',
            };

            this.recordBottleneck(bottleneck);

            // Log to console in dev
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                `[PocketSentinel] Long Task detected: ${entry.duration.toFixed(2)}ms`,
                bottleneck
              );
            }
          }
        }
      });

      this.observer.observe({ entryTypes: ['longtask', 'measure'] });
    } catch (error) {
      console.error('[PocketSentinel] Failed to initialize Long Task observer:', error);
    }
  }

  private initMemoryMonitor() {
    if (typeof window === 'undefined') return;

    // @ts-ignore - performance.memory is non-standard
    if (!performance.memory) {
      console.warn('[PocketSentinel] performance.memory not available');
      return;
    }

    this.memoryCheckInterval = setInterval(() => {
      // @ts-ignore
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
      
      // Check absolute threshold (500MB) and percentage threshold (90%)
      const usagePercentage = (usedJSHeapSize / jsHeapSizeLimit) * 100;
      const exceedsAbsoluteThreshold = usedJSHeapSize > this.MEMORY_THRESHOLD;
      const exceedsPercentageThreshold = usagePercentage > 90;

      if (exceedsAbsoluteThreshold || exceedsPercentageThreshold) {
        this.handleMemoryPressure(usedJSHeapSize, jsHeapSizeLimit, usagePercentage);
      }
    }, 5000); // Check every 5 seconds
  }

  private handleMemoryPressure(usedJSHeapSize: number, jsHeapSizeLimit: number, usagePercentage: number) {
    const actions: string[] = [];
    const now = Date.now();

    // 1. Dispose invisible charts
    const invisibleCharts: string[] = [];
    this.chartRegistry.forEach((chart, id) => {
      if (!chart.isVisible() || (now - chart.lastAccessed) > 30000) { // 30 seconds inactive
        try {
          chart.dispose();
          invisibleCharts.push(id);
          actions.push(`Disposed chart: ${id}`);
        } catch (error) {
          console.error(`[PocketSentinel] Failed to dispose chart ${id}:`, error);
        }
      }
    });

    // Remove disposed charts from registry
    invisibleCharts.forEach(id => this.chartRegistry.delete(id));

    // 2. Clear LRU cache if available
    if (typeof window !== 'undefined' && (window as any).lruCache) {
      try {
        (window as any).lruCache.clear();
        actions.push('Cleared LRU cache');
      } catch (error) {
        console.error('[PocketSentinel] Failed to clear LRU cache:', error);
      }
    }

    // 3. Force garbage collection if available (development only)
    if (typeof window !== 'undefined' && (window as any).gc && process.env.NODE_ENV === 'development') {
      try {
        (window as any).gc();
        actions.push('Forced garbage collection');
      } catch (error) {
        console.error('[PocketSentinel] Failed to force GC:', error);
      }
    }

    // 4. Create memory pressure event
    const memoryEvent: MemoryPressureEvent = {
      type: 'MEMORY_PRESSURE_RELIEF',
      usedJSHeapSize,
      jsHeapSizeLimit,
      usagePercentage,
      timestamp: now,
      actions,
    };

    // 5. Log to console
    console.warn(
      `[PocketSentinel] Memory pressure relief triggered: ${usagePercentage.toFixed(1)}% (${(usedJSHeapSize / 1024 / 1024).toFixed(1)}MB)`,
      { actions, memoryEvent }
    );

    // 6. Record as bottleneck
    const bottleneck: PerformanceBottleneck = {
      type: 'memory_pressure',
      duration: usagePercentage,
      timestamp: now,
      severity: 'critical',
    };
    this.recordBottleneck(bottleneck);

    // 7. Trigger memory pressure callback
    this.onMemoryPressureCallback?.(memoryEvent);

    // 8. Send to PocketSentinel if available
    if (typeof window !== 'undefined' && (window as any).PocketSentinel) {
      try {
        (window as any).PocketSentinel.captureError({
          type: 'runtime_error',
          message: `Memory pressure relief: ${usagePercentage.toFixed(1)}%`,
          timestamp: now,
          severity: 'warning',
          metadata: {
            usedJSHeapSize,
            jsHeapSizeLimit,
            usagePercentage,
            actions,
          },
        });
      } catch (error) {
        console.error('[PocketSentinel] Failed to report to PocketSentinel:', error);
      }
    }
  }

  private detectComponent(entry: PerformanceEntry): string {
    // Try to extract component name from entry name
    const name = entry.name || '';
    if (name.includes('Analytics')) return 'Analytics';
    if (name.includes('Dashboard')) return 'Dashboard';
    if (name.includes('Chart')) return 'Chart';
    if (name.includes('Table')) return 'Table';
    return 'Unknown';
  }

  private recordBottleneck(bottleneck: PerformanceBottleneck) {
    this.bottlenecks.push(bottleneck);

    // Keep only last N bottlenecks
    if (this.bottlenecks.length > this.MAX_BOTTLENECKS) {
      this.bottlenecks.shift();
    }

    // Trigger callback if registered
    this.onBottleneckCallback?.(bottleneck);
  }

  public onBottleneck(callback: (bottleneck: PerformanceBottleneck) => void) {
    this.onBottleneckCallback = callback;
  }

  public onMemoryPressure(callback: (event: MemoryPressureEvent) => void) {
    this.onMemoryPressureCallback = callback;
  }

  /**
   * Register a chart for memory management
   */
  public registerChart(id: string, dispose: () => void, isVisible: () => boolean): void {
    this.chartRegistry.set(id, {
      id,
      dispose,
      isVisible,
      lastAccessed: Date.now(),
    });
  }

  /**
   * Unregister a chart from memory management
   */
  public unregisterChart(id: string): void {
    this.chartRegistry.delete(id);
  }

  /**
   * Update chart access time (keeps chart from being disposed)
   */
  public updateChartAccess(id: string): void {
    const chart = this.chartRegistry.get(id);
    if (chart) {
      chart.lastAccessed = Date.now();
    }
  }

  /**
   * Get current memory usage statistics
   */
  public getMemoryStats(): { used: number; limit: number; percentage: number } | null {
    if (typeof window === 'undefined') return null;
    
    // @ts-ignore - performance.memory is non-standard
    if (!performance.memory) return null;

    // @ts-ignore
    const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
    return {
      used: usedJSHeapSize,
      limit: jsHeapSizeLimit,
      percentage: (usedJSHeapSize / jsHeapSizeLimit) * 100,
    };
  }

  /**
   * Get registered charts count
   */
  public getRegisteredChartsCount(): number {
    return this.chartRegistry.size;
  }

  public getBottlenecks(): PerformanceBottleneck[] {
    return [...this.bottlenecks];
  }

  public getCriticalBottlenecks(): PerformanceBottleneck[] {
    return this.bottlenecks.filter((b) => b.severity === 'critical');
  }

  public clearBottlenecks() {
    this.bottlenecks = [];
  }

  public destroy() {
    this.observer?.disconnect();
    this.observer = null;
    this.bottlenecks = [];
    
    // Clear memory check interval
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    // Dispose all registered charts
    this.chartRegistry.forEach((chart, id) => {
      try {
        chart.dispose();
      } catch (error) {
        console.error(`[PocketSentinel] Failed to dispose chart ${id} during destroy:`, error);
      }
    });
    this.chartRegistry.clear();
  }

  /**
   * Mark the start of a performance-critical operation
   */
  public mark(name: string) {
    if (typeof window === 'undefined') return;
    performance.mark(`${name}-start`);
  }

  /**
   * Mark the end of a performance-critical operation and measure duration
   */
  public measure(name: string) {
    if (typeof window === 'undefined') return;
    
    try {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name, 'measure')[0];
      if (measure && measure.duration > this.LONG_TASK_THRESHOLD) {
        const bottleneck: PerformanceBottleneck = {
          type: 'long_task',
          duration: measure.duration,
          timestamp: Date.now(),
          component: name,
          severity: measure.duration > 300 ? 'critical' : 'warning',
        };
        this.recordBottleneck(bottleneck);
      }

      // Cleanup marks
      performance.clearMarks(`${name}-start`);
      performance.clearMarks(`${name}-end`);
      performance.clearMeasures(name);
    } catch (error) {
      console.error('[PocketSentinel] Failed to measure:', error);
    }
  }
}

// Singleton instance
let monitorInstance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new PerformanceMonitor();
  }
  return monitorInstance;
}

export function destroyPerformanceMonitor() {
  if (monitorInstance) {
    monitorInstance.destroy();
    monitorInstance = null;
  }
}
