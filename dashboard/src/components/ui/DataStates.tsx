"use client";

import type React from "react";
import { Title, Text, Button } from "@tremor/react";
import { RefreshCwIcon, AlertTriangleIcon, InboxIcon } from "lucide-react";

interface LoadingStateProps {
  title?: string;
  message?: string;
  size?: "sm" | "md" | "lg";
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  size?: "sm" | "md" | "lg";
}

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ComponentType<any>;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: "sm" | "md" | "lg";
}

export function LoadingState({ 
  title = "Loading...", 
  message = "Please wait while we fetch your data", 
  size = "md" 
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8"
  };

  const titleSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl"
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 border-t-transparent"></div>
        </div>
        <Title className={`${titleSizes[size]} text-white`}>{title}</Title>
        <Text className="text-slate-400 mt-2">{message}</Text>
      </div>
    </div>
  );
}

export function ErrorState({ 
  title = "Something went wrong", 
  message = "We couldn't load your data. Please try again.", 
  error,
  onRetry,
  size = "md" 
}: ErrorStateProps) {
  const sizeClasses = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8"
  };

  const titleSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl"
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
          <AlertTriangleIcon className="h-8 w-8 text-red-400" />
        </div>
        <Title className={`${titleSizes[size]} text-white`}>{title}</Title>
        <Text className="text-slate-400 mt-2">{message}</Text>
        
        {!!error && (
          <details className="mt-4 text-left">
            <summary className="text-slate-500 text-sm cursor-pointer hover:text-slate-400">
              Technical details
            </summary>
            <pre className="mt-2 p-2 bg-slate-800 rounded text-xs text-slate-300 overflow-auto max-h-32">
              {error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}
            </pre>
          </details>
        )}
        
        {onRetry && (
          <div className="mt-4">
            <Button
              variant="secondary"
              icon={RefreshCwIcon}
              onClick={onRetry}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ 
  title = "No data available", 
  message = "There's nothing to show here yet.", 
  icon: Icon = InboxIcon,
  action,
  size = "md" 
}: EmptyStateProps) {
  const sizeClasses = {
    sm: "p-4",
    md: "p-6",
    lg: "p-8"
  };

  const titleSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl"
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-12 h-12 mb-4">
          <Icon className="h-8 w-8 text-slate-400" />
        </div>
        <Title className={`${titleSizes[size]} text-white`}>{title}</Title>
        <Text className="text-slate-400 mt-2">{message}</Text>
        
        {action && (
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={action.onClick}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper component for data states
interface DataStateProps {
  isLoading?: boolean;
  error?: unknown;
  data?: any[] | null;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  children?: React.ReactNode;
  loadingTitle?: string;
  loadingMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  size?: "sm" | "md" | "lg";
}

export function DataState({
  isLoading = false,
  error,
  data,
  loadingComponent,
  errorComponent,
  emptyComponent,
  children,
  loadingTitle,
  loadingMessage,
  errorTitle,
  errorMessage,
  emptyTitle,
  emptyMessage,
  onRetry,
  size = "md"
}: DataStateProps) {
  if (isLoading) {
    return loadingComponent || <LoadingState title={loadingTitle} message={loadingMessage} size={size} />;
  }

  if (error) {
    return errorComponent || <ErrorState 
      title={errorTitle} 
      message={errorMessage} 
      error={error} 
      onRetry={onRetry} 
      size={size} 
    />;
  }

  if (!data || data.length === 0) {
    return emptyComponent || <EmptyState 
      title={emptyTitle} 
      message={emptyMessage} 
      size={size} 
    />;
  }

  return <>{children}</>;
}
