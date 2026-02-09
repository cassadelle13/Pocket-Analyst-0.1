/**
 * React hook for Web Worker integration
 * Provides easy interface for offloading heavy computations
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { WorkerRequest, WorkerResponse } from "../lib/workers/data-processor.worker";

interface UseWorkerOptions {
  onError?: (error: string) => void;
}

export function useWorker(options?: UseWorkerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, (result: any) => void>>(new Map());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Create worker
    try {
      workerRef.current = new Worker(
        new URL('../lib/workers/data-processor.worker.ts', import.meta.url),
        { type: 'module' }
      );

      workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, payload, error } = event.data;
        const resolver = pendingRequests.current.get(id);

        if (resolver) {
          if (error) {
            options?.onError?.(error);
            resolver(null);
          } else {
            resolver(payload);
          }
          pendingRequests.current.delete(id);
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('[useWorker] Worker error:', error);
        options?.onError?.(error.message);
      };

      setIsReady(true);
    } catch (error) {
      console.error('[useWorker] Failed to create worker:', error);
      options?.onError?.('Failed to initialize worker');
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRequests.current.clear();
    };
  }, []);

  const postMessage = useCallback(
    <T = any>(type: WorkerRequest['type'], payload: any): Promise<T> => {
      return new Promise((resolve) => {
        if (!workerRef.current) {
          console.warn('[useWorker] Worker not ready');
          resolve(null as T);
          return;
        }

        const id = `${type}_${Date.now()}_${Math.random()}`;
        pendingRequests.current.set(id, resolve);

        const request: WorkerRequest = { type, payload, id };
        workerRef.current.postMessage(request);
      });
    },
    []
  );

  const transformSankey = useCallback(
    (flows: any[]) => {
      return postMessage<{ nodes: any[]; links: any[] }>('transform_sankey', { flows });
    },
    [postMessage]
  );

  const filterEvents = useCallback(
    (events: any[], filters: any) => {
      return postMessage<any[]>('filter_events', { events, filters });
    },
    [postMessage]
  );

  const calculateForecast = useCallback(
    (historicalData: any[], forecastDays: number) => {
      return postMessage<any[]>('calculate_forecast', { historicalData, forecastDays });
    },
    [postMessage]
  );

  const processRetention = useCallback(
    (cohorts: any[]) => {
      return postMessage<any[]>('process_retention', { cohorts });
    },
    [postMessage]
  );

  return {
    isReady,
    transformSankey,
    filterEvents,
    calculateForecast,
    processRetention,
  };
}
