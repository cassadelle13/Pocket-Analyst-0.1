"use client";

import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  allowAuto?: boolean;
}

export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  unit,
  allowAuto = false,
}: NumberInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const [isAuto, setIsAuto] = useState(false);

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    if (newValue === '' || newValue === '-') return;
    
    const num = parseFloat(newValue);
    if (!isNaN(num)) {
      let finalValue = num;
      if (min !== undefined && num < min) finalValue = min;
      if (max !== undefined && num > max) finalValue = max;
      onChange(finalValue);
    }
  };

  const handleIncrement = () => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  const handleDecrement = () => {
    const newValue = value - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  const handleAutoToggle = () => {
    if (allowAuto) {
      setIsAuto(!isAuto);
      // TODO: Handle auto value
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-300">{label}</label>
          {allowAuto && (
            <button
              type="button"
              onClick={handleAutoToggle}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                isAuto
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Auto
            </button>
          )}
        </div>
      )}
      
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={min !== undefined && value <= min}
          className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/20 rounded-lg transition-colors"
        >
          <Minus className="w-3 h-3 text-slate-300" />
        </button>
        
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={() => setInputValue(String(value))}
            disabled={isAuto}
            className="w-full bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-blue-400 disabled:opacity-50"
          />
          {unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
              {unit}
            </span>
          )}
        </div>
        
        <button
          type="button"
          onClick={handleIncrement}
          disabled={max !== undefined && value >= max}
          className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/20 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3 text-slate-300" />
        </button>
      </div>
      
      {(min !== undefined || max !== undefined) && (
        <div className="flex justify-between text-xs text-slate-500">
          <span>{min !== undefined ? `Min: ${min}` : ''}</span>
          <span>{max !== undefined ? `Max: ${max}` : ''}</span>
        </div>
      )}
    </div>
  );
}
