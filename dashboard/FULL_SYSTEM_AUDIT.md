# PocketAnalyst — Полный аудит систем
## Power BI / DataLens → наш продукт: расхождения и риски

**Дата:** 11 марта 2026  
**Цель:** Выявить все места, где продукт может работать некорректно, отображать неправильные данные или не соответствовать ожидаемой логике Power BI / DataLens.

---

## 1. Архитектурная карта: какие системы откуда заимствуют логику

| Система в коде | Источник логики | Файлы |
|---|---|---|
| **Visualizations panel** (field wells/slots) | Power BI Visualizations pane (buckets: Axis, Values, Legend, Tooltip) | `VisualizationsSlideInPanel.tsx` |
| **Fields panel** (dims + measures list) | Power BI Fields pane + DataLens dataset panel | `FieldsFiltersSlideInPanel.tsx` |
| **Filters** (BI filters context) | Power BI Filters pane (visual/page/report scope) + DataLens chart filters | `biFiltersContext.tsx`, `globalFiltersContext.tsx` |
| **Semantic model** (dimensions, measures, joins) | Power BI semantic model (star schema, relationships, DAX measures) | `types.ts`, `planner.ts`, `SchemaIntelligenceService.ts` |
| **Query compilation** (logicalQuery → SQL) | DataLens backend (dataset → SQL with aggregations, filters, group by) | `planner.ts`, `mappingToQuery.ts` |
| **Formula registry** (calculated fields) | DataLens formula functions (SUM, IF, DATETRUNC, etc.) | `formulaRegistry.ts`, `expressionEngine.ts` |
| **Chart rendering** (ECharts options) | Custom (ECharts), визуально ориентировано на DataLens | `dbChartBuilder.ts`, `ChartPreview.tsx` |
| **Cohort Pivot / Retention** | Custom + DataLens pivot table concept | `RetentionMatrix.tsx`, workers |
| **Slicer** | Power BI Slicer visual | `SlicerVisual.tsx` |
| **Column mapping** (xColumn, yColumns, groupBy) | Power BI field wells (Axis, Values, Legend) | `dbChartBuilder.ts`, `mappingToQuery.ts` |

---

## 2. КРИТИЧЕСКИЕ ПРОБЛЕМЫ (могут давать неправильные данные)

### 2.1 🔴 `dbChartBuilder` не получает BI-фильтры при прямом SQL-режиме

**Проблема:** `buildMappedSql()` в `dbChartBuilder.ts` строит SQL только из `mapping.filters` (визуальные фильтры, заданные вручную в mapping). Глобальные BI-фильтры (`biFiltersContext`) и `dateRange` из `globalFiltersContext` **НЕ передаются** в `buildMappedSql`. 

**Когда это ломается:** Когда чарт использует прямой SQL (`kind: "db-table"` без semantic model), фильтры из Slicer или из панели Filters **не влияют** на данные чарта. Пользователь видит фильтр активным, но данные не меняются.

**В DataLens / Power BI:** Фильтры ВСЕГДА влияют на все визуалы. Это фундаментальная контрактная гарантия.

**Затронутый путь:** `ChartPreview.tsx` → прямой SQL ветка (`!useSemantic`) → `buildMappedSql()`

**Файлы:**
- `dbChartBuilder.ts:104-154` — `whereFromMappingFilters` читает только `mapping.filters`
- `ChartPreview.tsx:300-310` — `buildSql()` вызывает `buildMappedSql` без BI-фильтров

**Риск:** 🔴 ВЫСОКИЙ — неправильные данные на графиках

---

### 2.2 🔴 `dateRange` не применяется как SQL WHERE в прямом режиме

**Проблема:** `globalFiltersContext.dateRange` (start/end) используется ТОЛЬКО в semantic-пути через `planner.ts:1203-1220` (где генерируется `BETWEEN` по `defaultTimeDimension`). В прямом SQL-пути (`dbChartBuilder`) `dateRange` полностью игнорируется.

