# SETUP_REPORT — инженерная среда Pocket Analyst

Дата: 2026-09-25. Ветка: `chore/agent-engineering-env` (HEAD `b6ca435`). Cursor 3.21.18.

Статусы: **PASS** / **FAIL** / **BLOCKED** / **NOT RUN**.

Это отчёт о **текущем** состоянии. Исторические прогоны первой настройки отделены и не заменяют актуальный `check.sh full`. Независимая приёмка — в `SETUP_REVIEW.md` (текст ревьюера не менялся). Перенос на Java отменён.

**Локальная среда:** готова с ограничениями.
**Удалённый CI и защита `main`:** BLOCKED.
**Дамп рабочих БД:** не снимался — отсутствие дампа не доказывает сохранность томов.
**Живой `stop` / автозагрузка всех rules в UI:** NOT RUN.

---

## 1. Исходное состояние

- Исходный commit работы: `b6ca435` (тот же, что `main` на момент настройки). Дерево уже содержало WIP владельца.
- Снимок WIP владельца: ветка `backup/pre-agent-env-20260925` @ `70caa62` (2026-09-25 03:22 +0300). Это архив, не команда отката.
- Секреты и `.env` / `.env.local` в backup не входили.
- Docker-тома на машине перечислены, **не трогались**. Дамп не снимался.

Откат настройки — только по [scripts/agent/ROLLBACK.md](./scripts/agent/ROLLBACK.md): копия текущего дерева, worktree снимка, точечный `git restore --source=backup/…` смешанных файлов, удаление listed untracked. Не `reset --hard`, не `clean -fd`, не `--discard-changes`.

Runtime: Node v20.20.2 (`.tools/node`), npm 10.8.2, Python 3.9.6, Docker 29.8.0 (контейнеры не запускались).

---

## 2. Файлы этой настройки

Новые: `AGENTS.md`, `.nvmrc`, `.cursor/rules` (6), `.cursor/skills` (5), `.cursor/agents` (3), `.cursor/hooks.json` + 4 hook-скрипта, `scripts/agent/*`, `.github/workflows/verify.yml`, `.github/pull_request_template.md`, контрактные тесты, `datatalk-agent/src/rolePolicy.ts` + `test/`, `dashboard/tsconfig.typecheck.json`, `SETUP_REPORT.md`, `SETUP_REVIEW.md`.

Минимальные правки уже существовавших файлов: `biFiltersStorageKey`; вынос `rolePolicy` 1:1; `eslint.config.js`; скрипты `typecheck` / `typecheck:keyed`; `deploy.yml` → `workflow_dispatch`; ссылки в `README.md`.

WIP владельца в `app/**`, `dashboard/src/app/**`, аудитах не удалялся.

---

## 3. Исторические проверки (первая настройка, до исправлений приёмки)

Эти цифры **не** удостоверяют текущее дерево. Они фиксируют, что контур однажды собирался.

| Команда | Тогда | Примечание |
|---|---|---|
| keyed tsc / eslint, `npm test` dashboard | 80→93 тестов; eslint 132 | до поведенческих I9–I12 |
| `check.sh full` без обязательной сборки | 0 | тогда `PA_CHECK_BUILD` по умолчанию не ставился |
| отдельный `npm run build` | 0 | не входил в канон `full` |
| custom subagent в той сессии | NOT RUN | Task enum отвергал тип |
| stamp refresh через `write` после правок скриптов | да | **недействительно** как PASS текущего дерева — см. §8 |

Намеренная ошибка типов в фикстуре дала 2 NEW TS2339; baseline не обновлялся.

---

## 4. Текущая таблица приёмки

Актуальный прогон: `scripts/agent/check.sh full` **2026-09-25T01:45:11.967Z**, exit 0, `source=check.sh`, `mode=full`, `build=1`. Node v20.20.2. Лог: `.cursor/state/check-full-20260925-task-scope.log`. Stamp писал только `check.sh`. Прогон 01:23Z — исторический.

