# TRASH — Список неиспользуемых файлов

> **Версия:** 1.0  
> **Дата:** 30 марта 2026  
> **Назначение:** Список файлов-кандидатов на удаление при масштабной чистке репозитория.  
> **Метод:** Статический анализ импортов, grep по codebase, анализ навигации.

---

## ⚠️ Инструкция по использованию

Перед удалением файла:
1. Убедиться, что он не вызывается через динамический импорт (`import()`)
2. Убедиться, что он не является частью публичного API (Next.js Route = автоматически доступен)
3. Проверить, нет ли ссылок в конфигурационных файлах (next.config.ts, playwright.config.ts и др.)
4. Запустить `npm run build` после удаления для проверки

**Категории:**
- 🔴 **CONFIRMED DEAD** — нет импортов нигде, подтверждено статическим анализом
- 🟡 **ORPHAN ROUTE** — Next.js страница, не связана с навигацией (технически доступна по URL)
- 🟠 **PLACEHOLDER** — заглушка без реальной функциональности
- 🟣 **REFERENCE ONLY** — vendor/reference код, не используется в рантайме
- 🔵 **DEV ARTIFACT** — разработческий артефакт (backup, заметки, пример)

---

## Категория 1: Backup и временные файлы

### 🔴 `dashboard/src/components/connection/DatabaseConnectionModal.tsx.backup`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** `.backup` файл — снэпшот модального окна подключения. Не является TypeScript-модулем, не импортируется нигде. Просто занимает место.
- **Действие:** Удалить

---

## Категория 2: Неиспользуемые библиотечные файлы

### 🔴 `dashboard/src/lib/backup.ts`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Файл содержит ~400 строк с заглушками для ClickHouse backup/restore. Ни один файл в `dashboard/src` не делает `import ... from './backup'` или `from '../lib/backup'`. Функциональность не завершена (закомментированные пути).
- **Действие:** Удалить

---

## Категория 3: Неиспользуемые компоненты

### 🔴 `dashboard/src/components/charts/RefactoredExample.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Файл-пример системы стилей чартов. Не импортируется ни одним компонентом или страницей в codebase. Является демонстрацией работы `ChartStyleConfig`, но не вызывается нигде.
- **Действие:** Удалить (или переместить в `docs/examples/` если нужен как справочник)

### 🔴 `dashboard/src/components/layout/Navigation.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Компонент навигации, который **дублируется** `Sidebar.tsx`. Реальная навигация в приложении использует `Sidebar`. `Navigation.tsx` не импортируется ни одной страницей напрямую — его имя есть в `layout/index.ts` как re-export, но сам `Navigation` не рендерится в `AppShell.tsx` или `layout.tsx`. Sidebar — живой компонент.
- **Действие:** Удалить, убрать re-export из `layout/index.ts`

### 🔴 `dashboard/src/components/analytics/RetentionMatrix.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Дублирует функциональность `dashboard/src/components/dashboard/RetentionMatrix.tsx`. Это **другая реализация** (Tremor UI + `RetentionCell[]`), которая **не импортируется нигде** в codebase. Живая версия — в `components/dashboard/RetentionMatrix.tsx` (импортируется `ChartPreview.tsx`).
- **Действие:** Удалить

### 🔴 `dashboard/src/components/visualization/InteractiveDashboard.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Компонент не импортируется ни одним файлом в codebase. Является мёртвым узлом в дереве зависимостей.
- **Действие:** Удалить

### 🔴 `dashboard/src/components/visualization/AnimatedGrid.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Импортируется только из `InteractiveDashboard.tsx`, который сам мёртв (см. выше). Цепочка зависимостей полностью разорвана.
- **Действие:** Удалить

### 🔴 `dashboard/src/components/visualization/OffscreenRenderer.tsx`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Импортируется только из `InteractiveDashboard.tsx` (мёртвый). Offscreen Canvas API включён, но закомментирован в коде компонента. Цепочка полностью мёртвая.
- **Действие:** Удалить

---

## Категория 4: Неиспользуемые Web Workers

### 🔴 `dashboard/src/workers/offscreen.worker.ts`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** В codebase нет ни одного `new Worker(new URL('.../offscreen.worker', import.meta.url))` вне `OffscreenRenderer.tsx`, который сам является мёртвым компонентом.
- **Действие:** Удалить

### 🔴 `dashboard/src/workers/visualization.worker.ts`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Нет ни одной ссылки на этот worker в codebase. Не используется.
- **Действие:** Удалить