**Когда это ломается:** Пользователь выставляет "Last 30 days" в Date Presets → чарты на semantic model обновляются, чарты на прямом SQL — нет.

**В DataLens:** Фильтр по дате применяется ко всем чартам через dashboard-level фильтрацию.

**Риск:** 🔴 ВЫСОКИЙ — несогласованность данных между чартами

---

### 2.3 🔴 Фильтры `not_in`, `not_between`, `icontains`, `notcontains` отсутствуют в `dbChartBuilder`

**Проблема:** `dbChartBuilder.ts:104-154` поддерживает только: `eq, neq, gt, gte, lt, lte, contains, in, between`. Отсутствуют: `not_in, not_between, icontains, notcontains, noticontains, startswith, endswith, isnull, isnotnull`.

При этом `planner.ts:174-196` (`isLogicalOp`) и `renderWhere` поддерживают ВСЕ эти операторы.

**Когда это ломается:** Если mapping.filters содержит `not_in` или `isnull`, прямой SQL-запрос **молча игнорирует** этот фильтр (условие не добавляется в WHERE).

**Риск:** 🔴 ВЫСОКИЙ — silent data leak (фильтр не применён, пользователь думает что применён)

---

### 2.4 🟠 `contains` в `planner.ts` всегда case-insensitive, а в `dbChartBuilder` — case-sensitive

**Проблема:**
- `planner.ts:283-287`: `op === "contains"` → `renderLike(... true)` = case-insensitive
- `dbChartBuilder.ts:139-141`: `op === "contains"` → `LIKE '%..%'` = case-sensitive в Postgres

**Результат:** Один и тот же фильтр `contains: "test"` даёт разные результаты в semantic mode vs direct SQL mode. В Postgres `LIKE` по умолчанию case-sensitive.

**Риск:** 🟠 СРЕДНИЙ — разные данные в зависимости от режима

---

## 3. СЕРЬЁЗНЫЕ ПРОБЛЕМЫ (неполная функциональность)

### 3.1 🟠 Отсутствуют DataLens-секции: Colors, Sorting, Labels, Split

**В DataLens wizard** для line chart секции: X, Y, Y2, Colors, Forms, Sorting, Labels, Split, Filters.

**У нас в VIZ_SLOTS:** X (axis), Y (values), Legend (group by), Tooltip. 

**Отсутствует:**
- **Colors** — в DataLens позволяет раскрасить линии/бары по значению dimension (не просто "Legend/group by", а именно цветовое кодирование). У нас `groupBy` используется и для Legend, и для Colors, но нет отдельной секции с цветовой настройкой.
- **Sorting** — В DataLens/Power BI можно задать сортировку по dimension или measure. У нас `orderBy` в `LogicalQuery` поддерживается на backend, но **нет UI** для задания сортировки в панели Visualizations.
- **Labels** — DataLens позволяет добавить measure-значения как подписи на chart. У нас нет такой секции.
- **Split** — DataLens Split разбивает чарт горизонтально по dimension (faceting). Полностью отсутствует.

**Риск:** 🟠 СРЕДНИЙ — пользователи DataLens не смогут воспроизвести свои настройки чартов 1:1

---

### 3.2 🟠 `ColumnMapping.filters` и `LogicalQuery.filters` — два разных пути, не синхронизированы

**Проблема:** Существуют ДВА параллельных механизма фильтрации:
1. `mapping.filters` (в `dbChartBuilder`) — простые фильтры в ColumnMapping, применяются только в прямом SQL
2. `LogicalQuery.filters` (в `planner.ts`) — логические фильтры, применяются только в semantic mode

При переключении между режимами (semantic ↔ direct) фильтры **теряются**, потому что они хранятся в разных структурах.

**В Power BI / DataLens:** Фильтры всегда работают вне зависимости от backend mode.

**Риск:** 🟠 СРЕДНИЙ — потеря фильтров при смене режима

