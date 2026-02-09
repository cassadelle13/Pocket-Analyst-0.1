/**
 * React Error Boundary
 * Integrates with PocketSentinel to capture React component errors
 */

"use client";

import { Component, ReactNode, ErrorInfo } from 'react';
import { getSentinel } from '../lib/sentinel';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to PocketSentinel
    const sentinel = getSentinel();
    sentinel.captureReactError(error, {
      componentStack: errorInfo.componentStack || undefined,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-2xl">🚨</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
                <p className="text-sm text-slate-400">The application encountered an error</p>
              </div>
            </div>

            <div className="bg-slate-950 rounded p-3 mb-4">
              <p className="text-xs text-red-400 font-mono break-words">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-lime-500 text-slate-900 rounded-lg font-medium hover:bg-lime-400 transition-colors"
            >
              Reload Application
            </button>

            <p className="text-xs text-slate-500 mt-3 text-center">
              This error has been reported to our monitoring system
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
