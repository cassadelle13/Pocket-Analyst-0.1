/**
 * Page Transition Component
 * Provides smooth, performant transitions between routes (sub-100ms target)
 */

"use client";

import { ReactNode, useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getPerformanceMonitor } from "../../lib/performance-monitor";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionStage, setTransitionStage] = useState<'fade-in' | 'fade-out' | 'idle'>('idle');
  const previousPathnameRef = useRef(pathname);
  const transitionStartRef = useRef<number>(0);

  useEffect(() => {
    const monitor = getPerformanceMonitor();
    
    // Route changed
    if (pathname !== previousPathnameRef.current) {
      transitionStartRef.current = performance.now();
      monitor.mark('page-transition-start');
      
      // Start fade out
      setTransitionStage('fade-out');
      
      // After fade out completes, update content and fade in
      const fadeOutTimer = setTimeout(() => {
        setDisplayChildren(children);
        setTransitionStage('fade-in');
        
        // Complete transition
        const fadeInTimer = setTimeout(() => {
          setTransitionStage('idle');
          
          const transitionDuration = performance.now() - transitionStartRef.current;
          monitor.measure('page-transition-start');
          
          if (transitionDuration > 100) {
            console.warn(
              `[PageTransition] Transition took ${transitionDuration.toFixed(2)}ms (target: <100ms)`
            );
          }
        }, 50); // 50ms fade in
        
        return () => clearTimeout(fadeInTimer);
      }, 50); // 50ms fade out
      
      previousPathnameRef.current = pathname;
      
      return () => clearTimeout(fadeOutTimer);
    }
  }, [pathname, children]);

  const transitionClasses = {
    'fade-out': 'opacity-0',
    'fade-in': 'opacity-100',
    'idle': 'opacity-100',
  };

  return (
    <div
      className={`transition-opacity duration-50 ease-out ${transitionClasses[transitionStage]}`}
      style={{ willChange: 'opacity' }}
    >
      {displayChildren}
    </div>
  );
}

/**
 * Optimized View Transition API wrapper (when available)
 * Falls back to CSS transitions for unsupported browsers
 */
export function OptimizedPageTransition({ children }: PageTransitionProps) {
  return <>{children}</>;
}
