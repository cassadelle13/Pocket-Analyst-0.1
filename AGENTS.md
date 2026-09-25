# Pocket Analyst — инструкции для агентов

BI-конструктор дашбордов: Next.js canvas, семантический SQL-слой, исполнение запросов через DataTalk Agent. Источник правды — код и этот файл. Аудиты и `DOCUMENTATION.md` могут расходиться с кодом.

## Стек и сервисы

| Компонент | Путь | Порт / роль |
|---|---|---|
| Dashboard (ядро) | `dashboard/` | Next.js 15, хост `3000`; в compose `3002→3000` |
| DataTalk Agent | `datatalk-agent/` | Fastify, `9010` — SQL к Postgres/MySQL/MSSQL/ClickHouse |
| AI service | `ai-service/` | FastAPI; ходит в `/api/semantic/query` |
| Postgres meta | `datatalk-db-init/postgres/` | `datatalk_meta` (подключения, модели, проекты) |
| ClickHouse | `storage/` | event-аналитика `/api/rest/*` и внешний источник |

Пути данных: семантика `ChartPreview` → `/api/semantic/query` → planner → `/api/datatalk/query` → агент → БД. Прямой SQL виджета → `/api/query`. Event-аналитика → `/api/rest/*` → ClickHouse напрямую (минуя агент и аудит).

## Проверенные команды

Единая точка: `scripts/agent/check.sh {quick|affected|full}`. Нужен Node 20 (`.nvmrc`; запасной runtime в `.tools/node`).

| Цель | Команда | Каталог | Примечание |
|---|---|---|---|
| Быстро | `scripts/agent/check.sh quick` | корень | guards + keyed tsc/eslint. Без unit и без сборки |
| Затронутое | `scripts/agent/check.sh affected` | корень | quick + релевантные unit. **Не** заменяет full |
| Перед слиянием | `scripts/agent/check.sh full` | корень | все unit + syntax + globs + **next build**. `PA_CHECK_BUILD=0` только для отладки; такой stamp не удовлетворяет `--require-build` |
| Stamp «готово к PR» | `node scripts/agent/verify-stamp.mjs check --require-mode full --require-build` | корень | PASS affected или full без build — недостаточны. Официальный stamp пишет только `check.sh`, не `write` вручную |
| Unit dashboard | `npm test` | `dashboard/` | vitest |
| Typecheck (сырой tsc) | `npm run typecheck` | `dashboard/` или `datatalk-agent/` | `tsc --noEmit`. При baseline 0 падает на любой диагностике. **Не** keyed и **не** канон для eslint (132 warning) |
| Typecheck (keyed) | `npm run typecheck:keyed` | тот же каталог | обёртка над `diag-baseline.mjs`; ловит **новый ключ**, даже если счётчик не вырос |
| Dev UI | `npm run dev` | `dashboard/` | порт 3000 |
| Стек | `docker compose up -d` | корень | не `docker-compose.dev.yml`, не `start.bat` |

Канон агента и CI — `scripts/agent/check.sh`, не `npm run typecheck`. Область задачи — `scripts/agent/changed-files.mjs`: явная `PA_CHECK_BASE` или ближайший к HEAD merge-base среди `main` и `origin/main` (устаревший `origin/main` позади локального `main` не берётся), плюс staged, unstaged и untracked. Не `git diff HEAD` после коммита. Если база неизвестна и список пуст — это не успешная пустая проверка (`--fail-if-unknown-empty`, `--for-task`). `quick` не подтверждает unit; `affected` без подходящего suite не подтверждает смену логики. Keyed baseline нужен, чтобы новая ошибка не маскировалась удалением старой; для dashboard tsc baseline сейчас 0, поэтому сырой tsc и keyed совпадают по pass/fail, но расходятся, как только baseline > 0 (eslint). `next build` пропускает типы и lint (`ignoreBuildErrors`). Playwright E2E зависят от локальных `PROJECT_ID` и живого сервера — не в CI.

Не трогать: рабочие тома Docker, `DROP`/`TRUNCATE`, `git push --force`, `main`. Секреты — имена из `.env.example`, не содержимое `.env`.

## Ограничения (факт, не цель)

- Роль приходит с клиента; агент для `admin` не проверяет SQL.
- `/api/semantic/query` принимает встроенные `semanticModel` и `sourceBindings`.
- RLS без параметра — fail-open. `/api/projects` игнорирует `bi_filters` (I9). Загрузка проекта шлёт `filters: []` (C4).
- `/api/rest/*` часто возвращает `[]` при ошибке ClickHouse; `users-graph` отдаёт Ghost Data.
- `lib/semantic` без React и без циклов. Новый SQL-путь не добавлять. `.snap` — только с построчным объяснением (golden закрепляет баг ORDER BY).
- Не опираться на неимпортируемые `safeQuery.ts`, `credentialVault.ts`, `dataMasking.ts`.

## Меняешь X — синхронизируй Y

- Скоупинг фильтров: `planner.scopeBiFiltersForRequest` и `ChartPreview.getScopedBiFiltersForChart` + оба теста.
- Тип поля: `inferFieldType`, `classifyColumn`, `sqlTypePhysicalKind`, `detectColType`, `detectTableColumnType`.
- Диалект: `lib/sqlDialect.ts`, `semantic/query`, `semantic/values`, `semantic/retention`.
- Схема meta: init SQL и runtime-DDL; существующий том сам не подхватит новый init.
- События canvas: только `DashboardEvent` из `lib/dashboardEvents.ts`.

## Definition of Done

Ветка `agent/*` или `chore/*`, не `main`. Нет новых ключей tsc/eslint относительно baseline. Unit затронутых модулей зелёные. `.snap` объяснён. Представления синхронизированы или в PR сказано почему нет. Для SQL-пути — `query-path-reviewer` без blocker по той же области diff. `verifier` подтвердил независимо (`--for-task`). Явно перечислено, что не проверено (C4 load hydrate не покрыт `filterPersist`).

Подробности: [SETUP_REPORT.md](./SETUP_REPORT.md), skills в `.cursor/skills/`, аудит `POCKET_ANALYST_ENGINEERING_SYSTEM_AUDIT.md` (карта рисков, не статус кода).