| Компонент | Как подтверждено сейчас | Статус |
|---|---|---|
| Снимок кода владельца | `backup/pre-agent-env-20260925` = `70caa62` | PASS |
| Дамп БД | не снимался | BLOCKED |
| Node 20 | `.tools/node` v20.20.2 в логе `full` | PASS |
| keyed tsc dashboard / agent | current=0 baseline=0 new=0 | PASS |
| eslint dashboard | current=132 baseline=132 new=0 | PASS |
| unit dashboard | **23 files / 96 tests** в том же `full` | PASS |
| unit datatalk-agent | 4/4 (S1 помечен KNOWN DEFECT) | PASS |
| `next build` | тот же `full`, suite `next-build`; ~28s, инкрементальный кэш; типы/lint Next пропускает | PASS (с оговоркой) |
| hook + stamp + task-scope + vitest-filters + rollback-check | в том же `full` | PASS |
| E2E | hardcoded `PROJECT_ID`, живой сервер | NOT RUN |
| AGENTS.md + discover | `discover-cursor.mjs` в `full` | PASS |
| Rule globs на диске | `match-globs.mjs` 6/6 в `full` | PASS |
| Rules в UI Cursor | banner на `planner.ts` / `ChartPreview.tsx` не наблюдался | NOT RUN |
| Skills на диске | 5 SKILL.md | PASS |
| Skills в этой сессии агента | 5 project skills в `available_skills` | PASS |
| Subagent живой вызов | `verifier` / `semantic-architect` / `query-path-reviewer` ранее в этой ветке чата | PASS (ранее) |
| Hook Cursor `beforeShell` | deny `HEAD:main`; allow `echo '… agent/main-fix'` | PASS |
| Hook Cursor `beforeRead` / `afterFileEdit` | ранее в ветке чата | PASS (ранее) |
| Область задачи после коммита | изолированный git (`self-test-task-scope.mjs` в `full`) | PASS |
| unknown empty ≠ PASS | тот же self-test + `--fail-if-unknown-empty` | PASS |
| `quick` ≠ unit DoD | `--for-task` в том же self-test | PASS |
| dashboard affected: два набора | `self-test-affected-filters.mjs` — 2 Test Files | PASS |
| C4 save/load | нет теста canvas hydrate | UNCOVERED |
| Hook Cursor `stop` | живой UI не наблюдался; код зовёт `--for-task` | NOT RUN |
| Stamp не маскирует новый TS-ключ | keyed baseline 0; fault-injection исторический | PASS |
| Stamp stale / mode / build | `self-test-stamp.mjs` в актуальном `full`; ручной official `write` → exit 2 | PASS |
| I9 persist | PUT characterization дропает `bi_filters` (`projectsPutDropsBiFilters.test.ts`) | PASS (дефект I9) |
| C4 load hydrate | `DragDropCanvas` → `filters: []` **не** покрыт unit; `filterPersist` — только ключ localStorage и `loadProject` adapter | UNCOVERED |
| CI YAML | `verify.yml` зовёт тот же `check.sh full` + `PA_CHECK_BUILD=1` | PASS (файл) |
| Удалённый CI / protection `main` | нет `gh`, нет push | BLOCKED |
| WIP владельца | `DOCUMENTATION.md`, `dashboard/src/app/dashboard/page.tsx`, аудиты на месте | PASS |

---

## 5. Известные дефекты продукта (не чинились)

| ID | Суть | Где видно |
|---|---|---|
| I9 | `/api/projects` не читает `bi_filters` | `projectsPutDropsBiFilters.test.ts` |
| C4 | load шлёт `filters: []` | UNCOVERED (не `filterPersist`) |
| C1 | скоуп сервер/клиент расходится без контекста | `scopeConsistency.test.ts` |
| I8 | RLS без param — fail-open | `rlsFailOpen.contract.test.ts` |
| I10 | rest `[]` после ошибки CH | `emptyVsError.contract.test.ts` |
| I11 | `users-graph` Ghost Data | тот же файл |
| I12 | upload-колонки TEXT | `materializeTypes.contract.test.ts` |
| S1 | `admin` без SQL-политики | `rolePolicy.test.ts` |
| S4 | `UNION SELECT` без `;` | `validatorNegative.test.ts` |
| Golden ORDER BY | snap без ORDER BY | не трогали |

---

## 6. Оставшиеся действия владельца

1. Живой `stop`: после ответа агента — Cursor → Hooks. Ожидание: `{}` или один followup и второй `stop` без followup.
2. Дамп томов без `docker compose down -v`.
3. GitHub: required `Verify` на `main`, запрет прямого push. YAML ≠ защита.
4. Commit/push/PR — отдельный запрос.
5. Секреты не в репозиторий.

---

## 7. Откат

