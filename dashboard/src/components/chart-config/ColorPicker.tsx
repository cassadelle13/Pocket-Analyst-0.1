"use client";

import { useState, useRef, useEffect } from "react";
import { Pipette } from "lucide-react";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  showGradient?: boolean;
}

export function ColorPicker({ value, onChange, label, showGradient = false }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue) || /^rgba?\(/.test(newValue)) {
      onChange(newValue);
    }
  };

  const presetColors = [
    "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
    "#06b6d4", "#84cc16", "#f97316", "#a855f7", "#14b8a6", "#f43f5e",
    "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0", "#f1f5f9", "#ffffff",
  ];

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-medium text-slate-300">{label}</label>}
      <div ref={ref} className="relative">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-10 h-10 rounded-lg border-2 border-white/20 shadow-lg transition-transform hover:scale-105"
            style={{ backgroundColor: value }}
            title="Pick color"
          >
            <Pipette className="w-4 h-4 mx-auto text-white drop-shadow-lg" />
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={() => setInputValue(value)}
            className="flex-1 bg-white/5 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            placeholder="#000000"
          />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 z-50 backdrop-blur-xl bg-slate-900/95 border border-white/20 rounded-xl shadow-2xl p-4 w-64">
            <div className="grid grid-cols-6 gap-2 mb-3">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onChange(color);
                    setIsOpen(false);
                  }}
                  className="w-8 h-8 rounded-lg border-2 border-white/20 transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Custom Color</label>
              <input
                type="color"
                value={value.startsWith('#') ? value : '#000000'}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer"
              />
            </div>

            {showGradient && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  onClick={() => {
                    // TODO: Open gradient editor
                    console.log("Gradient editor");
                  }}
                >
                  Create Gradient
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
