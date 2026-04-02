type Listener<T> = (payload: T) => void;

class DashboardEventBus<TEvents extends Record<string, any>> {
  private listeners = new Map<keyof TEvents, Set<Listener<any>>>();
  private lastValue = new Map<keyof TEvents, any>();

  publish<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    this.lastValue.set(event, payload);
    const subs = this.listeners.get(event);
    if (!subs) return;
    for (const fn of subs) {
      try {
        fn(payload);
      } catch {
        // Swallow listener errors so one consumer doesn't break others.
      }
    }
  }

  subscribe<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
    const subs = this.listeners.get(event) ?? new Set<Listener<TEvents[K]>>();
    subs.add(listener);
    this.listeners.set(event, subs as Set<Listener<any>>);
    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(listener as Listener<any>);
      if (current.size === 0) this.listeners.delete(event);
    };
  }

  getLastValue<K extends keyof TEvents>(event: K): TEvents[K] | undefined {
    return this.lastValue.get(event);
  }
}

export type DashboardBusEvents = {
  activeChartChanged: { chartId: string | null; chartData: any | null; activeTabId: string | null };
  activeTabChanged: { tabId: string | null };
};

export const dashboardEventBus = new DashboardEventBus<DashboardBusEvents>();
