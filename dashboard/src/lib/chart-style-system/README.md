# Chart Style System

Единая система стилизации графиков для PocketAnalyst, которая обеспечивает 100% визуальное соответствие всех графиков бренду и упрощает разработку.

## 🎯 Цель

- **Единый источник правды** для всех стилей графиков
- **Устранение дублирования** кода и стилей  
- **Быстрое добавление** новых графиков без написания CSS
- **100% бренд соответствие** для всех визуализаций

## 📁 Структура

```
src/lib/chart-style-system/
├── ChartStyleConfig.ts     # Конфигурация всех стилей
├── ChartTemplates.tsx      # 25 готовых шаблонов графиков
└── README.md              # Документация
```

## 🎨 ChartStyleConfig

Единая конфигурация всех визуальных параметров:

```typescript
export const ChartStyleConfig = {
  // Размеры контейнеров
  container: {
    default: { width: '100%', height: 360 },
    compact: { width: '100%', height: 280 },
    metric: { width: '100%', height: 128 },
  },
  
  // Цветовая палитра
  colors: {
    primary: '#10b981',
    secondary: '#3b82f6', 
    background: 'rgba(0, 0, 0, 0)',
    grid: 'rgba(34, 197, 94, 0.1)',
  },
  
  // Типографика
  typography: {
    title: { fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.95)' },
    label: { fontSize: '11px', color: 'rgba(226, 232, 240, 0.9)' },
  },
  
  // Glassmorphism эффекты
  glassmorphism: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  },
  // ... и многое другое
}
```

## 📊 ChartTemplates

25 готовых шаблонов для всех типов графиков:

### Line Charts
- `LineChartSingle` - Один линейный график
- `LineChartMulti` - Множественные линии  
- `LineChartDualAxis` - Двойная ось Y

### Area Charts  
- `AreaChartSingle` - Одна область
- `AreaChartStacked` - Стэкированные области
- `AreaChartGradient` - С градиентом

### Bar Charts
- `BarChartVertical` - Вертикальные столбцы
- `BarChartHorizontal` - Горизонтальные столбцы
- `BarChartStacked` - Стэкированные
- `BarChartGrouped` - Сгруппированные

### Mixed Charts
- `MixedLineBar` - Линия + столбцы
- `MixedAreaBar` - Область + столбцы  
- `MixedLineArea` - Линия + область

### Specialized Charts
- `TrendChart` - Анализ трендов
- `ComparisonChart` - Сравнение метрик
- `PerformanceChart` - Производительность
- `GrowthChart` - Рост
- `ForecastChart` - Прогноз
- `AnomalyChart` - Аномалии
- `FunnelChart` - Воронка
- `RealTimeChart` - Real-time метрики
- `SummaryChart` - Сводная панель

## 🚀 Использование

### Базовый пример

```typescript
import { ChartTemplates } from '@/lib/chart-style-system/ChartTemplates';

const MyChart = () => {
  const data = [
    { date: 'Jan 01', revenue: 45000, users: 2500 },
    { date: 'Jan 02', revenue: 48000, users: 2600 },
    // ...
  ];

  return (
    <ChartTemplates.LineChartSingle
      data={data}
      xKey="date"
      yKey="revenue"
      options={{
        title: "Revenue Trend",
        size: "default"
      }}
    />
  );
};
```

### Множественные метрики

```typescript
<ChartTemplates.LineChartMulti
  data={data}
  xKey="date"
  yKeys={["revenue", "users"]}
  options={{
    title: "Revenue & Users",
    showLegend: true
  }}
/>
```

### Компактные метрики

```typescript
<ChartTemplates.CompactMetricChart
  data={data}
  xKey="date"
  yKey="conversion"
  size="compact"
/>
```

## ✅ Преимущества

### До: Кастомные стили
```typescript
// ❌ Разные стили в каждом компоненте
<div className="bg-white rounded-lg shadow-lg p-4">
  <div className="text-lg font-semibold mb-4" style={{ color: '#333' }}>
    <div style={{ background: '#f9f9f9', border: '1px solid #ddd' }}>
      {/* Кастомный код графика */}
    </div>
  </div>
</div>
```

### После: Единая система
```typescript
// ✅ Единый стиль для всех графиков
<ChartTemplates.LineChartSingle
  data={data}
  xKey="date"
  yKey="revenue"
/>
```

## 🎯 Результат

### 100% Визуальное соответствие
- Все графики выглядят одинаково
- Единая цветовая схема
- Одинаковые отступы и размеры
- Консистентная типографика

### Простота разработки
- Новые графики добавляются в 5 минут
- Не нужно писать CSS код
- Автоматическое применение стилей
- TypeScript поддержка

### Легкое поддержание
- Изменение стиля в одном месте
- Автоматическое обновление всех графиков
- Централизованная бренд-конфигурация

## 🔧 Кастомизация

Хотя система обеспечивает единый стиль, возможна кастомизация через `options`:

```typescript
<ChartTemplates.LineChartSingle
  data={data}
  xKey="date"
  yKey="revenue"
  options={{
    title: "Custom Title",
    size: "expanded",
    showLegend: false,
    customOptions: {
      // Дополнительные ECharts опции при необходимости
    }
  }}
/>
```

## 📋 Checklist

- [x] ChartStyleConfig создан
- [x] 25 шаблонов реализованы  
- [x] TypeScript типы определены
- [x] Примеры использования готовы
- [x] Документация написана

## 🎉 Результат

**До:** 10+ разных стилей графиков, дублирование кода, сложное поддержание

**После:** 1 единая система, 25 шаблонов, простое добавление, 100% бренд соответствие
