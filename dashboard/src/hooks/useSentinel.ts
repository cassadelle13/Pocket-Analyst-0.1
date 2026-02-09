/**
 * React hook for PocketSentinel integration
 * Provides easy access to error tracking and health monitoring
 */

import { useEffect, useState, useCallback } from 'react';
import { getSentinel, type FrontendError } from "../lib/sentinel";

export function useSentinel() {
  const sentinel = getSentinel();
  const [errors, setErrors] = useState<FrontendError[]>([]);
  const [stats, setStats] = useState(sentinel.getStats());

  useEffect(() => {
    // Subscribe to error events
    const unsubscribe = sentinel.onError((error) => {
      setErrors((prev) => [...prev, error]);
      setStats(sentinel.getStats());
    });

    // Initial load
    setErrors(sentinel.getErrors());

    return unsubscribe;
  }, [sentinel]);

  const captureError = useCallback(
    (error: Partial<FrontendError>) => {
      sentinel.captureError({
        type: error.type || 'runtime_error',
        message: error.message || 'Unknown error',
        timestamp: Date.now(),
        severity: error.severity || 'error',
        ...error,
      } as FrontendError);
    },
    [sentinel]
  );

  const clearErrors = useCallback(() => {
    sentinel.clearErrors();
    setErrors([]);
    setStats(sentinel.getStats());
  }, [sentinel]);

  return {
    errors,
    stats,
    captureError,
    clearErrors,
    getCriticalErrors: () => sentinel.getCriticalErrors(),
    getErrorsByType: (type: FrontendError['type']) => sentinel.getErrorsByType(type),
  };
}