Перед любым ручным шагом: `scripts/agent/rollback-check.sh` (проверяет backup, точный `rollback-manifest.txt`, стоп на неожиданных setup-файлах). `--apply` отвергается. Секреты отсекаются `secret-excludes` и `is_secret_path`, не комментарием. Откат в этой задаче **не выполнялся**.

---

## 8. Stamp: последовательность и что он удостоверяет

### Что было не так

1. `check.sh full` (около 01:14:33Z) прошёл на дереве **с** багом записи `last-check` (`node -e` создал корневые файлы `0` и `1`) и **со** старым `verify-stamp.mjs`.
2. Файлы `0`/`1` удалили; `verify-stamp.mjs` и `check.sh` изменили.
3. Official stamp обновили **`verify-stamp.mjs write --mode full --exit 0 --build 1 --suites …`** без повторного `full`. Fingerprint стал от **нового** дерева, а suites/`next-build` были параметрами, не новым прогоном.

Итог: `write` мог выдать full+build PASS на любом текущем дереве, если передать те же флаги.

### Что сделано

Official `write` принимается только при `PA_CHECK_RUNNING=1` (выставляет `check.sh`). Изолированные тесты пишут в `--stamp-file`. Ручной official write → exit 2. Это не защита от переписывания самих скриптов.

### Исторический stamp (01:23Z)

`2026-09-25T01:23:25.682Z`, fingerprint `6e418f08bd6e…`. Не удостоверяет дерево после правок области задачи / `--for-task` / rollback-check.

### Текущий stamp (после full этой итерации)

| Поле | Значение |
|---|---|
| writtenAt | `2026-09-25T01:45:11.967Z` |
| source | `check.sh` |
| mode / build / exit | `full` / `true` / `0` |
| suites | guards, tsc-dashboard, tsc-datatalk-agent, eslint-dashboard, vitest:all, datatalk-agent, ai-service-syntax, rule-globs, cursor-discover, hook-self-test, stamp-self-test, task-scope-self-test, affected-filters-self-test, rollback-check, next-build |
| head | `b6ca435` |
| fingerprint | `650f9479c2a2…` |
| лог | `.cursor/state/check-full-20260925-task-scope.log` (`EXIT_CODE=0`) |

Официальный `write` вручную не вызывался. Правка только этого отчёта после прогона не входит в content/check-config fingerprint.

Пакет для внешнего ревью: `.cursor/state/review-handoff/` и `.cursor/state/pocket-analyst-review-handoff-20260925.zip` (не в fingerprint).

---

## 9. Исправления по внешнему ревью (эта итерация)

Не повтор настройки и не архитектурный аудит.

1. **Область задачи.** `collectTaskScope`: ближайший merge-base среди `main` / `origin/main` (или `PA_CHECK_BASE`) плюс staged, unstaged, untracked. После коммита в feature-ветке guards видят добавленные строки. Устаревший `origin/main` позади локального `main` не берётся: первый `full` на `de0f47d` дал 15 ложных guards (owner snapshot + debug ingest) и exit 1 — это не продукт-фикс. Неизвестная пустая область → exit 2 / `--for-task` INSUFFICIENT, не PASS.
2. **stop.py.** `verify-stamp check --for-task`: `quick` не закрывает задачу с обязательными unit; `affected` без mapped suite не подтверждает логику; docs-only допускается. Build на stop не запускается. `loop_limit` = 2.
3. **Vitest.** `run_dashboard_tests` передаёт отдельные аргументы. Affected dashboard-компонентов: `src/components/dashboard/__tests__` и `scopeConsistency.test.ts`. Self-test: `Test Files  2 passed (2)`.
4. **Persist.** `filterPersist.fixture.test.ts` — ключ localStorage и `loadProject` adapter. C4 (hydrate `filters: []`) **UNCOVERED**. PUT I9 сохранён в `projectsPutDropsBiFilters.test.ts`.
5. **Откат.** `rollback-check.sh` проверяет backup, точный manifest, стоп на неожиданных файлах. `secret-excludes` + `is_secret_path`. Откат **не выполнялся**.

Изолированные регрессии — только во временных git-репозиториях (`self-test-task-scope.mjs`), не в WIP владельца.

Не проверено: живой `stop` в UI Cursor; удалённый CI / защита `main`; C4 на canvas; применение отката; продуктовые дефекты; рабочие БД.