---

### 3.3 🟠 `queryGenerator.ts` — дублирующий SQL-генератор с SQL injection

**Проблема:** `src/lib/chart-builder/queryGenerator.ts` — отдельный SQL-генератор для Chart Builder, который:
- НЕ использует `quoteIdent` для идентификаторов (просто `tableAlias.columnName`)
- В `contains` фильтре: `LIKE '%${f.value}%'` — прямая интерполяция без экранирования (SQL injection!)
- Дублирует логику `dbChartBuilder.ts`, но с другим API

**Файл:** `queryGenerator.ts:43` — `return \`${column} LIKE '%${f.value}%'\`;`

**Риск:** 🟠 ВЫСОКИЙ с точки зрения безопасности (SQL injection)

---

### 3.4 🟠 Implicit measures не поддерживаются

**В Power BI:** Dimension-колонка (string или number) может быть "implicit measure" — Power BI автоматически применяет SUM/COUNT/AVG когда dimension перетаскивается в Values bucket. Пользователю не нужно создавать explicit measure.

**У нас:** `classifyFieldRef()` жёстко классифицирует поле как dimension ИЛИ measure. Если dimension перетаскивается в Y (Values), `mappingToQuery.ts:109-111` фильтрует его как dimension и НЕ агрегирует.

**Исключение:** если задан `measureAggOverrides` для поля — тогда агрегация работает. Но в UI нет удобного способа задать "применить SUM к этому dimension".

**Сравнение с DataLens:** DataLens тоже разделяет dimension/measure, но позволяет drag-n-drop dimension в Values с автоматической агрегацией.

**Риск:** 🟠 СРЕДНИЙ — пользователь не может легко агрегировать dimension-поля

---

### 3.5 🟠 Y2 (второй Y-axis) не генерирует separate SQL-series

**Проблема:** В `mappingToQuery.ts:76-78` и `planner.ts` Y2 columns просто добавляются к общему списку measures. В `dbChartBuilder.ts:206` они тоже объединяются. Но в ECharts рендеринге (`buildDbChartOption`) **нет обработки Y2** — все measures рисуются на одной оси.

**В DataLens:** Y2 рисуется на отдельной оси (dual-axis chart).  
**В Power BI:** Line and stacked column chart — отдельная Y2-ось.

**Файл:** `dbChartBuilder.ts:389-401` — line chart не создаёт `yAxis: [{}, {}]` и не назначает `yAxisIndex: 1` для y2 series.

**Риск:** 🟠 СРЕДНИЙ — Y2 данные собираются, но визуально не отличаются от Y1

---

## 4. УМЕРЕННЫЕ ПРОБЛЕМЫ (edge cases, UX)

### 4.1 🟡 `globalFiltersContext.dateRange` инициализируется как "Last 7 days", но BI-фильтры — пустые

**Проблема:** `globalFiltersContext.tsx:49-51` — `dateRange` по умолчанию = last 7 days. Это значит что ВСЕ semantic-запросы по умолчанию фильтруются за 7 дней, даже если пользователь не задавал фильтр по дате.

**В DataLens:** Если дата-фильтр не задан на дашборде, данные показываются **за всё время**.

**Риск:** 🟡 — пользователь может не понимать, почему данных мало (они отфильтрованы за 7 дней)

---

### 4.2 🟡 `safeIdent` отклоняет идентификаторы с пробелами, кириллицей, спецсимволами

**Проблема:** `planner.ts:42-48` — `safeIdent` позволяет только `[a-zA-Z_][a-zA-Z0-9_]*`. Если в DataLens dataset есть поле "Дата создания" или "Order Date", semantic model не может его использовать — выбросит ошибку.

**В DataLens:** Имена полей могут быть любыми (они экранируются при генерации SQL).

**Обходной путь:** Использовать `sql: "{{alias}}.\"Order Date\""` в semantic model, но ключ dimension всё равно должен быть ASCII-safe.

