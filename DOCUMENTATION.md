# DOCUMENTATION — Pocket Analyst: Полный Технический Аудит

> **Версия аудита:** 1.1  
> **Дата:** 1 апреля 2026  
> **Аудитор:** AI System Architect Agent  
> **Статус проекта:** MVP (активная доработка canvas: слайсеры, визуальные взаимодействия, семантика)

---

## Содержание

1. [Общий обзор продукта](#1-общий-обзор-продукта)
2. [Архитектура системы](#2-архитектура-системы)
3. [Технологический стек](#3-технологический-стек)
4. [Сервисы и микросервисы](#4-сервисы-и-микросервисы)
5. [Подсистема Dashboard (Power BI-like Canvas)](#5-подсистема-dashboard-power-bi-like-canvas)
6. [Семантический слой (DataLens-inspired)](#6-семантический-слой-datalens-inspired)
7. [DataTalk Agent — Сервис обнаружения и запросов к БД](#7-datatalk-agent--сервис-обнаружения-и-запросов-к-бд)
8. [ClickHouse Analytics — Event Analytics Layer](#8-clickhouse-analytics--event-analytics-layer)
9. [Система управления соединениями](#9-система-управления-соединениями)
10. [Система загрузки файлов (File Upload)](#10-система-загрузки-файлов-file-upload)
11. [Система чартов и визуализации](#11-система-чартов-и-визуализации)
12. [AI-сервисы](#12-ai-сервисы)
13. [Безопасность: Auth, RLS, GDPR](#13-безопасность-auth-rls-gdpr)
14. [Инфраструктура и DevOps](#14-инфраструктура-и-devops)
15. [API-поверхность (полная карта)](#15-api-поверхность-полная-карта)
16. [Что заимствовано из Power BI](#16-что-заимствовано-из-power-bi)
17. [Что заимствовано из DataLens](#17-что-заимствовано-из-datalens)
18. [Что НЕ реализовано из Power BI (Gap Analysis)](#18-что-не-реализовано-из-power-bi-gap-analysis)
19. [Что НЕ реализовано из DataLens (Gap Analysis)](#19-что-не-реализовано-из-datalens-gap-analysis)
20. [Технический долг и известные проблемы](#20-технический-долг-и-известные-проблемы)
21. [Структура репозитория (полная карта файлов)](#21-структура-репозитория-полная-карта-файлов)

---

## 1. Общий обзор продукта

**Pocket Analyst** — современный продукт для бизнес-аналитики (BI), разрабатываемый как облегчённая альтернатива Power BI с открытым стеком. Продукт объединяет:

- **Power BI-подобный drag-and-drop canvas** для построения дашбордов с чартами на основе реальных данных из подключённых СУБД
- **DataLens-вдохновлённый семантический слой** — собственная TypeScript-реализация семантической модели с SQL-компилятором, поддержкой окончательных функций (window functions), pivot, retention-анализа
- **Аналитику событий на ClickHouse** — event analytics в стиле Mixpanel/Amplitude (воронки, retention, cohort-анализ, user flows)
- **DataTalk Agent** — TypeScript-микросервис для автоматического обнаружения и интроспекции внешних БД (Postgres, MySQL, MSSQL, ClickHouse)
- **AI-функции** — объяснение чартов через LLM, инсайты

### Целевая аудитория
Малый и средний бизнес, аналитики данных, которым нужен self-hosted BI-инструмент без лицензионных ограничений Power BI.

---

## 2. Архитектура системы

```
┌─────────────────────────────────────────────────────────────────────┐
│                         БРАУЗЕР (Next.js Client)                    │
│  ┌────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Dashboard     │  │  Event Analytics │  │  Home / DataTalk   │  │
│  │  Canvas (PBI)  │  │  (CH Analytics)  │  │  File Upload / AI  │  │
│  └───────┬────────┘  └────────┬─────────┘  └────────┬───────────┘  │
└──────────┼─────────────────────┼────────────────────┼──────────────┘
           │                     │                    │
┌──────────▼─────────────────────▼────────────────────▼──────────────┐
│                    NEXT.JS API ROUTES (/api/*)                      │
│  /api/semantic/*   /api/datatalk/*  /api/rest/*  /api/uploads/*     │
│  /api/connection/* /api/discover   /api/ai/*    /api/insights/*     │
└──────────┬──────────────────────┬───────────────────────────────────┘
           │                      │
     ┌─────▼──────┐        ┌──────▼────────┐
     │  DataTalk  │        │  ClickHouse   │
     │   Agent    │        │  (Analytics)  │
     │ :9010      │        │   :8123       │
     └─────┬──────┘        └───────────────┘
           │
    ┌──────▼──────────────────────┐
    │  External Databases          │
    │  PostgreSQL  :15432          │
    │  MySQL       :13306          │
    │  MSSQL       :11433          │
    │  ClickHouse  (any)           │
    └─────────────────────────────┘

┌─────────────────────────────────┐
│  Metadata DB (PostgreSQL)       │
│  datatalk_meta schema:          │
│  - connections                  │
│  - semantic_models              │
│  - projects                     │
│  - pa_upload (файлы)            │
└─────────────────────────────────┘

┌──────────────┐  ┌─────────────────┐
│  AI Service  │  │  Ingest (Vector) │
│  Python :?   │  │  → ClickHouse    │
└──────────────┘  └─────────────────┘
```

### Ключевые потоки данных

**Поток 1 — Power BI-like Dashboard:**
```
UI Canvas → /api/datatalk/schema → DataTalk Agent → External DB
UI Canvas → /api/semantic/query  → Semantic Planner → /api/datatalk/query → DataTalk Agent → External DB
```

**Поток 2 — Event Analytics:**
```
UI Analytics Page → /api/rest/* → ClickHouse HTTP API → JSON Response
```

**Поток 3 — File Upload:**
```
UI FileUploadDropZone → /api/uploads/dataset → materializeToPostgres → PostgreSQL (pa_upload schema)
```

**Поток 4 — Semantic Layer:**
```
UI Chart → biFiltersContext (+ опционально transient cross-filter из CrossSelectionContext)
       → /api/semantic/query → planner.ts → compileSemanticQuery() → /api/datatalk/query → DataTalk Agent
```
Transient cross-filter не пишется в панель Filters: это временный `BiFilter` с `logicGroup: crossfilter:<sourceChartId>`, добавляемый в `ChartPreview` при режиме взаимодействия `filter` (см. §5.15–5.16).

---

## 3. Технологический стек

Значения версий приведены по `dashboard/package.json` (состояние репозитория; для диапазонов `^` фактически установленная minor/patch может отличаться после `npm install`).

### Frontend
| Технология | Версия | Назначение |
|------------|--------|------------|
| Next.js | 15.1.6 | App Router, SSR/CSR, API Routes |
| React / react-dom | ^18.3.1 | UI фреймворк |
| TypeScript | ^5 | Типизация |
| Tailwind CSS | ^3.4.17 | Стилизация |
| tailwind-merge | ^2.5.5 | Композиция классов |
| postcss / autoprefixer | ^8.5.1 / ^10.4.20 | Сборка CSS |
| echarts | ^5.1.2 | Чарты (основная библиотека) |
| echarts-gl | ^2.0.9 | 3D визуализации (npm-пакет `echarts-gl`) |
| uplot | ^1.6.32 | High-performance time series |
| Framer Motion | ^12.29.2 | Анимации |
| @tremor/react | ^3.18.7 | UI компоненты (таблицы, метрики) |
| @refinedev/core | ^4.46.2 | Data layer / ресурсы |
| @refinedev/nextjs-router | ^6.2.3 | Refine + Next.js router |
| @refinedev/simple-rest | ^5.0.11 | REST data provider (`/api/rest`) |
| lucide-react | ^0.469.0 | Иконки |
| @heroicons/react | ^2.2.0 | Иконки (доп.) |
| @monaco-editor/react | ^4.7.0 | SQL/code editor |
| monaco-editor | ^0.52.0 | Движок редактора |
| html-to-image | ^1.11.11 | Экспорт чартов |
| papaparse | ^5.5.3 | Парсинг CSV |
| xlsx | ^0.18.5 | Парсинг Excel |
| @tanstack/react-virtual | ^3.13.18 | Виртуализированные таблицы |
| clsx | ^2.1.1 | Утилита className |

### Backend (Next.js API Routes)
| Технология | Версия | Назначение |
|------------|--------|------------|
| Next.js Route Handlers | 15.1.6 | API endpoints |
| pg | ^8.13.1 | PostgreSQL client (metadata DB + pa_upload) |
| jsonwebtoken | ^9.0.2 | JWT auth |
| lru-cache | ^11.2.5 | LRU кэш для запросов |
| protobufjs | ^8.0.0 | Protobuf serialization |

### Тестирование (dashboard, devDependencies)
| Технология | Версия | Назначение |
|------------|--------|------------|
| vitest | ^1.6.1 | Unit-тесты (семантика, store, компоненты) |
| @vitest/coverage-v8 | ^1.6.1 | Покрытие кода |
| @playwright/test | ^1.49.1 | E2E (Playwright) |
| eslint | ^9 | Линтинг |
| eslint-config-next | 15.1.6 | Правила ESLint для Next |

### DataTalk Agent
| Технология | Назначение |
|------------|------------|
| Fastify | HTTP сервер |
| TypeScript | Язык |
| node-postgres | PostgreSQL |
| mysql2 | MySQL |
| mssql | MSSQL |
| @clickhouse/client | ClickHouse |

### Инфраструктура
| Компонент | Версия / Образ |
|-----------|----------------|
| ClickHouse | custom (storage/) |
| PostgreSQL | 14-alpine (metadata) |
| MySQL | 8.4 |
| MSSQL | 2022-latest |
| Vector | ingest pipeline |
| AI Service | Python (custom) |

---

## 4. Сервисы и микросервисы

### 4.1 Dashboard (Next.js) — Основной сервис

**Путь:** `dashboard/`  
**Порт:** 3000  
**Технология:** Next.js 15 (App Router)

Центральный сервис. Содержит:
- Весь React UI
- Все API Route Handlers (`/api/*`)
- Семантический слой (TypeScript, server-side)
- Прокси к DataTalk Agent
- Интеграция с ClickHouse (напрямую через HTTP)
- Metadata DB клиент (pg → PostgreSQL)

**Конфигурация:** `dashboard/next.config.ts`
- `output: "standalone"` для Docker
- TypeScript и ESLint ошибки не блокируют build (небезопасная настройка)
- Оптимизация imports для ECharts

---

### 4.2 DataTalk Agent — Сервис интроспекции БД

**Путь:** `datatalk-agent/`  
**Порт:** 9010 (env: `DATATALK_AGENT_PORT`)  
**Технология:** Fastify + TypeScript

**Файлы:**
- `src/index.ts` — 703 строки, основной Fastify app
- `src/dockerDiscovery.ts` — обнаружение БД в Docker
- `src/networkScanner.ts` — сетевой скан портов
- `src/fileDiscovery.ts` — обнаружение БД через файловую систему
- `src/schemaDiscovery.ts` — интроспекция схем

**Эндпоинты агента:**
| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/health` | GET | Health check |
| `/query` | POST | Выполнение SQL-запроса |
| `/schema` | POST | Получение схемы таблицы/БД |
| `/discover` | POST | Автообнаружение БД в сети/Docker |
| `/test-connection` | POST | Проверка параметров подключения |

**Поддерживаемые СУБД:** PostgreSQL, MySQL, MSSQL, ClickHouse  
**Безопасность:** `DATATALK_AGENT_SHARED_SECRET`, role-based SQL policy

---

### 4.3 ClickHouse Storage — OLAP для Event Analytics

**Путь:** `storage/`  
**Порт:** 8123 (HTTP), 9000 (native)  
**Роль:** Хранилище событий и аналитических данных

**Init-данные:** `storage/init/` — SQL DDL + CSV семплы, включая `musgen-аналитика/` (демо-данные MusGen) и `online_retail` (образец).

Dashboard обращается к ClickHouse **напрямую** через `dashboard/src/lib/clickhouse.ts` (HTTP API).

---

### 4.4 Ingest Pipeline — Vector

**Путь:** `ingest/`  
**Технология:** Vector.dev  
**Роль:** Приём событий → запись в ClickHouse

`ingest/vector.yaml` — конфигурация Pipeline. Принимает данные через HTTP, трансформирует и пишет в ClickHouse.

---

### 4.5 AI Service

**Путь:** `ai-service/`  
**Технология:** Python  
**Файлы:** `main.py`, `requirements.txt`  
**Роль:** LLM-сервис (предположительно LiteLLM/OpenAI прокси или Dify integration)

Интегрируется через `dashboard/src/lib/` (предположительно через `DIFY_API_URL` / `AI_SERVICE_URL` из env).

---

### 4.6 Metadata PostgreSQL

**Образ:** `postgres:14-alpine`  
**Порт:** 15432  
**Роль:** Хранилище метаданных всей системы

**Схемы:**
- `datatalk_meta.connections` — сохранённые подключения к БД
- `datatalk_meta.semantic_models` — семантические модели
- `pa_upload.*` — загруженные пользовательские датасеты

**Init-скрипты:**
- `datatalk-db-init/postgres/01_restore_musgen.sh` — восстановление демо-БД MusGen
- `datatalk-db-init/postgres/02_init_idempotent.sql` — инициализация схемы datatalk_meta
- `datatalk-db-init/postgres/03_projects_table.sql` — таблица projects

---

## 5. Подсистема Dashboard (Power BI-like Canvas)

Основная "витрина" продукта, реализующая drag-and-drop canvas для построения дашбордов в стиле Power BI.

### 5.1 Drag-and-Drop Canvas

**Компонент:** `dashboard/src/components/dashboard/DragDropCanvas.tsx` (~2587 строк)  
**Страница:** `dashboard/src/app/dashboard/page.tsx`

**Функциональность:**
- Перетаскивание и изменение размеров чарт-виджетов на свободном canvas
- Мультиселект виджетов
- Копирование/вставка виджетов
- Snap-to-grid выравнивание
- Zoom in/out canvas
- Undo/Redo (через `commandExecutor`)
- Сохранение состояния дашборда (`projectsStorage`)
- **Карта визуальных взаимодействий** (`visualInteractions`) мержится в `semanticArtifacts.visualInteractions` и уходит в payload проекта / localStorage вместе с узлами canvas
- Background canvas: цвет, изображение, blur (`canvasBackgroundStorage`)
- MiniMap для навигации по большим дашбордам

**События (window-level custom events):**
| Событие | Назначение |
|---------|------------|
| `dashboard:active-chart-id` | Уведомление о смене активного чарта |
| `dashboard:update-chart-data` | Патч данных чарт-ноды |
| `dashboard:connect-to-chart` | Подключение/отключение таблицы к чарту |
| `dashboard:chart-sources-changed` | Авторитативное уведомление об изменении источников |
| `dashboard:bi-filters-changed` | Изменение BI-фильтров |
| `dashboard:project-changed` | Смена активного проекта |
| `dashboard:reset-slicers` | Сброс состояния всех слайсеров на canvas |

---

### 5.2 Chart Window (ChartWindow)

**Компонент:** `dashboard/src/components/dashboard/ChartWindow.tsx`

Каждый виджет на canvas — это ChartWindow. Содержит:
- Заголовок чарта (редактируемый)
- ChartPreview (рендеринг ECharts / таблицы / SlicerVisual)
- Кнопки управления: drill-down, настройки, удаление
- Индикация **cross-selection** на источнике и сброс выбора; в режиме Edit Interactions — переключатели **Filter / Highlight / None** для других визуалов на странице
- Glow-обёртка (`ChartGlowWrapper`)

---

### 5.3 Chart Preview — Движок рендеринга

**Компонент:** `dashboard/src/components/dashboard/ChartPreview.tsx` (~2316 строк)

Центральный компонент рендеринга чартов. Поддерживаемые типы визуализаций:

| Тип | Реализация |
|-----|------------|
| Bar (столбчатый) | ECharts |
| Line (линейный) | ECharts |
| Area (площадь) | ECharts |
| Pie / Donut (круговой) | ECharts |
| Scatter (рассеяние) | ECharts |
| Bubble (пузырьковый) | ECharts |
| Heatmap (тепловая карта) | ECharts |
| Treemap | ECharts |
| Sankey | ECharts |
| Funnel (воронка) | ECharts |
| Table (таблица) | Tremor / custom |
| Pivot Table | Кастомный pivot рендерер |
| Cohort / Retention Matrix | `CohortAnalysisChart` / semantic |
| KPI / Metric Card | custom |
| Slicer (срез) | `SlicerVisual` |
| Map / Choropleth | ECharts (placeholder) |

**Ключевые механизмы ChartPreview:**
- Автоматическое построение семантической модели (`buildAutoSemanticModel`)
- Выполнение семантических запросов через `/api/semantic/query`
- Поддержка retention worker (`retention.worker.ts`)
- Применение глобальных BI-фильтров (`biFiltersContext`) с учётом **effective page key** (режим `pageScopeMode`: dashboard vs вкладка)
- **Визуальные взаимодействия:** подписка на `ChartInteractionBus`, обновление `CrossSelectionContext`; для целевых чартов в режиме `filter` — временный cross-filter (`eq` + `logicGroup: crossfilter:<sourceChartId>`) в цепочке фильтров запроса (не дублируется как постоянный фильтр в UI)
- Drill-down (через `DrillBreadcrumbControls`); при активном drill кросс-подсветка/кросс-фильтр с источника обычно подавляется
- Состояния загрузки/ошибки/пустых данных

---

### 5.4 Dashboard Dock — Командная панель

**Компонент:** `dashboard/src/components/dashboard/DashboardDock.tsx` (~1118 строк)

Боковая/нижняя панель инструментов. Содержит:
- Переключение режимов панелей (Fields / Filters / DB Explorer / Chart Library)
- Управление проектами (открыть/сохранить)
- Переключатель режима чтения/редактирования
- Режим **редактирования взаимодействий** (Edit Interactions): включает UI на карточках чартов для назначения Filter / Highlight / None между парами источник → цель
- Кнопки zoom и grid
- Переключатель темы
- Export кнопка
- Команда "New chart"

---

### 5.5 Fields Panel (FieldsSlideInPanel)

**Компонент:** `dashboard/src/components/dashboard/FieldsSlideInPanel.tsx` (~1507 строк)

Аналог Fields pane в Power BI. Функциональность:
- Дерево полей из подключённой схемы (таблицы → колонки)
- Группировка по типу (dimensions / measures / time)
- Drag-and-drop полей на canvas / в маппинг
- Checkbox-отметка текущего маппинга активного чарта
- Поиск по полям
- Значки типов данных (number, string, date, boolean)

---

### 5.6 Filters Panel (FiltersSlideInPanel)

**Компонент:** `dashboard/src/components/dashboard/FiltersSlideInPanel.tsx` (~1512 строк)

Аналог Filters pane в Power BI. Функциональность:
- Добавление/удаление фильтров
- Операторы базового набора плюс **регистронезависимые** варианты: `icontains`, `notcontains`, `noticontains`, `istartswith`, `iendswith`, `not_between` (см. `BiFilterOp` в `biFiltersContext.tsx`)
- Скоупы фильтров: **report** / **page** / **visual** (полный паритет с Power BI)
- Группы логики: `logicGroup`, `logicOp` (and/or), алиас поля, **top_n** по мере
- Cross-filter: фильтры от кликов на чарт (постоянные записи в `biFiltersContext`, если так настроено поведение клика)
- Поле `sourceChartId` — знает, от какого чарта пришёл фильтр
- Дата-range picker
- Применение через `biFiltersContext`

---

### 5.7 BI Filters Context — Глобальный стейт фильтров

**Файл:** `dashboard/src/store/biFiltersContext.tsx` (~306 строк)

Power BI-совместимая система фильтров:

```typescript
type BiFilter = {
  field: string;        // "Model.fieldName"
  op: BiFilterOp;       // расширенный набор (вкл. icontains, not_between, top_n, …)
  values: any[];
  logicGroup?: string;
  logicOp?: "and" | "or";
  fieldAlias?: string;
  topN?: { mode: "top" | "bottom"; n: number; byMeasure: string };
  scope?: "report" | "page" | "visual";
  sourceChartId?: string;  // источник cross-filter (панель Filters / клик по чарту)
  pageKey?: string;
}
```

**Дополнительно в контексте:** `pageScopeMode` (`dashboard` | `tab`), `activePageKey`, методы очистки по странице и **reconcile** при смене фильтров чарта (`reconcileFiltersForChart` — снимает чужие `logicGroup` при перезаписи фильтров владельца).

**Персистенция:** localStorage `dashboard:bi-filters:<projectId>`.

**События:**
- `dashboard:bi-filters-changed` — синхронизация фильтров между компонентами
- `dashboard:project-changed` — сброс фильтров при смене проекта

---

### 5.8 Slicer Visual

**Компонент:** `dashboard/src/components/dashboard/SlicerVisual.tsx` (~760 строк)

**Модульная реализация:** логика вынесена в `dashboard/src/components/dashboard/slicer/` (`useSlicerValues`, `useSlicerFilter`, режимы list / dropdown / tile / date / numeric / hierarchy и т.д.).

Полнофункциональный Slicer в стиле Power BI:
- List / Dropdown / Between / Relative date / Hierarchy и др. режимы (см. подкомпоненты в `slicer/`)
- Search, Select All / Clear, сброс всех слайсеров через событие **`dashboard:reset-slicers`** (из `DashboardDock`), вставка списка значений (paste) где применимо
- Параметры визуала: `sortOrder`, `orientation`, `forceSelection`, `restrictToLeafNodes`, относительные единицы времени (в т.ч. minute/hour где поддерживается)
- Загрузка значений через `POST /api/semantic/values` (поддержка **`sortOrder`** в теле запроса: `asc` | `desc`)
- Интеграция с `biFiltersContext` (публикует фильтры слайсера)
- Стабилизация зависимостей загрузки значений (memoization путей иерархии / уровней) для снижения лишних перезапросов

---

### 5.9 Column Mapping Panel

**Компонент:** `dashboard/src/components/dashboard/ColumnMappingPanel.tsx` (~252 строки)

Аналог "Build" режима в Power BI:
- Маппинг полей на оси X / Y
- Настройка агрегаций (sum, avg, count, countDistinct, min, max)
- Группировка (Group By)
- Детализация (Details columns)
- Drill-down columns
- Фильтры на уровне чарта

---

### 5.10 DB Explorer

**Компоненты:** `DbSlideInPanel.tsx`, `DbExplorerModal.tsx`

- Список доступных соединений
- Дерево таблиц/схем
- Подключение таблицы к активному чарту
- Поиск по таблицам
- Preview данных таблицы (через `/api/datatalk/schema`)

---

### 5.11 Chart Library Slide-In

**Компонент:** `dashboard/src/components/dashboard/ChartLibrarySlideIn.tsx`

Галерея доступных типов чартов для вставки на canvas. Аналог "Visualizations" pane в Power BI.

---

### 5.12 Drill-down

**Компонент:** `dashboard/src/components/dashboard/DrillBreadcrumbControls.tsx`

- Breadcrumb навигация по уровням drill-down
- Кнопки "drill up" / "drill down"
- Состояние текущей глубины в `ChartPreview`

---

### 5.13 Command Bar

**Компонент:** `dashboard/src/components/dashboard/CommandBar.tsx`

Natural language command bar (на базе `/api/commands/parse`). Позволяет управлять дашбордом через текстовые команды.

---

### 5.14 MiniMap

**Компонент:** `dashboard/src/components/dashboard/MiniMap.tsx`

Миникарта для навигации по большим дашбордам. Аналог MiniMap в Power BI Desktop.

---

### 5.15 Cross-highlight и transient cross-filter

Реализация в духе Power BI **cross-highlight** и частичного **cross-filter** без полной матрицы «редактирования взаимодействий» уровня Desktop.

| Слой | Файлы | Назначение |
|------|--------|------------|
| Состояние выбора | `store/crossSelectionContext.tsx` | `{ sourceChartId, field, value, seriesName? }` — что выбрано кликом на источнике |
| Режим для пары графиков | `lib/visualInteractions.ts` | `resolveVisualInteractionMode`: явная карта `sourceId → targetId → filter \| highlight \| none` или дефолты (цели, чей тип содержит `line` / `scatter` / `map`, по умолчанию **filter**; остальные — **highlight**) |
| Шина событий | `context/ChartInteractionBus.tsx`, `lib/dashboardEventBus.ts` | Клики по сериям/категориям пробрасываются в подписчиков |
| Подсветка в ECharts | `components/charts/BaseChart.tsx` | `dispatchAction` highlight / downplay; сброс при клике по пустой области canvas |
| UI источника | `ChartWindow.tsx` | Индикация активного cross-selection, кнопка Clear |

**Важно:** cross-highlight опирается на имена категорий/серий ECharts — для части типов чартов (scatter, heatmap) визуальное «затемнение» может отличаться от Power BI.

---

### 5.16 Edit Interactions и персистенция

| Компонент | Файл | Назначение |
|-----------|------|------------|
| Глобальная карта | `store/visualInteractionsContext.tsx` | `VisualInteractionsMap`: `Record<sourceChartId, Record<targetChartId, "filter" \| "highlight" \| "none">>` |
| Включение режима редактирования | `DashboardDock.tsx` | Переключатель «редактирование взаимодействий» |
| Пер-целевые кнопки | `ChartWindow.tsx` | Иконки Filter / Highlight / None на углу карточки (в режиме редактирования) |
| Сохранение | `DragDropCanvas.tsx` | Мерж `visualInteractions` в `semanticArtifacts` и в объект проекта при save / API |

Провайдеры подключены в `providers/AppProviders.tsx` (порядок: `BiFiltersProvider` → `VisualInteractionsProvider` → `CrossSelectionProvider` внутри `ChartInteractionProvider`).

---

## 6. Семантический слой (DataLens-inspired)

Собственная TypeScript-реализация семантического слоя. **Не использует** Python-бэкенд DataLens напрямую — это оригинальная разработка, вдохновлённая архитектурными концепциями DataLens.

### 6.1 Архитектура семантического слоя

```
SemanticModelV1 (JSON-декларация)
         ↓
validateSemanticModelV1() → validator.ts
         ↓
buildAutoSemanticModel()  → autoSemanticModel.ts  (автогенерация из схемы)
         ↓
compileSemanticQuery()    → planner.ts             (SQL компилятор)
         ↓
buildWindowAgg()          → windowBuilder.ts       (window functions)
         ↓
SQL string → DataTalk Agent → External DB
```

---

### 6.2 Типы данных (types.ts)

**SemanticModelV1** — декларативная модель данных:
```typescript
{
  version: 1,
  models: {
    ModelName: {
      dimensions: Record<string, { type: "string"|"number"|"time"|"boolean", sql: string }>,
      measures: Record<string, { type: "sum"|"avg"|"count"|"countDistinct"|"min"|"max", sql: string }>,
      calculatedMeasures?: Record<string, { sql: string }>,
      calculatedFields?: Record<string, CalculatedFieldDef>,
      joins?: Record<string, SemanticJoinV1>,        // Power BI-like relationships
      rls?: Array<{ field, op, param }>,             // Row-Level Security
    }
  }
}
```

**Расширенные вычисляемые поля (CalculatedFieldDef):**
| Тип | Назначение |
|-----|------------|
| `pivot_cohort` | Когортный анализ с pivot-таблицей |
| `conversion_rate` | Конверсионная метрика |
| `rolling_avg` | Скользящее среднее (window function) |
| `window_agg` | Произвольная window aggregation |

**LogicalQuery** — декларативный запрос:
```typescript
{
  sourceModel: string,
  dimensions?: string[],         // "Model.field" refs
  measures?: string[],
  measuresV2?: MeasureRef[],     // с переопределением агрегации
  time?: LogicalTime,            // временное измерение + гранулярность
  filters?: LogicalFilter[],     // 17 операторов
  orderBy?: [{ field, dir }],
  limit?: number,
  offset?: number,
}
```

**GlobalFilterContextV1** — Power BI-совместимый контекст глобальных фильтров:
```typescript
{
  version: 1,
  filters: BiFilter[],    // scope: report|page|visual
  dateRange?: { start, end },
  params?: Record<string, any>,
}
```

---

### 6.3 SQL Компилятор (planner.ts)

**Файл:** `dashboard/src/lib/semantic/planner.ts` (~1793 строки)

Ключевая функция: `compileSemanticQuery(request: SemanticQueryRequest): CompiledQuery`

**Возможности компилятора:**
- **JOIN-автоматика:** автоматическое построение JOIN-пути между моделями (BFS, проверка неоднозначности)
- **Bidirectional cross-filtering** (Power BI-like): `direction: "both"` в join-определениях
- **Inactive relationships** (Power BI-like): `active: false` исключает join из автоматических путей
- **RLS (Row-Level Security):** автоматическое добавление WHERE-условий по роли
- **Window functions:** интеграция с `windowBuilder.ts`
- **Pivot:** интеграция с `pivot.ts`
- **Retention:** интеграция с `retentionBuilder.ts`
- **Диалекты SQL:** `clickhouse`, `postgres`, `mssql`
- **Пагинация:** `page` / `pageSize` / `limit` / `offset`
- **Сортировка:** многоуровневая, по dimension/measure refs
- **Фильтры:** WHERE и HAVING (автоматическое разделение)
- **Алиасы:** поддержка `{{alias}}` в SQL-выражениях
- **Формульный движок:** интеграция с `formulaRegistry`

**scopeBiFiltersForRequest()** — Power BI-совместимая фильтрация по скоупу:
```typescript
// report scope → включать всегда
// page scope → только если pageKey совпадает
// visual scope → только если chartId совпадает
```

---

### 6.4 Валидатор (validator.ts)

**Файл:** `dashboard/src/lib/semantic/validator.ts` (~386 строк)

Полная валидация модели и запросов:
- `validateSemanticModelV1()` — проверка структуры модели
- `validateLogicalQuery()` — проверка корректности запроса к модели
- `validateSemanticQueryRequest()` — валидация HTTP-запроса
- SQL-инъекция защита: блокировка `DROP, ALTER, INSERT, UPDATE, DELETE, TRUNCATE, CREATE, GRANT, REVOKE`

---

### 6.5 Window Builder (windowBuilder.ts)

**Файл:** `dashboard/src/lib/semantic/windowBuilder.ts`

Генерация SQL window functions для 3 диалектов:
- `buildWindowAgg()` — произвольная оконная агрегация
- `buildRollingAvg()` — скользящее среднее (N preceding, 0 following)
- `wrapWithWindowLayer()` — обёртка запроса в слой window expressions

---

### 6.6 Formula Registry

**Файл:** `dashboard/src/lib/semantic/formulaRegistry.ts`

Реестр вычисляемых функций (DataLens-style формулы). Позволяет использовать именованные функции в SQL-выражениях семантических моделей.

---

### 6.7 Expression Engine

**Файл:** `dashboard/src/lib/semantic/expressionEngine.ts`

Движок вычисления выражений для семантического слоя. Поддерживает ссылки на поля модели (`Model.field`).

---

### 6.8 Pivot Engine

**Файлы:** `pivot.ts`, `pivotClientCompute.ts`

- `pivot.ts` — серверная генерация SQL-pivot запросов
- `pivotClientCompute.ts` — клиентская pivot-трансформация результатов

---

### 6.9 Retention Engine

**Файлы:** `retentionBuilder.ts`, `retentionCompiler.ts`, `retentionResult.ts`

Система для когортного retention-анализа:
- `retentionBuilder.ts` — построение SQL для retention-запросов
- `retentionCompiler.ts` — компиляция retention-конфигурации
- `retentionResult.ts` — трансформация результатов в матрицу retention

---

### 6.10 Auto Semantic Model

**Файл:** `dashboard/src/lib/semantic/autoSemanticModel.ts`

Автоматическая генерация `SemanticModelV1` из метаданных таблицы:
- Определяет типы полей (time, number, string, boolean)
- Создаёт dimensions и measures
- Определяет `defaultTimeDimension`
- Применяет safe-identifier трансформацию к именам колонок

---

### 6.11 Schema Intelligence

**Путь:** `dashboard/src/lib/schema-intelligence/`

Сервис классификации схемы для построения семантической модели:
- `SchemaIntelligenceService.ts` — основной сервис
- `typeClassifier.ts` — классификатор типов полей
- `examples.ts` — примеры для AI-ассистированной классификации

---

### 6.12 API Endpoints семантического слоя

| Endpoint | Назначение |
|----------|------------|
| `POST /api/semantic/bootstrap` | Инициализация семантической модели по connectionId/tableKey |
| `POST /api/semantic/query` | Компиляция + выполнение семантического запроса |
| `POST /api/semantic/compile` | Только компиляция (без выполнения) |
| `POST /api/semantic/binding` | Получение field bindings для семантической модели |
| `GET /api/semantic/sources` | Список источников данных |
| `POST /api/semantic/values` | Уникальные значения поля для слайсеров; тело может включать **`sortOrder`**: `asc` \| `desc` |
| `POST /api/semantic/retention` | Retention-анализ через семантический слой |

---

## 7. DataTalk Agent — Сервис обнаружения и запросов к БД

### 7.1 Обзор

Standalone TypeScript-микросервис (Fastify), изолированный от Next.js. Обеспечивает:
1. Автообнаружение БД в Docker/сети/файловой системе
2. Интроспекцию схем
3. Безопасное выполнение SQL-запросов

### 7.2 Эндпоинты (datatalk-agent)

| Endpoint | Описание |
|----------|----------|
| `GET /health` | Статус сервиса |
| `POST /query` | Выполнить SQL; параметры: `connectionId`, `sql`, `params` |
| `POST /schema` | Получить схему: `connectionId`, `tableKey` (опционально) |
| `POST /discover` | Обнаружить БД в локальной сети/Docker |
| `POST /test-connection` | Тест подключения с конфигурацией |

### 7.3 Обнаружение БД (Discovery)

**Модули:**
- `dockerDiscovery.ts` — опрос Docker API для нахождения контейнеров с БД
- `networkScanner.ts` — TCP port scan стандартных портов БД (5432, 3306, 1433, 8123, 9000, 27017...)
- `fileDiscovery.ts` — поиск файлов БД на диске (SQLite)

### 7.4 Role-Based SQL Policy

В `index.ts` агента реализована политика доступа:
- Роль `user` — только SELECT-запросы
- Роль `business` — SELECT + некоторые DDL-подобные операции
- Роль `data-admin` — полный доступ

---

## 8. ClickHouse Analytics — Event Analytics Layer

### 8.1 Обзор

Слой аналитики событий, аналогичный Mixpanel/Amplitude. Использует ClickHouse как OLAP-хранилище.

### 8.2 API Endpoints (`/api/rest/*`)

| Endpoint | Тип аналитики |
|----------|---------------|
| `/api/rest/activity` | Активность пользователей (time series) |
| `/api/rest/analytics-activity-24h` | Активность за 24 часа |
| `/api/rest/analytics-devices` | Разбивка по устройствам |
| `/api/rest/analytics-event-types` | Типы событий |
| `/api/rest/analytics-traffic` | Трафик |
| `/api/rest/analytics-trend` | Тренды |
| `/api/rest/events` | Список событий |
| `/api/rest/events-table` | Табличный вид событий |
| `/api/rest/top-events` | Топ событий |
| `/api/rest/traffic-breakdown` | Разбивка трафика |
| `/api/rest/user-flows` | User journey / paths |
| `/api/rest/funnel` | Funnel анализ |
| `/api/rest/cyber-funnel` | Тематический funnel (cyber UI) |
| `/api/rest/retention` | Retention-матрица |
| `/api/rest/users-graph` | Граф пользователей |
| `/api/rest/anomalies` | Аномалии в данных |
| `/api/rest/anomalies/frontend` | Frontend-специфичные аномалии |

### 8.3 UI Страницы аналитики

- `app/analytics/page.tsx` — общая аналитика
- `app/events/page.tsx` — события
- `app/users/page.tsx` — пользователи
- `app/activity/page.tsx` — активность
- `app/metrics/page.tsx` — метрики

### 8.4 Компоненты аналитики

**Путь:** `dashboard/src/components/analytics/`

| Компонент | Назначение |
|-----------|------------|
| `BarChartModule.tsx` | Bar chart модуль для аналитики |
| `CyberFunnelModule.tsx` | Воронка с cyber-темой |
| `EChartsCanvas.tsx` | Базовый ECharts wrapper |
| `TrendChartModule.tsx` | Trend chart |
| `UPlotTrendModule.tsx` | High-performance uPlot trend |
| `UserFlowModule.tsx` | User flow визуализация |
| `cyberTheme.ts` | Тёмная cyber-тема для ECharts |

---

## 9. Система управления соединениями

### 9.1 Metadata DB (datatalk_meta)

Все соединения хранятся в PostgreSQL (`datatalk_meta.connections`):
```sql
id, name, type, host, port, database, username, password (encrypted), ssl_enabled, created_at
```

**Шифрование:** `dashboard/src/lib/datatalkCrypto.ts` — шифрование credentials перед сохранением.

### 9.2 Connection Presets

**Файл:** `dashboard/src/lib/connectionPresets.ts`  
Предустановленные шаблоны подключений для быстрого старта.

### 9.3 Connection Wizard

**Путь:** `dashboard/src/components/connection/`

Многошаговый мастер подключения:
1. `DriverSelectionStep.tsx` — выбор типа СУБД
2. `BasicConnectionStep.tsx` — host, port, database, credentials
3. `NetworkStep.tsx` — настройки сети
4. `SSLStep.tsx` — SSL/TLS конфигурация
5. `AdvancedPropertiesStep.tsx` — расширенные параметры (JDBC-style properties)
6. `ReviewStep.tsx` — итоговый обзор и тест

### 9.4 Driver Registry

**Файл:** `dashboard/src/lib/db-drivers/DriverRegistry.ts` (~392 строки)

Реестр поддерживаемых драйверов БД:
- PostgreSQL
- MySQL / MariaDB
- Microsoft SQL Server
- ClickHouse
- Дополнительные (через конфигурацию)

### 9.5 Connection State Provider

**Файл:** `dashboard/src/providers/ConnectionStateProvider.tsx` (~179 строк)

React Context для состояния подключения:
- Список соединений (`/api/datatalk/connections`)
- Активное соединение (`/api/connection/status`)
- `refreshConnectionState()` — принудительное обновление

### 9.6 Default Connection Pick

**Файл:** `dashboard/src/lib/defaultConnectionPick.ts`

Детерминированный алгоритм выбора соединения по умолчанию:
1. Если задан `DATATALK_DEFAULT_CONNECTION_NAME` — ищет по имени
2. Иначе — первое соединение по alphabetical sort (стабильно)

---

## 10. Система загрузки файлов (File Upload)

### 10.1 Обзор

Пользователь может загрузить CSV или Excel (`.xlsx`, `.xls`): файл материализуется в **ту же PostgreSQL**, что и `datatalk_meta` (пул `DATATALK_META_PG_*`), в схему **`pa_upload`**. Таблица получает имя вида `pa_upload.file_<uuid>`; в ответе API приходит **`tableKey`** для подключения к чарту / DataTalk.

**Точка входа UI:** домашняя страница — `app/home/page.tsx` + `HomeClient.tsx` (блок с `FileUploadDropZone`).

### 10.2 Поток Excel vs CSV

| Тип | Шаги |
|-----|------|
| **CSV** | `FormData`: поле `file` → `POST /api/uploads/dataset` (поле `sheet` не нужно). |
| **Excel** | Сначала `POST /api/uploads/sheets` с тем же файлом → список листов; пользователь выбирает лист → затем `POST /api/uploads/dataset` с `file` + **`sheet`** (имя листа). Для `.xlsx`/`.xls` без `sheet` API вернёт ошибку. |

### 10.3 Лимиты и формат данных (`UPLOAD_LIMITS`)

Задано в `dashboard/src/lib/uploads/materializeToPostgres.ts`:

| Параметр | Значение |
|----------|----------|
| Макс. размер файла | 50 MiB |
| Макс. строк данных | 500 000 (после заголовка) |
| Макс. колонок | 300 |
| Шаг батча в цикле вставки | 500 строк (вставка выполняется построчно в одной транзакции) |

Первая строка файла — **заголовок**; требуется минимум одна строка данных.

### 10.4 Компоненты и ответ API

**UI:** `dashboard/src/components/home/FileUploadDropZone.tsx` (~224 строки)
- Drag-and-drop и выбор файла
- CSV и Excel; для Excel — запрос листов и модальный выбор листа
- Состояния загрузки и ошибок; после успеха — `onUploadSuccess` / `onEnsureSlot` (актуализация слота «Local Postgres»)

**API:**
- `POST /api/uploads/sheets` — только `.xlsx`/`.xls`, FormData: `file` → `{ data: { sheets: string[] } }`
- `POST /api/uploads/dataset` — FormData: `file`, опционально `sheet` (обязательно для Excel). Успех: `{ data: { connectionId, tableKey, tableName, rowCount, columnNames, displayName } }`

**Материализация:** `dashboard/src/lib/uploads/materializeToPostgres.ts`
- CSV: `papaparse` (значения как строки)
- Excel: `xlsx`, лист по имени или первый лист
- `CREATE TABLE`: **все колонки — `TEXT`** (MVP: без автоматического вывода типов SQL; касты — на стороне запросов)
- Санитизация имён колонок из заголовка

**Соединение:** `dashboard/src/lib/uploads/resolveUploadConnection.ts`
- **`PA_UPLOAD_CONNECTION_NAME`** (по умолчанию **`Local Postgres`**), сравнение имени без учёта регистра
- Если не найдено — первое соединение с типом `postgres` в metadata DB
- См. `.env.example`

---

## 11. Система чартов и визуализации

### 11.1 Chart Style System

**Путь:** `dashboard/src/lib/chart-style-system/`

- `ChartStyleConfig.ts` — конфигурация стилей чартов
- `ChartTemplates.tsx` — шаблоны чартов (предустановленные конфигурации)
- `README.md` — документация системы стилей

### 11.2 DataLens Chart Configs

**Файл:** `dashboard/src/lib/datalensChartConfigs.ts` (~437 строк)

Набор helper-функций для конфигурации ECharts в стиле DataLens:
- `getDataLensBarConfig()` — конфиг bar chart
- `getDataLensLineConfig()` — конфиг line chart
- `getDataLensScatterConfig()` — конфиг scatter chart
- `getDataLensTooltipConfig()` — tooltip styling
- `getDataLensLegendConfig()` — legend styling
- `getDataLensGridConfig()` — grid layout

### 11.3 Chart Theme

**Файл:** `dashboard/src/lib/chartTheme.ts`

Тёмная тема для всех чартов (cyber/dark aesthetic).

### 11.4 Chart Config Panel

**Путь:** `dashboard/src/components/chart-config/`

Компоненты конфигурационной панели чарта (модальное окно настройки):
- `ChartConfigModal.tsx` — главное модальное окно
- `AIChartAssistant.tsx` — AI-ассистент для конфигурации
- `ColorPicker.tsx`, `NumberInput.tsx`, `RangeSlider.tsx`, `SelectDropdown.tsx`, `ToggleSwitch.tsx` — контролы

### 11.5 SQL Type to Physical Kind Mapper

**Файл:** `dashboard/src/lib/chart/sqlTypePhysicalKind.ts`

Маппинг SQL типов данных (varchar, int, timestamp, etc.) в физические типы для системы чартов.

### 11.6 ECharts Renderer

**Компоненты:**
- `dashboard/src/components/visualization/EChartsRenderer.tsx` — стандартный рендерер
- `dashboard/src/components/charts/BaseChart.tsx` — базовый chart wrapper с ChartActionsMenu
- `dashboard/src/components/analytics/EChartsCanvas.tsx` — analytics-specific wrapper

### 11.7 Chart Actions Menu

**Компонент:** `dashboard/src/components/charts/ChartActionsMenu.tsx`

Контекстное меню чарта: экспорт PNG, SVG, данных CSV, AI-объяснение.

---

## 12. AI-сервисы

### 12.1 AI Chart Explanation

**API:** `POST /api/ai/explain-chart`  
**Компонент:** `dashboard/src/components/charts/ChartExplainModal.tsx`

Объяснение содержимого чарта через LLM (предположительно Dify API или прямой OpenAI).

### 12.2 AI Insights

**API:** `GET /api/insights`, `GET /api/insights/history`  
**Компонент:** `dashboard/src/components/widgets/AIInsightCard.tsx`, `AnalystInsights.tsx`  
**Страница:** `app/ai-insights/page.tsx`

Автоматическая генерация инсайтов из данных.

### 12.3 AI Chart Assistant

**Компонент:** `dashboard/src/components/chart-config/AIChartAssistant.tsx`

Интерактивный AI-ассистент в панели конфигурации чарта.

### 12.4 Command Parser (Natural Language)

**API:** `POST /api/commands/parse`  
**Файл:** `dashboard/src/lib/dashboard/commandExecutor.ts`

Парсинг натуральноязыковых команд управления дашбордом.

---

## 13. Безопасность: Auth, RLS, GDPR

### 13.1 Аутентификация

**Компоненты:** `dashboard/src/components/auth/`
- `LoginForm.tsx` — форма входа
- `RequireRole.tsx` — HOC для защиты роутов по роли
- `RoleProvider.tsx` — контекст ролей

**Роли:** `user`, `business`, `data-admin`

**JWT:** `dashboard/src/lib/credentialVault.ts`, `jsonwebtoken`

### 13.2 Row-Level Security (RLS)

Реализован в семантическом слое (`planner.ts`):
```typescript
rls?: Array<{
  field: string;   // "Model.fieldName"
  op: LogicalFilter["op"];
  param: string;   // параметр из context.params
}>
```

Автоматически добавляет WHERE-условия при компиляции SQL на основе роли пользователя и параметров контекста.

### 13.3 GDPR Compliance

**API:**
- `GET /api/gdpr/export` — экспорт данных пользователя
- `DELETE /api/gdpr/delete` — удаление данных пользователя

**Файл:** `dashboard/src/lib/gdprCompliance.ts`

### 13.4 Data Masking

**Файл:** `dashboard/src/lib/dataMasking.ts`

Маскировка чувствительных данных в результатах запросов.

### 13.5 Credential Sanitizer

**Файл:** `dashboard/src/lib/credentialSanitizer.ts`

Удаление чувствительных полей из объектов перед логированием/выводом.

### 13.6 Rate Limiting

**Файл:** `dashboard/src/lib/rateLimit.ts`

Rate limiter для API endpoints.

---

## 14. Инфраструктура и DevOps

### 14.1 Docker Compose

**Файл:** `docker-compose.yml` — полный стек:
- `ingest` (Vector) — event pipeline
- `storage` (ClickHouse) — OLAP
- `postgres` (PostgreSQL 14) — metadata
- `postgres-init` — инициализация схемы
- `mysql` (MySQL 8.4) — demo DB
- `mssql` (SQL Server 2022) — demo DB
- `mssql-init` — инициализация MSSQL
- `datatalk-agent` — агент
- `dashboard` — Next.js app
- `ai-service` — AI сервис (опционально)

**Файл:** `docker-compose.dev.yml` — упрощённый стек для разработки.

### 14.2 Dockerfiles

| Сервис | Особенности |
|--------|-------------|
| `dashboard/Dockerfile` | Multi-stage, Node 20, Next standalone output |
| `datatalk-agent/Dockerfile` | TypeScript build → dist/index.js |
| `ai-service/Dockerfile` | Python image |
| `ingest/Dockerfile` | Vector image |
| `storage/Dockerfile` | ClickHouse с custom init |

### 14.3 Performance Monitoring

**Файл:** `dashboard/src/lib/performance-monitor.ts`  
**Hook:** `dashboard/src/hooks/usePerformanceMonitor.ts`

Web Vitals и custom performance metrics.

### 14.4 Query Observability

**Файл:** `dashboard/src/lib/queryObservability.ts`

Логирование и трейсинг запросов к БД.

### 14.5 Query Result Cache

**Файл:** `dashboard/src/lib/queryResultCache.ts`

LRU-кэш для результатов семантических запросов.

### 14.6 Audit Log

**Файл:** `dashboard/src/lib/auditLog.ts`  
**API:** `GET /api/audit`

Журнал аудита действий пользователей.

---

## 15. API-поверхность (полная карта)

### 15.1 Connection & Discovery

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/connect` | POST | Установить соединение |
| `/api/test-connection` | POST | Протестировать соединение |
| `/api/connection/status` | GET | Статус текущего соединения |
| `/api/connection-presets` | GET | Список пресетов |
| `/api/discover` | POST | Автообнаружение БД |

### 15.2 DataTalk Proxy

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/datatalk/query` | POST | SQL к внешней БД |
| `/api/datatalk/schema` | POST | Схема БД/таблицы |
| `/api/datatalk/connections` | GET/POST | Управление соединениями |
| `/api/datatalk/semantic-model` | GET/POST | Одна семантическая модель |
| `/api/datatalk/semantic-models` | GET | Список моделей |
| `/api/datatalk/health` | GET | Здоровье агента |
| `/api/datatalk/audit` | GET | Аудит DataTalk |

### 15.3 Semantic Layer

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/semantic/bootstrap` | POST | Инициализация модели |
| `/api/semantic/query` | POST | Семантический запрос |
| `/api/semantic/compile` | POST | Компиляция SQL |
| `/api/semantic/binding` | POST | Field bindings |
| `/api/semantic/sources` | GET | Источники данных |
| `/api/semantic/values` | POST | Уникальные значения (опц. `sortOrder`: asc/desc) |
| `/api/semantic/retention` | POST | Retention-запрос |

### 15.4 Analytics REST (ClickHouse)

| Endpoint | Назначение |
|----------|------------|
| `/api/rest/activity` | Активность |
| `/api/rest/analytics-*` | Analytics (trend, devices, traffic, events) |
| `/api/rest/events*` | События |
| `/api/rest/funnel` | Воронка |
| `/api/rest/cyber-funnel` | Воронка (cyber тема) |
| `/api/rest/retention` | Retention |
| `/api/rest/user-flows` | User flow |
| `/api/rest/users-graph` | Граф пользователей |
| `/api/rest/anomalies*` | Аномалии |
| `/api/rest/top-events` | Топ событий |
| `/api/rest/traffic-breakdown` | Breakdown трафика |

### 15.5 Uploads

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/uploads/dataset` | POST | Загрузка CSV/XLSX |
| `/api/uploads/sheets` | POST | Листы Excel |

### 15.6 AI & Insights

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/ai/explain-chart` | POST | Объяснение чарта |
| `/api/insights` | GET | Список инсайтов |
| `/api/insights/history` | GET | История инсайтов |
| `/api/commands/parse` | POST | Парсинг команд |

### 15.7 System

| Endpoint | Метод | Назначение |
|----------|-------|------------|
| `/api/init` | POST | Инициализация системы |
| `/api/audit` | GET | Журнал аудита |
| `/api/profiles` | GET/POST | Профили пользователей |
| `/api/projects` | GET/POST | Проекты |
| `/api/metrics` | GET | Метрики системы |
| `/api/metrics/query` | POST | Запрос метрик |
| `/api/ingest/seed` | POST | Seed данных |
| `/api/ingest/status` | GET | Статус ingest |
| `/api/geo/world` | GET | Geo данные |
| `/api/gdpr/export` | GET | GDPR export |
| `/api/gdpr/delete` | DELETE | GDPR delete |

---

## 16. Что заимствовано из Power BI

### 16.1 Реализованные концепции Power BI

| Функция Power BI | Реализация в Pocket Analyst | Файлы |
|------------------|----------------------------|-------|
| **Report Canvas** — свободный drag-and-drop canvas для размещения визуализаций | `DragDropCanvas.tsx` (~2587 стр.) | `components/dashboard/DragDropCanvas.tsx` |
| **Visualizations Pane** — библиотека типов чартов | `ChartLibrarySlideIn.tsx` | `components/dashboard/ChartLibrarySlideIn.tsx` |
| **Fields Pane** — панель полей схемы данных | `FieldsSlideInPanel.tsx` (~1507 стр.) | `components/dashboard/FieldsSlideInPanel.tsx` |
| **Filters Pane** — панель фильтров | `FiltersSlideInPanel.tsx` (~1512 стр.) | `components/dashboard/FiltersSlideInPanel.tsx` |
| **Slicer Visual** — интерактивный визуальный фильтр | `SlicerVisual.tsx` + `slicer/*` (~760 стр. корень) | `components/dashboard/SlicerVisual.tsx` |
| **Build Mode** — маппинг полей на оси чарта | `ColumnMappingPanel.tsx` | `components/dashboard/ColumnMappingPanel.tsx` |
| **Filter Scopes** — report/page/visual скоупы | `biFiltersContext.tsx`, `requestContext.ts` | `store/biFiltersContext.tsx` |
| **Cross-filtering (постоянная)** — фильтры от панели и кликов, сохранённые в контексте | `biFiltersContext` + `scopeBiFiltersForRequest()` | `store/biFiltersContext.tsx`, `lib/semantic/planner.ts` |
| **Cross-filtering (transient)** — временный `eq` по клику на другом визуале | `CrossSelectionContext` + `ChartPreview` + `resolveVisualInteractionMode()` | `store/crossSelectionContext.tsx`, `components/dashboard/ChartPreview.tsx`, `lib/visualInteractions.ts` |
| **Cross-highlight** — подсветка/затемнение на целевых чартах | ECharts `highlight`/`downplay` + шина взаимодействий | `components/charts/BaseChart.tsx`, `context/ChartInteractionBus.tsx` |
| **Edit Interactions** — назначение filter/highlight/none между визуалами | `VisualInteractionsMap` в проекте | `store/visualInteractionsContext.tsx`, `DashboardDock.tsx`, `ChartWindow.tsx`, `DragDropCanvas.tsx` |
| **Relationships** — связи между моделями данных | `SemanticJoinV1` в `types.ts` | `lib/semantic/types.ts` |
| **Inactive Relationships** — неактивные связи | `active: false` в join config | `lib/semantic/planner.ts` |
| **Bidirectional Cross-filter** — двунаправленная фильтрация | `direction: "both"` | `lib/semantic/planner.ts` |
| **Drill-down** — детализация по уровням | `DrillBreadcrumbControls.tsx` | `components/dashboard/DrillBreadcrumbControls.tsx` |
| **Row-Level Security (RLS)** — безопасность на уровне строк | `rls` в SemanticModelV1, planner | `lib/semantic/types.ts`, `planner.ts` |
| **DAX-like measures** — вычисляемые меры | `calculatedMeasures` + `formulaRegistry` | `lib/semantic/formulaRegistry.ts` |
| **MiniMap** — миникарта дашборда | `MiniMap.tsx` | `components/dashboard/MiniMap.tsx` |
| **Database Explorer** — обозреватель схем БД | `DbSlideInPanel.tsx`, `DbExplorerModal.tsx` | `components/dashboard/` |
| **Multiple data sources** — подключение нескольких источников | Connection management system | `lib/datatalkMetaDb.ts` |
| **Export visuals** — экспорт визуализаций | `html-to-image` + `ChartActionsMenu` | `components/charts/ChartActionsMenu.tsx` |

### 16.2 Концепции из Power BI в семантическом слое

| Power BI концепция | Реализация |
|--------------------|------------|
| Semantic Model | `SemanticModelV1` (types.ts) |
| Measure | `measures` в модели |
| Dimension | `dimensions` в модели |
| Calculated Column | `calculatedMeasures` |
| Calculated Table | частично через `calculatedFields` |
| Aggregation | `AggFn`: sum, avg, count, countDistinct, min, max |
| Time Intelligence | `LogicalTime` + granularity |
| Many-to-One / One-to-Many / One-to-One | `SemanticJoinType` |
| Filter Context | `GlobalFilterContextV1` |
| CALCULATE (частично) | через `measureAggOverrides` |

---

## 17. Что заимствовано из DataLens

### 17.1 Архитектурные концепции

> **Важно:** Код DataLens (Python backend, TypeScript UI) из папки `source-code/` **не используется напрямую** в рантайме Pocket Analyst. Это исходный код для изучения, не для исполнения. Pocket Analyst реализует **собственную TypeScript версию** семантического слоя, **вдохновлённую** DataLens.

| DataLens концепция | Реализация в Pocket Analyst |
|--------------------|----------------------------|
| **Semantic Layer** — декларативное описание модели данных | `SemanticModelV1` в `types.ts` |
| **Dataset / Source Binding** | `SemanticModelSourceBinding` |
| **Query compilation** — компиляция логического запроса в SQL | `compileSemanticQuery()` в `planner.ts` |
| **Multiple SQL dialects** | `SqlDialect: "clickhouse" \| "postgres" \| "mssql"` |
| **Formula/Expression Engine** | `formulaRegistry.ts`, `expressionEngine.ts` |
| **Window Functions** | `windowBuilder.ts` (аналог `dl_formula` window layer) |
| **Pivot** | `pivot.ts`, `pivotClientCompute.ts` (аналог `dl_pivot`) |
| **Field type classification** | `fieldClassifier.ts`, `schema-intelligence/typeClassifier.ts` |
| **Chart configs** | `datalensChartConfigs.ts` — DataLens-style ECharts конфиги |
| **Retention / Cohort Analysis** | `retentionBuilder.ts` + `retentionCompiler.ts` |
| **RLS** | `rls` array в модели (аналог `dl_rls`) |
| **Source bindings** | `sourceBindings` в `SemanticQueryRequest` |
| **Global Filter Context** | `GlobalFilterContextV1` (аналог DataLens global filters) |

### 17.2 UI/UX из DataLens

| DataLens UI элемент | Pocket Analyst |
|---------------------|----------------|
| Chart styling guide (тёмная тема) | `datalensChartConfigs.ts`, `chartTheme.ts` |
| Chart types набор | Покрывает ~70% DataLens chart types |
| Chart config panel | `chart-config/ChartConfigModal.tsx` |
| Dataset preview | частично через DB Explorer |

### 17.3 Что из `source-code/` НЕ используется в рантайме

| Компонент source-code/ | Статус |
|------------------------|--------|
| `datalens-backend/` (Python) | Reference only — не запускается |
| `datalens-ui/` (TypeScript) | Reference only — не запускается |
| `clickhouse-jdbc/` (Java) | Reference only — не запускается |
| DataLens DashKit | Не используется; свой DragDropCanvas |
| DataLens ChartKit | Не используется; ECharts напрямую |
| DataLens Formula (dl_formula) | Не используется; своя formulaRegistry |
| DataLens Connectors (dl_connector_*) | Не используется; DataTalk Agent |

---

## 18. Что НЕ реализовано из Power BI (Gap Analysis)

| Функция Power BI | Статус | Приоритет |
|-----------------|--------|-----------|
| **Bookmarks** — сохранение состояния страницы | ❌ Отсутствует | Высокий |
| **Personal Bookmarks** | ❌ Отсутствует | Средний |
| **Report Themes** через UI | ❌ Нет UI, только код | Средний |
| **Q&A Visual** — вопросы на естественном языке | ⚠️ Частично (командная строка) | Высокий |
| **Smart Narratives** — автоматический нарратив | ❌ Отсутствует | Средний |
| **Key Influencers Visual** | ❌ Отсутствует | Низкий |
| **Decomposition Tree** | ❌ Отсутствует | Низкий |
| **AI-driven insights** на canvas | ⚠️ Частично (AI insights page) | Средний |
| **Mobile layouts** | ❌ Отсутствует | Средний |
| **Multi-page reports** с навигацией | ⚠️ Частично (pageKey в фильтрах) | Высокий |
| **Buttons & Actions** — кнопки-действия на canvas | ❌ Отсутствует | Средний |
| **Conditional formatting** — условное форматирование | ❌ Отсутствует | Средний |
| **Paginated Reports** | ❌ Отсутствует | Низкий |
| **Dataflows** — ETL в UI | ❌ Отсутствует | Низкий |
| **Report subscriptions / scheduling** | ❌ Отсутствует | Средний |
| **Sharing & collaboration** | ❌ Отсутствует | Высокий |
| **Comments on visuals** | ❌ Отсутствует | Низкий |
| **Print / PDF export** | ⚠️ Частично (PNG export) | Средний |
| **Spotlight mode** для визуалов | ❌ Отсутствует | Низкий |
| **Visual-level filters** UI | ⚠️ Частично (scope=visual) | Средний |
| **Page-level filters** UI | ⚠️ Частично (scope=page) | Средний |
| **Sync slicers** across pages | ❌ Отсутствует | Средний |
| **Hierarchies** в модели данных | ❌ Отсутствует | Средний |
| **Date tables** с time intelligence функциями | ⚠️ Частично (LogicalTime) | Высокий |
| **Parameters** — динамические параметры в отчётах | ⚠️ Частично (params в context) | Средний |
| **Cross-highlight 1:1 как в Power BI** (точное затемнение всех типов визуалов) | ⚠️ Частично (ECharts по имени категории/серии; ограничения scatter/heatmap) | Средний |
| **Cross-filter с мультивыбором / несколькими полями** с одного визуала | ⚠️ Частично (одно значение `eq` в transient-режиме) | Средний |
| **Edit Interactions** — полная матрица как в PBI Desktop | ⚠️ Частично (per-target на карточке + дефолты по типу чарта) | Средний |

---

## 19. Что НЕ реализовано из DataLens (Gap Analysis)

| Функция DataLens | Статус |
|-----------------|--------|
| **DashKit** — полный фреймворк дашбордов DataLens | Заменён на DragDropCanvas |
| **ChartKit** — библиотека чартов DataLens | Заменён на ECharts + datalensChartConfigs |
| **Полный набор формул** (dl_formula) — 200+ функций | Частично через formulaRegistry |
| **Prepared data sources** (датасеты DataLens) | Аналог через sourceBindings |
| **Connection manager** (DataLens style) | Заменён на datatalk-agent |
| **Public charts / embedding** | Отсутствует |
| **Collections** | Отсутствует |
| **Navigation dashboards** (DataLens nav) | Частично через projects |
| **Alert / notifications** | Отсутствует |
| **Schedule / snapshot** | Отсутствует |

---

## 20. Технический долг и известные проблемы

### 20.1 Критические

| Проблема | Файл | Описание |
|----------|------|----------|
| **Build игнорирует TS ошибки** | `next.config.ts` | `ignoreBuildErrors: true` — скрывает реальные баги |
| **ESLint отключён в build** | `next.config.ts` | `ignoreDuringBuilds: true` |
| **Нет middleware.ts** | — | Отсутствует глобальная авторизация роутов |
| **Нет instrumentation.ts** | — | Нет server-side инициализации |

### 20.2 Высокий приоритет

| Проблема | Описание |
|----------|----------|
| Multi-page dashboard | `pageKey` есть в типах и фильтрах, но отсутствует UI для нескольких страниц дашборда |
| Bookmarks | Полностью отсутствует, хотя технически реализуемо через существующий state |
| MySQL init scripts | `datatalk-db-init/mysql/` — нет файлов инициализации (docker-compose ссылается) |
| DataTalk Agent shared secret | Настройка безопасности не документирована в .env.example |
| `source-code/` в репозитории | ~GBs vendor кода занимает место, не используется в рантайме |

### 20.3 Средний приоритет

| Проблема | Описание |
|----------|----------|
| Дублирующие компоненты | `RetentionMatrix` дублирован в двух местах |
| Мёртвые workers | `offscreen.worker.ts`, `visualization.worker.ts` не используются |
| Мёртвые компоненты | `Navigation.tsx`, `AnimatedGrid.tsx`, `OffscreenRenderer.tsx`, `InteractiveDashboard.tsx` |
| Chart demo pages | 10+ одиночных страниц чартов не связаны с навигацией |
| `backup.ts` | Неполная функциональность, не импортируется |
| `DatabaseConnectionModal.tsx.backup` | Backup-файл в репозитории |
| Визуальные взаимодействия | Cross-highlight зависит от типа чарта и имён в ECharts; для части визуалов нужны доработки (dataIndex, прозрачность) |

### 20.4 Отсутствующая документация

| Что нужно |
|-----------|
| API аутентификация — как именно работает JWT flow |
| DataTalk Agent deployment конфигурация |
| Полная схема datatalk_meta |
| Как добавить новый тип коннектора |
| Как создать новый тип чарта |

---

## 21. Структура репозитория (полная карта файлов)

```
PocketAnalyst_RESTORED_20260204_0430/
├── README.md                          # Главный README
├── START.md                           # Быстрый старт
├── HOW_IT_WORKS.md                    # Детали DB Discovery
├── CHART_BUILDER_FIX.md               # Фиксы Chart Builder
├── DATALENS_INTEGRATION.md            # Интеграция DataLens
├── EXTRA.md                           # Дополнительные заметки
├── M3_FILTERS_STATUS.md               # Статус Milestone 3 (фильтры)
├── DOCUMENTATION.md                   # ← Этот файл
├── TRASH.md                           # Список неиспользуемых файлов
├── .env.example                       # Шаблон переменных окружения
├── .gitignore
├── docker-compose.yml                 # Полный Docker стек
├── docker-compose.dev.yml             # Dev Docker стек
│
├── dashboard/                         # Next.js 15 приложение
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── playwright.config.ts
│   ├── vitest.config.ts               # Unit-тесты (semantic, dashboard store)
│   ├── e2e/                           # Playwright тесты
│   │   ├── filters-date.spec.ts
│   │   ├── slicer-open-as-slicer.spec.ts
│   │   └── ux-uplift-smoke.spec.ts
│   ├── scripts/                       # Maintenance скрипты
│   └── src/
│       ├── app/                       # Next.js App Router
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   ├── activity/page.tsx
│       │   ├── ai-insights/page.tsx
│       │   ├── analytics/page.tsx
│       │   ├── bar/page.tsx           [DEMO]
│       │   ├── bubble/page.tsx        [DEMO]
│       │   ├── choropleth/page.tsx    [PLACEHOLDER]
│       │   ├── connect/page.tsx
│       │   ├── dashboard/page.tsx     ← Главная страница продукта
│       │   ├── datatalk/
│       │   │   ├── page.tsx
│       │   │   ├── audit/page.tsx
│       │   │   └── dashboards/page.tsx  [HIDDEN]
│       │   ├── events/page.tsx
│       │   ├── heatmap/page.tsx       [DEMO]
│       │   ├── home/
│       │   │   ├── HomeClient.tsx
│       │   │   └── page.tsx
│       │   ├── ingest/page.tsx
│       │   ├── line/page.tsx          [DEMO]
│       │   ├── metrics/page.tsx
│       │   ├── pie/page.tsx           [DEMO]
│       │   ├── sankey/page.tsx        [DEMO]
│       │   ├── scatter/page.tsx       [DEMO]
│       │   ├── settings/page.tsx
│       │   ├── storage/page.tsx
│       │   ├── treemap/page.tsx       [DEMO]
│       │   ├── users/page.tsx
│       │   ├── voronoi/page.tsx       [PLACEHOLDER]
│       │   └── api/                   # API Route Handlers
│       │       ├── ai/explain-chart/route.ts
│       │       ├── audit/route.ts
│       │       ├── commands/parse/route.ts
│       │       ├── connect/route.ts
│       │       ├── connection/status/route.ts
│       │       ├── connection-presets/route.ts
│       │       ├── datatalk/
│       │       │   ├── audit/route.ts
│       │       │   ├── connections/route.ts
│       │       │   ├── health/route.ts
│       │       │   ├── query/route.ts
│       │       │   ├── schema/route.ts
│       │       │   ├── semantic-model/route.ts
│       │       │   └── semantic-models/route.ts
│       │       ├── discover/route.ts
│       │       ├── example-protected/route.ts  [UNUSED]
│       │       ├── gdpr/
│       │       │   ├── delete/route.ts
│       │       │   └── export/route.ts
│       │       ├── geo/world/route.ts
│       │       ├── ingest/
│       │       │   ├── seed/route.ts
│       │       │   └── status/route.ts
│       │       ├── init/route.ts
│       │       ├── insights/
│       │       │   ├── route.ts
│       │       │   └── history/route.ts
│       │       ├── metabase/embed/dashboard/[id]/route.ts
│       │       ├── metrics/
│       │       │   ├── route.ts
│       │       │   └── query/route.ts
│       │       ├── profiles/route.ts
│       │       ├── projects/route.ts
│       │       ├── query/route.ts
│       │       ├── rest/              # ClickHouse Analytics APIs (18 endpoints)
│       │       │   └── [...18 route files...]
│       │       ├── semantic/          # Semantic Layer APIs (7 endpoints)
│       │       │   └── [...7 route files...]
│       │       ├── test-connection/route.ts
│       │       └── uploads/
│       │           ├── dataset/route.ts
│       │           └── sheets/route.ts
│       │
│       ├── components/
│       │   ├── ErrorBoundary.tsx
│       │   ├── ConnectionGate.tsx
│       │   ├── analytics/             # Event analytics компоненты (7 файлов)
│       │   ├── auth/                  # Auth компоненты (3 файла)
│       │   ├── chart-builder/ChartCanvas.tsx
│       │   ├── chart-config/          # Chart config panel (7 файлов)
│       │   ├── charts/                # Reusable charts (14 файлов)
│       │   ├── connection/            # Connection wizard (9 файлов)
│       │   ├── dashboard/             # Canvas, слайсеры (slicer/), превью чартов, dock
│       │   ├── home/                  # Home page компоненты (6 файлов)
│       │   ├── layout/               # App layout (6 файлов)
│       │   ├── transitions/PageTransition.tsx
│       │   ├── ui/                    # Generic UI (11 файлов)
│       │   ├── users/UserConstellation.tsx
│       │   ├── visualization/         # Advanced viz (4 файла)
│       │   └── widgets/               # Widget компоненты (4 файла)
│       │
│       ├── config/library.ts
│       ├── context/                   # React contexts (ChartInteractionBus, …)
│       ├── providers/                 # AppProviders, ConnectionState, …
│       ├── store/                     # biFiltersContext, crossSelectionContext, visualInteractionsContext, …
│       ├── hooks/                     # Custom hooks (5 файлов)
│       ├── lib/                       # Shared libraries
│       │   ├── api-client.ts
│       │   ├── applyChartConfig.ts
│       │   ├── auditLog.ts
│       │   ├── backup.ts              [UNUSED]
│       │   ├── backgroundMediaStorage.ts
│       │   ├── canvasBackgroundStorage.ts
│       │   ├── chart/sqlTypePhysicalKind.ts
│       │   ├── chart-style-system/    # 3 файла
│       │   ├── chartTheme.ts
│       │   ├── clickhouse.ts
│       │   ├── connectionPayload.ts
│       │   ├── connectionPresets.ts
│       │   ├── credentialSanitizer.ts
│       │   ├── credentialVault.ts
│       │   ├── dashboard/commandExecutor.ts
│       │   ├── datalensChartConfigs.ts
│       │   ├── datatalkCrypto.ts
│       │   ├── datatalkMetaDb.ts
│       │   ├── dataMasking.ts
│       │   ├── dataSampling.ts
│       │   ├── db-drivers/            # 2 файла
│       │   ├── dashboardEventBus.ts
│       │   ├── defaultConnectionPick.ts
│       │   ├── discoveryCache.ts
│       │   ├── formatters.ts
│       │   ├── gdprCompliance.ts
│       │   ├── globalBackgroundStorage.ts
│       │   ├── jitsu.ts
│       │   ├── mockGenerator.ts
│       │   ├── performance-monitor.ts
│       │   ├── projectsStorage.ts
│       │   ├── propertyFilterUtils.ts
│       │   ├── queryObservability.ts
│       │   ├── queryResultCache.ts
│       │   ├── rateLimit.ts
│       │   ├── remoteConnection.ts
│       │   ├── safeQuery.ts
│       │   ├── schema-intelligence/   # 8 файлов + 3 теста
│       │   ├── semantic/              # 16 файлов + 10 тестов
│       │   ├── sentinel.ts
│       │   ├── serialization.ts
│       │   ├── sidebarStyleStorage.ts
│       │   ├── uploads/               # 2 файла
│       │   ├── userManagement.ts
│       │   ├── utils.ts
│       │   ├── validateEnv.ts
│       │   ├── visualInteractions.ts  # Режимы filter/highlight/none между визуалами
│       │   └── workers/data-processor.worker.ts
│       │
│       ├── types/                     # TypeScript типы (10 файлов)
│       └── workers/                   # Web Workers (3 файла)
│
├── datatalk-agent/                    # Fastify TypeScript сервис
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   # 703 строки, Fastify app
│       ├── dockerDiscovery.ts
│       ├── networkScanner.ts
│       ├── fileDiscovery.ts
│       └── schemaDiscovery.ts
│
├── datatalk-db-init/                  # DB инициализация
│   ├── postgres/
│   │   ├── 01_restore_musgen.sh
│   │   ├── 02_init_idempotent.sql
│   │   └── 03_projects_table.sql
│   └── mssql/
│       └── 01_init.sql
│
├── storage/                           # ClickHouse
│   ├── Dockerfile
│   └── init/
│       ├── *.sql                      # DDL
│       └── *.csv + musgen-аналитика/  # Демо-данные
│
├── ingest/                            # Vector pipeline
│   ├── Dockerfile
│   └── vector.yaml
│
├── ai-service/                        # Python AI сервис
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
│
└── source-code/                       # REFERENCE ONLY — не используется в рантайме
    ├── datalens-backend/              # Python DataLens backend (reference)
    ├── datalens-ui/                   # TypeScript DataLens UI (reference)
    └── clickhouse-jdbc/               # Java ClickHouse JDBC (reference)
```

---

*Документ составлен на основе полного анализа исходного кода репозитория, документации Power BI (2025–2026) и исходного кода DataLens. **Версия 1.1** синхронизирована с реализацией слайсеров (`slicer/`), cross-highlight / transient cross-filter и картой визуальных взаимодействий; при смене архитектуры canvas или семантики разделы 5, 6.3, 15–18 следует перепроверить.*
