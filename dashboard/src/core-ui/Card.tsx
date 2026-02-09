/**
 * Core UI Card Component
 * Lightweight replacement for Tremor Card
 */

import { ReactNode, HTMLAttributes } from 'react';
import { cn } from "../lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  decoration?: 'top' | 'left' | 'bottom' | 'right';
  decorationColor?: string;
}

export function Card({ 
  children, 
  className, 
  decoration,
  decorationColor = 'lime-400',
  ...props 
}: CardProps) {
  const decorationClasses = decoration ? {
    top: `border-t-4 border-t-${decorationColor}`,
    left: `border-l-4 border-l-${decorationColor}`,
    bottom: `border-b-4 border-b-${decorationColor}`,
    right: `border-r-4 border-r-${decorationColor}`,
  }[decoration] : '';

  return (
    <div
      className={cn(
        'rounded-lg bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800',
        decorationClasses,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface TitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export function Title({ children, className, ...props }: TitleProps) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold text-slate-900 dark:text-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function Text({ children, className, ...props }: TextProps) {
  return (
    <p
      className={cn(
        'text-sm text-slate-600 dark:text-slate-400',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
}

interface MetricProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function Metric({ children, className, ...props }: MetricProps) {
  return (
    <p
      className={cn(
        'text-3xl font-bold text-slate-900 dark:text-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
}