**Риск:** 🟡 — ограничение при работе с реальными БД

---

### 4.3 🟡 `KPI` не применяет mapping.filters

**Проблема:** `dbChartBuilder.ts:184-189` — KPI ветка использует `whereFromMappingFilters`, но если `mapping.yColumns` пуст (y0 === ""), возвращает `SELECT TOP 1 1 as value` вообще без WHERE и без tableKey.

**Даже если y0 заполнен:** KPI SQL не включает groupBy, но включает filters. Это нормально. Однако если нужен KPI с гранулярностью (например, "Sales this month"), нужен dateRange фильтр, а он не передаётся (см. п.2.2).

**Риск:** 🟡 — KPI показывает данные за всё время вместо выбранного периода

---

### 4.4 🟡 Pie/Donut при прямом SQL агрегируют клиентски

**Проблема:** `dbChartBuilder.ts:217-224` генерирует SQL с серверной агрегацией для pie. Но `buildDbChartOption` (pie рендеринг, строки 440-445) **повторно агрегирует** данные клиентски (`agg.set(cat, ... + cellNum)`). Если серверный SQL уже вернул агрегированные данные, клиентская агрегация даёт корректный результат (сумма единичных значений). Но если серверный SQL вернул detail-строки (без GROUP BY), то клиентская агрегация замаскирует проблему.

**Риск:** 🟡 — потенциальная двойная агрегация, скрытый баг

---

### 4.5 🟡 `buildLogicalQueryFromMapping` limit жёстко 500

**Проблема:** `mappingToQuery.ts:171` — `limit: 500`. Для таблиц и pie charts пользователь может ожидать больше строк. В DataLens limit задаётся на уровне чарта (до 100,000).

**Риск:** 🟡 — пользователь видит обрезанные данные без уведомления

---

### 4.6 🟡 `resolveVizType` эвристически определяет тип по имени чарта

**Проблема:** `dbChartBuilder.ts:232-246` — vizType определяется regex по `chartName`. Слово "conversion" → KPI, "table" → table. Это хрупко: если пользователь назовёт чарт "Conversion Trend", он станет KPI вместо line chart.

**Сейчас:** Есть override через `chartConfig.general.vizType`, но если он не задан, fallback на chartName regex.

**Риск:** 🟡 — неожиданный тип чарта

---

## 5. МЕЛКИЕ ПРОБЛЕМЫ И НЕСООТВЕТСТВИЯ

### 5.1 `tableKey` не экранируется в FROM clause

`planner.ts:1576` — `FROM ${tableKey} ${baseAlias}` — tableKey вставляется as-is. Если tableKey содержит пробелы или спецсимволы (`public."My Table"`), SQL может сломаться. В `dbChartBuilder` тоже: `FROM ${tableKey}`.

### 5.2 `detectColType` неточно определяет типы

`dbChartBuilder.ts:253-273` — если >60% значений numeric, колонка = number. Но в реальных данных колонка `zip_code` может быть 100% numeric, но семантически это string. DataLens решает это через metadata dataset (тип задан заранее).

### 5.3 Нет поддержки `null` display settings

DataLens позволяет настроить как отображать NULL: как 0, пропуск, линейная интерполяция. У нас `cellNum()` преобразует null → 0, нет настройки.

### 5.4 Нет chart-level фильтров в Visualizations panel

DataLens: каждый чарт имеет секцию **Filters** в wizard, где можно добавить фильтры dimension/measure. У нас фильтры только через BI-фильтры (report/page/visual scope) или через mapping.filters (но нет UI для их редактирования в Visualizations panel).

### 5.5 Нет поддержки `Measure Names` / `Measure Values`

DataLens: при добавлении нескольких measures, появляется автоматическое поле "Measure Names" (можно перетащить в Colors для раскраски серий). У нас нет такого meta-поля.

---

## 6. МАТРИЦА СООТВЕТСТВИЯ DataLens Wizard ↔ PocketAnalyst

