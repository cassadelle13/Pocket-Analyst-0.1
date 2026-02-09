"use client";

interface ToggleSwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
}

export function ToggleSwitch({ value, onChange, label, description }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        {label && <label className="text-sm font-medium text-slate-300">{label}</label>}
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? 'bg-blue-500' : 'bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
