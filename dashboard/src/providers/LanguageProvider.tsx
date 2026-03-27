"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Language = "ru" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (translations: { ru: string; en: string }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
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

  // Handle language changes from other components
  useEffect(() => {
    const handleLanguageChange = (event: CustomEvent) => {
      setLanguage(event.detail.language);
    };

    window.addEventListener("language:changed", handleLanguageChange as EventListener);
    return () => {
      window.removeEventListener("language:changed", handleLanguageChange as EventListener);
    };
  }, []);

  const changeLanguage = (newLanguage: Language) => {
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

  const t = (translations: { ru: string; en: string }) => {
    return translations[language] || translations.ru;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Common translations
export const TRANSLATIONS = {
  // Database Explorer
  databaseExplorer: {
    ru: "Database Explorer",
    en: "Database Explorer"
  },
  manageConnections: {
    ru: "Manage connections & explore schema",
    en: "Manage connections & explore schema"
  },
  searchSchemas: {
    ru: "Search schemas / tables",
    en: "Search schemas / tables"
  },
  connectDatabase: {
    ru: "Подключите базу данных, чтобы увидеть схемы и предпросмотр данных",
    en: "Connect database to see schemas and preview data"
  },
  loadingSchema: {
    ru: "Загрузка схемы...",
    en: "Loading schema..."
  },
  noTables: {
    ru: "Нет таблиц по текущему фильтру",
    en: "No tables matching current filter"
  },
  settings: {
    ru: "Settings",
    en: "Settings"
  },
  language: {
    ru: "Language",
    en: "Language"
  },
  openDbExplorer: {
    ru: "Открыть DB Explorer полностью",
    en: "Open DB Explorer fully"
  },
  connected: {
    ru: "Подключено",
    en: "Connected"
  },
  
  // Common UI
  close: {
    ru: "Закрыть",
    en: "Close"
  },
  save: {
    ru: "Сохранить",
    en: "Save"
  },
  cancel: {
    ru: "Отмена",
    en: "Cancel"
  },
  delete: {
    ru: "Удалить",
    en: "Delete"
  },
  edit: {
    ru: "Редактировать",
    en: "Edit"
  },
  add: {
    ru: "Добавить",
    en: "Add"
  },
  search: {
    ru: "Поиск",
    en: "Search"
  },
  loading: {
    ru: "Загрузка...",
    en: "Loading..."
  },
  error: {
    ru: "Ошибка",
    en: "Error"
  },
  success: {
    ru: "Успешно",
    en: "Success"
  },
  
  // Chart types
  line: {
    ru: "Линейный график",
    en: "Line Chart"
  },
  bar: {
    ru: "Столбчатая диаграмма",
    en: "Bar Chart"
  },
  pie: {
    ru: "Круговая диаграмма",
    en: "Pie Chart"
  },
  scatter: {
    ru: "Точечная диаграмма",
    en: "Scatter Plot"
  },
  heatmap: {
    ru: "Тепловая карта",
    en: "Heatmap"
  },
  
  // Dashboard
  dashboard: {
    ru: "Дашборд",
    en: "Dashboard"
  },
  fields: {
    ru: "Поля",
    en: "Fields"
  },
  visualizations: {
    ru: "Визуализации",
    en: "Visualizations"
  },
  filters: {
    ru: "Фильтры",
    en: "Filters"
  },
  
  // Agent
  agentCommands: {
    ru: "Команды агента",
    en: "Agent Commands"
  }
} as const;
