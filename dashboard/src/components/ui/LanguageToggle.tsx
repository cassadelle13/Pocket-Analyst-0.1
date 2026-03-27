"use client";

import { useState, useEffect } from "react";
import { Globe } from "lucide-react";

type Language = "ru" | "en";

const LANGUAGE_LABELS = {
  ru: "RU",
  en: "EN",
} as const;

const LANGUAGE_NAMES = {
  ru: "Русский",
  en: "English",
} as const;

interface LanguageToggleProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function LanguageToggle({ 
  className = "", 
  size = "md",
  showLabel = false 
}: LanguageToggleProps) {
  const [language, setLanguage] = useState<Language>("ru");

  // Load language from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pocketanalyst:language") as Language;
      if (saved === "ru" || saved === "en") {
        setLanguage(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save language to localStorage when changed
  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    try {
      localStorage.setItem("pocketanalyst:language", newLanguage);
      // Dispatch custom event for other components to listen to
      window.dispatchEvent(new CustomEvent("language:changed", { 
        detail: { language: newLanguage } 
      }));
    } catch {
      // Ignore localStorage errors
    }
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm", 
    lg: "px-4 py-2 text-base",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <span className="text-xs text-slate-400 font-medium">
          {LANGUAGE_NAMES[language]}
        </span>
      )}
      
      <div className="flex items-center bg-white/10 border border-white/20 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => handleLanguageChange("ru")}
          className={`
            ${sizeClasses[size]}
            flex items-center gap-1.5 font-medium transition-all duration-200
            ${language === "ru" 
              ? "bg-blue-500/30 text-blue-300 border border-blue-400/30" 
              : "text-slate-400 hover:text-white hover:bg-white/10"
            }
          `}
          title="Русский язык"
        >
          <Globe className={iconSizes[size]} />
          <span>{LANGUAGE_LABELS.ru}</span>
        </button>
        
        <div className="w-px h-4 bg-white/20" />
        
        <button
          type="button"
          onClick={() => handleLanguageChange("en")}
          className={`
            ${sizeClasses[size]}
            flex items-center gap-1.5 font-medium transition-all duration-200
            ${language === "en" 
              ? "bg-blue-500/30 text-blue-300 border border-blue-400/30" 
              : "text-slate-400 hover:text-white hover:bg-white/10"
            }
          `}
          title="English language"
        >
          <Globe className={iconSizes[size]} />
          <span>{LANGUAGE_LABELS.en}</span>
        </button>
      </div>
    </div>
  );
}
