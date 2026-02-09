"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
}

export function SelectDropdown({ value, onChange, options, label, placeholder }: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-slate-300">{label}</label>}
      
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm hover:bg-white/10 transition-colors"
        >
          <span className={selectedOption ? 'text-white' : 'text-slate-400'}>
            {selectedOption?.label || placeholder || 'Select...'}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 backdrop-blur-xl bg-slate-900/95 border border-white/20 rounded-lg shadow-2xl py-1 max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <span>{option.label}</span>
                {value === option.value && <Check className="w-4 h-4 text-blue-400" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