| DataLens секция | PocketAnalyst | Статус | Комментарий |
|---|---|---|---|
| X (dimension/time) | Axis (X) | ✅ Есть | — |
| Y (measures) | Axis (Y) / Values | ✅ Есть | — |
| Y2 (measures) | Aux Axis (Y2) | ⚠️ Backend есть, визуализация нет | Y2 данные собираются но рисуются на той же оси |
| Colors | Legend (group by) | ⚠️ Частично | Нет отдельной цветовой секции |
| Forms (line shape) | — | ❌ Нет | — |
| Sorting | — | ❌ Нет UI | Backend `orderBy` поддерживается |
| Labels (data labels) | — | ❌ Нет | — |
| Split (faceting) | — | ❌ Нет | — |
| Filters (chart-level) | — | ❌ Нет UI в Viz panel | Есть через BI filters context |
| Calculated fields | Compute step | ✅ Есть | Через pipeline |
| Date presets | Date Presets | ✅ Есть | Last 7/30/90, This month/quarter |
| Slicer | Slicer visual | ✅ Есть | — |
| Pivot table | Cohort Pivot | ✅ Есть | Специализированный cohort pivot, не generic pivot |
| Tooltip | Tooltip columns | ✅ Есть | — |
| Drilldown | Drilldown columns | ✅ Есть | — |

---

## 7. ПРИОРИТИЗИРОВАННЫЙ ПЛАН ИСПРАВЛЕНИЙ

### P0 — Критические (данные неправильные)
1. **Передать BI-фильтры и dateRange в прямой SQL-путь** — `dbChartBuilder.ts` и `ChartPreview.tsx` direct SQL branch
2. **Добавить недостающие filter ops в `dbChartBuilder`** — `not_in, not_between, icontains, notcontains, startswith, endswith, isnull, isnotnull`
3. **Исправить SQL injection в `queryGenerator.ts`** — использовать `sqlStringLiteral` для значений и `quoteIdent` для колонок

### P1 — Серьёзные (DataLens-совместимость)
4. **Добавить UI секцию Sorting** в Visualizations panel (dropdown measure/dimension + asc/desc)
5. **Добавить UI секцию Colors** (отдельно от Legend)
6. **Добавить UI секцию Labels** (toggle show labels + выбор measure)
7. **Реализовать Y2 dual-axis** в ECharts rendering
8. **Согласовать case-sensitivity** фильтра `contains` между semantic и direct paths
9. **Убрать дефолтный dateRange 7 days** — сделать его `null` (без ограничения) по умолчанию

### P2 — Улучшения
10. Добавить chart-level Filters секцию в Viz panel
11. Поддержать implicit measures (auto-aggregate dimensions in Values)
12. Обработка NULL display settings
13. Экранирование `tableKey` в SQL FROM clause
14. Увеличить limit в `mappingToQuery` или сделать его настраиваемым
15. Добавить Measure Names/Values meta-поля

---

## 8. СПЕЦИФИКА ДЛЯ DataLens ЧАРТОВ (dywbxwlualpix)

Для корректного воспроизведения чартов из DataLens https://datalens.yandex/dywbxwlualpix нужно убедиться:

1. **Все типы чартов**: Line, Bar (column), Area (stacked/normalized), Pie, Table (pivot), Scatter — поддерживаются базово ✅
2. **Stacked bar/area**: наш `area` chart делает `stack: "total"` — ✅ 
3. **Normalized (100%) stacked**: отсутствует — нужно добавить нормализацию в ECharts series
4. **Pivot table**: у нас есть cohort pivot, но нет generic pivot table (rows × columns × measures). DataLens pivot table — это ключевой тип визуализации
5. **Dual-axis**: нужен для чартов с разными масштабами (revenue + count) — P1
6. **Data labels**: нужны для наглядности — P1
7. **Сортировка**: обязательна для bar charts (top-N) — P1