---

## Категория 5: Неиспользуемые хуки

### 🔴 `dashboard/src/hooks/useSentinel.ts`
- **Тип:** 🔴 CONFIRMED DEAD
- **Причина:** Hook-обёртка вокруг `sentinel.ts` (singleton). Сам `sentinel.ts` используется напрямую через `getSentinel()` в `GraphicsContext.tsx` и `ErrorBoundary.tsx`. Hook `useSentinel` не импортируется ни в одном компоненте.
- **Действие:** Удалить

---

## Категория 6: Неиспользуемые API Routes

### 🔵 `dashboard/src/app/api/example-protected/route.ts`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** Пример rate-limited protected endpoint для разработчиков. Нет ни одного вызова `/api/example-protected` в codebase UI. Не является частью продукта.
- **Действие:** Удалить

### 🔵 `dashboard/src/app/api/rest/stress-test/route.ts`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** Endpoint для нагрузочного тестирования (`/api/rest/stress-test`). Нет вызовов в UI. Оставлять в продакшн-репозитории небезопасно (может использоваться для DoS).
- **Действие:** Удалить из репозитория, или переместить в отдельный dev-scripts проект

---

## Категория 7: Demo и placeholder страницы

> Все страницы ниже **не связаны с навигацией** (Sidebar/Header содержат только: `/home`, `/dashboard`, `/datatalk`, `/settings`). Доступны только если набрать URL вручную.

### 🟠 `dashboard/src/app/voronoi/page.tsx`
- **Тип:** 🟠 PLACEHOLDER
- **Причина:** Содержит только заглушку с текстом "Requires: D3.js voronoi or custom ECharts extension". Реальный Voronoi не реализован.
- **Действие:** Удалить

### 🟠 `dashboard/src/app/choropleth/page.tsx`
- **Тип:** 🟠 PLACEHOLDER
- **Причина:** Заглушка с текстом "Requires: ECharts map extension + GeoJSON data". Реальная карта не реализована.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/bar/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо-страница для bar chart в стиле DataLens с захардкоженными данными. Не входит в навигацию. Демонстрационный артефакт разработки.
- **Действие:** Удалить (функциональность доступна через Dashboard Canvas)

### 🟡 `dashboard/src/app/bubble/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо bubble chart с хардкоженными данными. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/heatmap/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо heatmap. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/line/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо line chart. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/pie/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо pie chart. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/sankey/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо Sankey chart. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/scatter/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо scatter chart. Не в навигации.
- **Действие:** Удалить

### 🟡 `dashboard/src/app/treemap/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Standalone демо treemap. Не в навигации.
- **Действие:** Удалить

---

## Категория 8: Скрытые/недоделанные страницы (оценить отдельно)

> Эти файлы могут иметь будущую ценность, но в текущем состоянии не являются частью продукта. Решение об удалении — на усмотрение команды.

### 🟡 `dashboard/src/app/datatalk/dashboards/page.tsx`
- **Тип:** 🟡 ORPHAN ROUTE
- **Причина:** Страница Metabase embed (~82 строки). Существует и работает с `/api/metabase/embed/dashboard/[id]`, но не связана ни с одним пунктом навигации. Нет ссылки из `datatalk/page.tsx`. "Скрытая" функциональность.
- **Статус:** Уточнить у команды — нужна ли интеграция с Metabase в MVP?
- **Действие:** Если Metabase не является частью MVP — удалить вместе с `api/metabase/embed/dashboard/[id]/route.ts`

---

## Категория 9: Vendor Reference Code

> Эта папка содержит исходный код DataLens и ClickHouse JDBC **только для изучения**. Не используется в рантайме. Занимает сотни мегабайт в репозитории.

### 🟣 `source-code/datalens-backend/`
- **Тип:** 🟣 REFERENCE ONLY
- **Причина:** Python-бэкенд DataLens. Не запускается, не импортируется, не входит в Docker Compose стек Pocket Analyst. Занимает значительный объём. Служит только как архивная справочная документация архитектуры DataLens.
- **Действие:** Удалить из репозитория. Если нужен для справки — использовать официальный GitHub репозиторий DataLens или отдельную ветку.

### 🟣 `source-code/datalens-ui/`
- **Тип:** 🟣 REFERENCE ONLY
- **Причина:** TypeScript UI DataLens. Не запускается, не импортируется. Npm зависимости из этой папки не используются в `dashboard/package.json`. Только для изучения.
- **Действие:** Удалить из репозитория. Официальный репозиторий: https://github.com/datalens-tech/datalens-ui

