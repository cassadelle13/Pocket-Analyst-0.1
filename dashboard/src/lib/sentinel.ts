/**
 * PocketSentinel - Global Error Tracking & Health Monitoring
 * Captures unhandled errors, React errors, and critical frontend issues
 * Integrates with anomaly detection system for Dashboard visibility
 */

export interface FrontendError {
  type: 'unhandled_rejection' | 'react_error' | 'runtime_error' | 'network_error';
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  severity: 'critical' | 'error' | 'warning';
  metadata?: Record<string, unknown>;
  url?: string;
  userAgent?: string;
}

export interface SentinelConfig {
  enabled: boolean;
  reportToBackend: boolean;
  logToConsole: boolean;
  maxErrorsStored: number;
  alertThreshold: number; // Number of errors before triggering anomaly
  alertWindow: number; // Time window in ms for threshold
}

class PocketSentinel {
  private errors: FrontendError[] = [];
  private config: SentinelConfig = {
    enabled: true,
    reportToBackend: true,
    logToConsole: true,
    maxErrorsStored: 100,
    alertThreshold: 5,
    alertWindow: 60000, // 1 minute
  };
  private errorCallbacks: Array<(error: FrontendError) => void> = [];
  private initialized = false;

  constructor(config?: Partial<SentinelConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Initialize global error handlers
   */
  public init() {
    if (this.initialized || typeof window === 'undefined') return;

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      this.config.reportToBackend = false;
    }

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;

      // Ignore DOM Event objects that accidentally end up as rejection reasons
      if (reason instanceof Event) {
        event.preventDefault();
        return;
      }

      const isAbortError =
        reason?.name === "AbortError" ||
        String(reason?.message || "").includes("aborted");
      if (isAbortError) return;

      this.captureError({
        type: 'unhandled_rejection',
        message: reason?.message || String(reason),
        stack: reason?.stack,
        timestamp: Date.now(),
        severity: 'critical',
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    });

    // Capture global errors
    window.addEventListener('error', (event) => {
      // Ignore script loading errors from browser extensions
      if (event.filename?.includes('extension://')) return;

      this.captureError({
        type: 'runtime_error',
        message: event.message,
        stack: event.error?.stack,
        timestamp: Date.now(),
        severity: 'error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    });

    // Capture network errors
    this.interceptFetch();

    this.initialized = true;

    if (this.config.logToConsole) {
      console.log('[PocketSentinel] Initialized - Global error tracking active');
    }
  }

  /**
   * Intercept fetch to capture network errors
   */
  private interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        const requestUrl =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "";
        
        // Track 5xx errors as network errors
        const isExpectedBackendError =
          requestUrl.includes("/api/insights") ||
          requestUrl.includes("/api/rest/events-table");

        if (response.status >= 500 && !isExpectedBackendError) {
          this.captureError({
            type: 'network_error',
            message: `Network error: ${response.status} ${response.statusText}`,
            timestamp: Date.now(),
            severity: 'error',
            metadata: {
              url: requestUrl,
              status: response.status,
              statusText: response.statusText,
            },
            url: window.location.href,
            userAgent: navigator.userAgent,
          });
        }

        return response;
      } catch (error: any) {
        const isAbortError =
          error?.name === "AbortError" ||
          error?.cause?.name === "AbortError" ||
          String(error?.message || "").toLowerCase().includes("aborted") ||
          String(error?.message || "").includes("AbortError") ||
          String(error?.cause?.message || "").toLowerCase().includes("aborted");

        if (!isAbortError) {
          this.captureError({
            type: 'network_error',
            message: `Network request failed: ${error.message}`,
            stack: error.stack,
            timestamp: Date.now(),
            severity: 'error',
            metadata: {
              url: args[0],
            },
            url: window.location.href,
            userAgent: navigator.userAgent,
          });
        }
        throw error;
      }
    };
  }

  /**
   * Capture React component errors
   */
  public captureReactError(error: Error, errorInfo: { componentStack?: string }) {
    this.captureError({
      type: 'react_error',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: Date.now(),
      severity: 'critical',
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }

  /**
   * Manually capture an error
   */
  public captureError(error: FrontendError) {
    if (!this.config.enabled) return;

    const isAbortError =
      error.type === 'network_error' &&
      (error.message.includes('aborted') || error.message.includes('AbortError'));
    if (isAbortError) return;

    // Filter out expected backend unavailability errors
    const isExpectedBackendError = 
      error.type === 'network_error' && 
      (error.message.includes('ClickHouse') || 
       error.message.includes('AI Service') ||
       error.message.includes('localhost:8123') ||
       error.message.includes('localhost:8000') ||
       String(error.metadata?.url || '').includes('localhost:8000') ||
       String(error.metadata?.url || '').includes('/api/s/s2s/track') ||
       String(error.metadata?.url || '').includes('/api/insights') ||
       String(error.metadata?.url || '').includes('/api/rest/events-table'));

    // Store error
    this.errors.push(error);
    if (this.errors.length > this.config.maxErrorsStored) {
      this.errors.shift();
    }

    // Log to console (skip expected backend errors in dev)
    if (this.config.logToConsole && !isExpectedBackendError) {
      const emoji = error.severity === 'critical' ? '🚨' : error.severity === 'error' ? '❌' : '⚠️';
      console.error(
        `${emoji} [PocketSentinel] ${error.type}:`,
        error.message,
        error.stack || error.componentStack || ''
      );
    }

    // Trigger callbacks
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (e) {
        console.error('[PocketSentinel] Error in callback:', e);
      }
    });

    // Check if we should trigger anomaly alert
    this.checkAnomalyThreshold();

    // Report to backend
    if (this.config.reportToBackend) {
      this.reportToBackend(error);
    }
  }

  /**
   * Check if error rate exceeds threshold and trigger anomaly
   */
  private checkAnomalyThreshold() {
    const now = Date.now();
    const recentErrors = this.errors.filter(
      (err) => now - err.timestamp < this.config.alertWindow
    );

    if (recentErrors.length >= this.config.alertThreshold) {
      this.triggerHealthAnomaly(recentErrors);
    }
  }

  /**
   * Trigger Frontend Health Anomaly
   */
  private async triggerHealthAnomaly(errors: FrontendError[]) {
    const criticalCount = errors.filter((e) => e.severity === 'critical').length;
    const errorCount = errors.filter((e) => e.severity === 'error').length;

    const anomaly = {
      type: 'frontend_health',
      severity: criticalCount > 0 ? 'critical' : 'warning',
      message: `Frontend health degraded: ${errors.length} errors in last ${this.config.alertWindow / 1000}s`,
      metadata: {
        total_errors: errors.length,
        critical_errors: criticalCount,
        error_errors: errorCount,
        error_types: [...new Set(errors.map((e) => e.type))],
        most_recent: errors[errors.length - 1],
      },
      timestamp: Date.now(),
    };

    try {
      await fetch('/api/rest/anomalies/frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(anomaly),
      });

      if (this.config.logToConsole) {
        console.warn('[PocketSentinel] 🚨 Frontend Health Anomaly triggered:', anomaly);
      }
    } catch (error) {
      console.error('[PocketSentinel] Failed to report anomaly:', error);
    }
  }

