"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StepId = string;

export type StaggeredInitStep = {
  id: StepId;
  delayMs: number;
};

export type UseStaggeredInitOptions = {
  steps: Array<StepId | StaggeredInitStep>;
  onStepComplete?: (stepId: StepId) => void;
};

export type UseStaggeredInitResult = {
  isStepReady: (stepId: StepId) => boolean;
  readySteps: Set<StepId>;
};

function normalizeSteps(steps: Array<StepId | StaggeredInitStep>): StaggeredInitStep[] {
  let accDelay = 0;
  return steps.map((s) => {
    if (typeof s === "string") {
      accDelay += 120;
      return { id: s, delayMs: accDelay };
    }
    return s;
  });
}

export function useStaggeredInit(options: UseStaggeredInitOptions): UseStaggeredInitResult {
  const { steps, onStepComplete } = options;

  const normalized = useMemo(() => normalizeSteps(steps), [steps]);
  const [ready, setReady] = useState<Set<StepId>>(() => new Set());

  const timeoutsRef = useRef<number[]>([]);
  const onStepCompleteRef = useRef(onStepComplete);
  onStepCompleteRef.current = onStepComplete;

  useEffect(() => {
    timeoutsRef.current.forEach((t: number) => window.clearTimeout(t));
    timeoutsRef.current = [];
    setReady(new Set());

    normalized.forEach((step: StaggeredInitStep) => {
      const t = window.setTimeout(() => {
        setReady((prev: Set<StepId>) => {
          const next = new Set(prev);
          next.add(step.id);
          return next;
        });
        onStepCompleteRef.current?.(step.id);
      }, Math.max(0, step.delayMs));
      timeoutsRef.current.push(t);
    });

    return () => {
      timeoutsRef.current.forEach((t: number) => window.clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, [normalized]);

  return {
    isStepReady: (stepId) => ready.has(stepId),
    readySteps: ready,
  };
}

export const INIT_SEQUENCES = {
  analytics: [
    "filters",
    "trend",
    "funnel",
    "retention",
    "devices",
    "traffic",
    "user-flows",
    "summary",
  ] as Array<StepId | StaggeredInitStep>,
};