### 🟣 `source-code/clickhouse-jdbc/`
- **Тип:** 🟣 REFERENCE ONLY
- **Причина:** Java/Maven ClickHouse JDBC. Никак не связан с Node.js стеком. Не используется нигде в проекте.
- **Действие:** Удалить из репозитория.

---

## Категория 10: Dev-документация (dev notes, не пользовательская документация)

> Эти файлы содержат рабочие заметки периода разработки, не являются пользовательской или архитектурной документацией.

### 🔵 `EXTRA.md`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** Пошаговое руководство для разработчика "как подключить MusGen БД". Не является частью официальной документации продукта.
- **Действие:** Удалить или переместить в `docs/dev-notes/`

### 🔵 `CHART_BUILDER_FIX.md`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** Технические заметки о найденных проблемах и их решениях в Chart Builder. Ценна в процессе разработки, но не для финального репозитория MVP.
- **Действие:** Заархивировать в `docs/dev-notes/` или удалить после применения фиксов

### 🔵 `M3_FILTERS_STATUS.md`
- **Тип:** 🔵 DEV ARTIFACT
- **Причина:** Статус Milestone 3 по фильтрам. Рабочая заметка о прогрессе разработки конкретной фичи. Не релевантна для финального репозитория.
- **Действие:** Удалить после закрытия M3

---

## Сводная таблица

| Файл | Категория | Безопасно удалять? |
|------|-----------|-------------------|
| `dashboard/src/components/connection/DatabaseConnectionModal.tsx.backup` | DEV ARTIFACT | ✅ Да |
| `dashboard/src/lib/backup.ts` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/components/charts/RefactoredExample.tsx` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/components/layout/Navigation.tsx` | CONFIRMED DEAD | ✅ Да (убрать re-export) |
| `dashboard/src/components/analytics/RetentionMatrix.tsx` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/components/visualization/InteractiveDashboard.tsx` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/components/visualization/AnimatedGrid.tsx` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/components/visualization/OffscreenRenderer.tsx` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/workers/offscreen.worker.ts` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/workers/visualization.worker.ts` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/hooks/useSentinel.ts` | CONFIRMED DEAD | ✅ Да |
| `dashboard/src/app/api/example-protected/route.ts` | DEV ARTIFACT | ✅ Да |
| `dashboard/src/app/api/rest/stress-test/route.ts` | DEV ARTIFACT | ✅ Да |
| `dashboard/src/app/voronoi/page.tsx` | PLACEHOLDER | ✅ Да |
| `dashboard/src/app/choropleth/page.tsx` | PLACEHOLDER | ✅ Да |
| `dashboard/src/app/bar/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/bubble/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/heatmap/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/line/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/pie/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/sankey/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/scatter/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/treemap/page.tsx` | ORPHAN ROUTE | ✅ Да |
| `dashboard/src/app/datatalk/dashboards/page.tsx` | ORPHAN ROUTE | ⚠️ Уточнить |
| `dashboard/src/app/api/metabase/embed/dashboard/[id]/route.ts` | ORPHAN (используется hidden page) | ⚠️ Уточнить |
| `source-code/datalens-backend/` | REFERENCE ONLY | ✅ Да (сотни МБ) |
| `source-code/datalens-ui/` | REFERENCE ONLY | ✅ Да (сотни МБ) |
| `source-code/clickhouse-jdbc/` | REFERENCE ONLY | ✅ Да |
| `EXTRA.md` | DEV ARTIFACT | ✅ Да |
| `CHART_BUILDER_FIX.md` | DEV ARTIFACT | ⚠️ Уточнить |
| `M3_FILTERS_STATUS.md` | DEV ARTIFACT | ✅ Да |

---

## Статистика

| Категория | Количество файлов/папок |
|-----------|------------------------|
| CONFIRMED DEAD (компоненты, lib, hooks, workers) | 11 |
| DEV ARTIFACT (backup, примеры, заметки) | 7 |
| ORPHAN ROUTES (демо и скрытые страницы) | 11 |
| PLACEHOLDER (заглушки) | 2 |
| REFERENCE ONLY (source-code/) | 3 папки (~сотни МБ) |
| **ИТОГО** | **~34 объекта** |

---

*Список составлен на основе статического анализа импортов, grep по codebase, анализа навигационных компонентов. Рекомендуется проверить каждый файл перед удалением с помощью `npm run build`.*
