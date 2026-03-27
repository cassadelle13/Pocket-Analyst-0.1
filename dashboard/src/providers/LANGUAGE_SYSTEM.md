# Language Switching System

PocketAnalyst теперь поддерживает переключение между русским (RU) и английским (EN) языками.

## 🚀 Как использовать

### 1. Переключение языка в UI

**В главном дашборде (DashboardDock):**
- Найдите переключатель RU/EN рядом с кнопками библиотеки и БД
- Кликните на нужный язык

**В панели Database Explorer:**
- Откройте панель БД (кнопка с иконкой базы данных)
- В секции "Settings" найдите переключатель языка

### 2. Использование в компонентах

```tsx
import { useLanguage, TRANSLATIONS } from "@/providers/LanguageProvider";

function MyComponent() {
  const { t, language, setLanguage } = useLanguage();
  
  return (
    <div>
      <h1>{t(TRANSLATIONS.dashboard)}</h1>
      <p>Current language: {language}</p>
      <button onClick={() => setLanguage('en')}>Switch to English</button>
    </div>
  );
}
```

### 3. Добавление новых переводов

В файле `TRANSLATIONS` объекта:

```typescript
export const TRANSLATIONS = {
  // ... существующие переводы
  
  // Добавьте новые:
  myNewFeature: {
    ru: "Новая функция",
    en: "New Feature"
  }
} as const;
```

### 4. Использование переводов

```tsx
// Вместо хардкода:
<button>Закрыть</button>

// Используйте:
<button>{t(TRANSLATIONS.close)}</button>
```

## 📁 Структура файлов

```
src/
├── providers/
│   ├── LanguageProvider.tsx     # Основной провайдер языка
│   └── LANGUAGE_SYSTEM.md       # Этот файл
├── components/
│   └── ui/
│       └── LanguageToggle.tsx   # Переиспользуемый компонент
└── app/
    └── layout.tsx               # LanguageProvider добавлен в AppProviders
```

## 🎨 Компоненты

### LanguageToggle

Переиспользуемый компонент для переключения языка:

```tsx
<LanguageToggle size="sm" showLabel={true} />
```

Props:
- `size`: "sm" | "md" | "lg" (default: "md")
- `showLabel`: boolean (default: false)
- `className`: string (дополнительные CSS классы)

## 🔄 Как это работает

1. **LanguageProvider** хранит текущий язык в localStorage
2. При изменении языка отправляется CustomEvent `"language:changed"`
3. Все компоненты использующие `useLanguage()` автоматически обновляются
4. Переводы хранятся в объекте `TRANSLATIONS`

## 🌍 Доступные языки

- **RU** - Русский (по умолчанию)
- **EN** - English

## 💡 Лучшие практики

1. **Всегда используйте `t()` для текстов UI**
2. **Храните переводы в `TRANSLATIONS` объекте**
3. **Используйте `useLanguage()` хук вместо прямого доступа к localStorage**
4. **Добавляйте индикаторы текущего языка в важные панели**

## 🔧 Extensibility

### Добавление нового языка

1. Обновите тип `Language` в `LanguageProvider.tsx`:

```typescript
type Language = "ru" | "en" | "de"; // Добавьте "de"
```

2. Добавьте переводы в `TRANSLATIONS`:

```typescript
myText: {
  ru: "Мой текст",
  en: "My text", 
  de: "Mein Text"
}
```

3. Обновите `LanguageToggle` компонент при необходимости

### Продвинутые возможности

- **Платформенные переводы**: Можно расширить для поддержки RTL языков
- **Динамическая загрузка**: Можно добавить lazy loading переводов
- **Форматирование**: Можно добавить i18n для дат, чисел и валют

## 🐛 Troubleshooting

**Проблема:** Язык не сохраняется
**Решение:** Проверьте что `LanguageProvider` обернут в `AppProviders`

**Проблема:** Компонент не обновляется при смене языка
**Решение:** Убедитесь что компонент использует `useLanguage()` хук

**Проблема:** Перевод отсутствует
**Решение:** Добавьте отсутствующий перевод в `TRANSLATIONS` объект

---

**Создано:** 22 февраля 2026  
**Версия:** 1.0.0
