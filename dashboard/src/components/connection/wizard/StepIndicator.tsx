import { CheckCircle2, Circle } from "lucide-react";
import { WIZARD_STEPS } from "../../../hooks/useWizardState";

interface StepIndicatorProps {
  steps?: typeof WIZARD_STEPS;
  currentStep: number;
  onSelectStep?: (index: number) => void;
}

export function StepIndicator({ steps = WIZARD_STEPS, currentStep, onSelectStep }: StepIndicatorProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isClickable = typeof onSelectStep === "function" && index <= currentStep;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => isClickable && onSelectStep?.(index)}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition-all flex items-center gap-3 ${
              isActive
                ? "border-emerald-400/60 bg-emerald-500/10"
                : isCompleted
                  ? "border-white/30 bg-white/5"
                  : "border-white/10 bg-transparent"
            } ${isClickable ? "hover:border-emerald-400/80" : "cursor-default"}`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-300"
                  : isCompleted
                    ? "bg-emerald-500/30 text-emerald-100"
                    : "bg-white/5 text-slate-500"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Step {index + 1}</p>
              <p className="text-sm font-medium text-white">{step.label}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