  /**
   * Report error to backend
   */
  private async reportToBackend(error: FrontendError) {
    try {
      await fetch('/api/rest/errors/frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
      });
    } catch (e) {
      // Silently fail - don't want to create error loop
      if (this.config.logToConsole) {
        console.warn('[PocketSentinel] Failed to report error to backend:', e);
      }
    }
  }

  /**
   * Register callback for error events
   */
  public onError(callback: (error: FrontendError) => void) {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get all captured errors
   */
  public getErrors(): FrontendError[] {
    return [...this.errors];
  }

  /**
   * Get errors by type
   */
  public getErrorsByType(type: FrontendError['type']): FrontendError[] {
    return this.errors.filter((err) => err.type === type);
  }

  /**
   * Get critical errors
   */
  public getCriticalErrors(): FrontendError[] {
    return this.errors.filter((err) => err.severity === 'critical');
  }

  /**
   * Clear all errors
   */
  public clearErrors() {
    this.errors = [];
  }

  /**
   * Get error statistics
   */
  public getStats() {
    const now = Date.now();
    const last5min = this.errors.filter((e) => now - e.timestamp < 300000);
    const last1hour = this.errors.filter((e) => now - e.timestamp < 3600000);

    return {
      total: this.errors.length,
      last_5min: last5min.length,
      last_1hour: last1hour.length,
      critical: this.errors.filter((e) => e.severity === 'critical').length,
      by_type: {
        unhandled_rejection: this.getErrorsByType('unhandled_rejection').length,
        react_error: this.getErrorsByType('react_error').length,
        runtime_error: this.getErrorsByType('runtime_error').length,
        network_error: this.getErrorsByType('network_error').length,
      },
    };
  }

  /**
   * Update configuration
   */
  public configure(config: Partial<SentinelConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Destroy sentinel and cleanup
   */
  public destroy() {
    this.errors = [];
    this.errorCallbacks = [];
    this.initialized = false;
  }
}

// Singleton instance
let sentinelInstance: PocketSentinel | null = null;

export function getSentinel(config?: Partial<SentinelConfig>): PocketSentinel {
  if (!sentinelInstance) {
    sentinelInstance = new PocketSentinel(config);
  }
  return sentinelInstance;
}

export function destroySentinel() {
  if (sentinelInstance) {
    sentinelInstance.destroy();
    sentinelInstance = null;
  }
}

// Auto-initialize in browser
if (typeof window !== 'undefined') {
  const sentinel = getSentinel();
  sentinel.init();
}
