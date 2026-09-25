# SETUP_REVIEW — независимая приёмка инженерной среды

Дата проверки: 2026-09-25. Проверяющий агент не менял продукт, baseline, snapshots и Git. `SETUP_REPORT.md` использован как список утверждений, не как доказательство.

**Вердикт: READY WITH LIMITATIONS**

Локальные обязательные проверки ловят регрессии и возвращают ненулевой exit code. Cursor вызывает hooks и project rules хотя бы на части путей. Custom subagents запускаются. Ограничения (удалённый CI, защита `main`, ложные срабатывания hook, неполный откат на грязном дереве, часть тестов-характеризаций) не отменяют работоспособность локального контура, но владелец не может считать процесс «закрытым».

Cursor 3.21.18. Документация: [Rules](https://cursor.com/docs/rules), [Hooks](https://cursor.com/docs/hooks), [Subagents](https://cursor.com/docs/subagents), [Skills](https://cursor.com/docs/skills).

Граница проверки: ветка `chore/agent-engineering-env`, HEAD `b6ca435`. Незакоммиченный WIP владельца на месте. Точка отката кода: `backup/pre-agent-env-20260925` @ `70caa62`. После опытов временные файлы `dashboard/src/review_accept_tmp.ts`, `review_accept_tmp.test.ts`, `REVIEW_STAMP_PROBE.txt` удалены; официальные `scripts/agent/baselines/*` не обновлялись.

---

## Таблица проверок

| # | Вопрос | Как проверено | Доказательство | Статус |
|---|---|---|---|---|
| 1 | Форматы vs официальная документация / Cursor 3.21.18 | Чтение `.mdc` / `SKILL.md` / `agents/*.md` / `hooks.json` | Rules: `description`+`globs`+`alwaysApply: false`. Skills: `name` совпадает с папкой. Agents: `name`,`description`,`model`,`readonly`. Hooks: `version: 1`, события из docs, `failClosed`, `loop_limit`, stdout JSON `permission`/`followup_message` | PASS |
| 2 | Конфликты AGENTS.md / rules / skills / старые инструкции | Сравнение текстов | User rules: 0 (cursor_dialog list). `npm run typecheck` в `dashboard/package.json` — сырой `tsc`, а `AGENTS.md` говорит «через `diag-baseline.mjs`». `DOCUMENTATION.md` по-прежнему может расходиться — AGENTS это признаёт. `credentialVault` в AGENTS «не опираться», в `database-and-connections.mdc` есть в globs (не конфликт, а разные роли) | PASS с замечанием |
| 3 | Пути, символы, команды существуют | Grep + запуск | `scopeBiFiltersForRequest`, `getScopedBiFiltersForChart`, `biFiltersStorageKey`, `classifyColumn`, `inferFieldType`, `detectColType` (`dbChartBuilder.ts`), `chartInferPhysicalKind`, `detectTableColumnType` — есть. `scripts/agent/check.sh` исполняется | PASS |
| 4 | Globs на конкретных файлах | `match-globs.mjs` + живое подключение | 6/6 probe sets. При чтении `filterPersist.fixture.test.ts` Cursor подставил `testing.mdc`; при чтении `emptyVsError.contract.test.ts` — `api-routes.mdc` | PASS |
| 5 | Cursor подключает rules / skills / subagents | Наблюдение этой сессии | Rules: см. #4; на `ChartPreview.tsx` / `planner.ts` баннер rule в ответе Read **не** появился. Project skills **нет** в `available_skills` этой сессии (только `~/.cursor/skills-cursor`). Subagents: Task `semantic-architect` ответил `CUSTOM_SUBAGENT_REACHED`; Task `query-path-reviewer` запустился | PASS с ограничениями |
| 6 | Ограничения reviewer реальные или текст | Запуск + frontmatter | `readonly: true` у architect/reviewer — официальное поле. `query-path-reviewer` на запись `.cursor/state/review-tmp/readonly-probe.txt` вернул `WRITE_BLOCKED`. У `verifier` `readonly: false`; «не править код» — **только текст** | PASS / частично текст |
| 7 | Cursor вызывает hooks (не прямой скрипт) | Действия инструментов | `echo PA_HOOK_PROBE_DENY` → deny. Read `.env` → deny. `afterFileEdit` пишет `.cursor/state/edit-guard.json` (в этой сессии на `experiments.py`). `stop` в этой сессии **не наблюдался** | PASS (`stop` NOT RUN) |
| 8 | Вход / ошибки / таймауты / повторы hooks | Прямой stdin (скрипт) + один живой ложный срабатывание | Невалидный JSON → deny (shell/read), stop → `{}`. `loop_count>=1` → без followup. Таймаут Cursor (8s) **не** воспроизводился (нужен висящий hook — менять конфиг запрещено). Ложное срабатывание: см. P1 | PASS с дефектом regex |
| 9 | Проверки ловят регрессии, ненулевой exit | Изолированные дефекты в `src/` (удалены) | `diag-baseline` на `review_accept_tmp.ts`: exit 1, `NEW … TS2322`. Vitest `expect(1).toBe(2)`: exit 1. После удаления tsc снова 0 new | PASS |
| 10 | Новая TS-ошибка при том же количестве | Временный `--baseline` (не официальный) | current=1 baseline=1, но `NEW` другой ключ TS2322 (number→boolean) и `RESOLVED` старый; exit 1 | PASS |
| 11 | Stamp не выдаёт старый успех за актуальный | Файл вне ignore-префиксов | `REVIEW_STAMP_PROBE.txt` → `STALE after 1 path`. Файл в `.cursor/state/` stamp **не** инвалидирует (`IGNORED_PREFIXES` в `scripts/agent/lib/git.mjs`) | PASS с оговоркой |
| 12 | Тесты проверяют данные/поведение | Чтение тестов | Поведенческие: `scopeConsistency`, `rlsFailOpen` (реальный `compileSemanticQuery`), `rolePolicy`. Слабые: `emptyVsError` и `materializeTypes` — поиск строк в исходнике; I9 в `filterPersist` копирует mapping в тесте, не импортирует `route.ts` | PASS с замечанием |
| 13 | Фикстуры без личных данных / ID | Чтение JSON и e2e | Unit-фикстура `fixture_project_filter_persist` — синтетическая. E2E `filters-date.spec.ts` всё ещё `PROJECT_ID = "project_1771280519979_wsr421553"`; в CI не входит | PASS (unit) / FAIL (e2e, вне CI) |
| 14 | Локальные проверки ≈ CI | `verify.yml` vs `check.sh` | Оба зовут `scripts/agent/check.sh full`. CI добавляет `PA_CHECK_BUILD=1` и `npm ci --legacy-peer-deps`. Локальный `full` **без** сборки по умолчанию | PASS с расхождением build |
| 15 | Удалённый CI и защита `main` | `gh` отсутствует в PATH | YAML есть. Запусков Actions и branch protection **не** видно | BLOCKED |
| 16 | WIP владельца и откат | `git status` до/после | `DOCUMENTATION.md`, `dashboard/src/app/dashboard/page.tsx`, аудиты на месте. Откат `git switch backup/…` на грязном дереве без `--discard-changes` может отказать; untracked `.cursor/` останется. Агент правил те же файлы, что и владелец (`package.json`, `eslint.config.js`, `biFiltersContext.tsx`, `deploy.yml`) | PASS (сохранность) / слабый откат |

---

## Замечания по приоритету

### P1 — влияет на процесс или безопасность команд

1. **Ложное срабатывание `before-shell` на подстроке `main`**
   Файл: `.cursor/hooks/before-shell.py`, regex `git\s+push\b[^\n]*\b(origin\s+)?main\b`.
   Наблюдение: payload `git push origin agent/main-fix` → deny «push to main». Тот же regex заблокировал целый Shell-вызов аудита, потому что запрещённая строка была в тексте команды.
   Следствие: нельзя безопасно обсуждать/тестировать push в feature-ветках с `main` в имени; hook режет шире, чем заявлено.
   Минимальный фикс: якорить конец (`main` как последний ref), не сканировать произвольный текст скрипта; для живого hook — matcher уже, чем весь stdin команды-обёртки.

2. **Откат описан неполно**
   Файл: `SETUP_REPORT.md` §7.
   `git switch backup/pre-agent-env-20260925` при текущем грязном дереве потребует слияния или `--discard-changes` (разрушительно). Untracked `.cursor/`, `scripts/agent/`, тесты останутся. Частичный список «удалить новые пути» не откатывает правки в уже существовавших файлах (`datatalk-agent/src/index.ts`, `dashboard/package.json`, `eslint.config.js`, `biFiltersContext.tsx`).
   Следствие: владелец может решить, что «переключился на backup», и остаться со смешанным деревом.
   Минимальный фикс: явная инструкция: stash/worktree **или** список всех затронутых tracked файлов агента + удаление untracked.

3. **Удалённый CI и защита `main` не подтверждены**
   `gh` нет.
   Следствие: наличие `verify.yml` не защищает `main`.
   Минимальный фикс: владелец включает required check `Verify` и forbid push to `main` в GitHub.

### P2 — качество сигнала

4. **Часть «контрактных» тестов — grep по исходнику**
   `dashboard/src/app/api/rest/__tests__/emptyVsError.contract.test.ts`, `dashboard/src/lib/uploads/__tests__/materializeTypes.contract.test.ts`.
   I9-тест в `filterPersist.fixture.test.ts` дублирует mapping локальной функцией `toUpdateProjectInput` — изменение `route.ts` тест не сломает.
   Следствие: можно «починить» тест, не чиня поведение; наоборот, реальный runtime I10 не исполняется.
   Минимальный фикс: импортировать mapping из route/helper; для I10 — unit с подменой fetch, без живой БД.

5. **Расхождение команд typecheck**
   `AGENTS.md` vs `dashboard/package.json` `typecheck`.
   Следствие: агент, вызвавший `npm run typecheck`, не сравнит keyed baseline.
   Минимальный фикс: одна фраза в AGENTS: канон — `scripts/agent/check.sh` / `diag-baseline.mjs`; `npm run typecheck` — только сырой tsc.

6. **Локальный `full` без сборки**
   `scripts/agent/check.sh` vs `.github/workflows/verify.yml` `PA_CHECK_BUILD=1`.
   Следствие: «full зелёный локально» ≠ CI.
   Минимальный фикс: в AGENTS явно: перед PR `PA_CHECK_BUILD=1 scripts/agent/check.sh full`.

7. **Неполное автоподключение rules/skills в сессии**
   Не все matching Read получили banner. Project skills не попали в список skills агента.
   Следствие: нельзя утверждать, что каждый агент всегда видит все 6 rules и 5 skills.
   Минимальный фикс: владельцу проверить Customize; при необходимости `alwaysApply` только для короткого AGENTS, не для всех rules.

8. **`stop` hook в Cursor не подтверждён в этой сессии**
   Скрипт при `loop_count>=1` молчит — хорошо против цикла. Живой вызов — NOT RUN.

### P3

9. E2E с захардкоженным `PROJECT_ID` остаются вне CI — как заявлено, но skill `testing.mdc` им противоречит, если кто-то включит их в PR.
10. `self-test-faults.mjs` гоняет tsc на файле вне `tsconfig.typecheck.json` — это не доказательство пайплайна (пайплайн проверен отдельно в этом review).

---

## Непроверенное

- Живой hook `stop` и содержимое Hooks output после завершения агента.
- Автоподхват skills в UI / `/verify-change`.
- Required status checks и branch protection на GitHub.
- Реальный прогон `verify.yml` на Actions.
- Playwright / браузер / живые БД (намеренно не трогались).
- Таймаут hook 8s со стороны Cursor.
- Эмпирический `readonly` у `semantic-architect` (проверялся `query-path-reviewer`).
- Дамп Docker-томов.

---

## Следующие действия (не сделаны этим review)

1. Сузить regex `git push` / `main` в `before-shell.py`.
2. Дописать откат: tracked-правки агента + untracked + запрет `--discard-changes` без явного согласия.
3. Включить required `Verify` на `main`.
4. Усилить I9/I10 тесты до реального контракта route, не grep.
5. Согласовать текст AGENTS с `npm run typecheck` и `PA_CHECK_BUILD`.
6. Владельцу: новая сессия → Customize и `@semantic-architect`; после чата — вкладка Hooks для `stop`.

Проблемы **не исправлялись**.

---

## Дополнение исполнителя (2026-09-25) — не новая независимая приёмка

Исходные замечания ревьюера выше сохранены. Ниже — что сделано после них и что осталось. Это самопроверка того же контура настройки, не повторный независимый audit.

### Что закрыто из замечаний ревьюера

| ID ревью | Было | Сейчас | Доказательство |
|---|---|---|---|
| P1 hook `main` substring | `git push origin agent/main-fix` deny | dest/refspec parser | `self-test-hooks.py` exit 0; живой Cursor allow `echo 'git push origin agent/main-fix'`; живой deny `git push origin HEAD:main` без выполнения |
| P1 откат | `git switch backup` | процедура без hard/clean/discard | `scripts/agent/ROLLBACK.md` + классы A–D |
| P2 typecheck / full без build | `full` молча без сборки; AGENTS путал keyed и raw tsc | `full` по умолчанию `PA_CHECK_BUILD=1`; AGENTS и skills разводят команды | `check.sh full` log: `mode=full build=1` + next build; stamp `--require-mode full --require-build` |
| P2 stamp | report stale; affected = «проверено» | reports не stale; mode/build обязательны; config всегда в fingerprint | `self-test-stamp.mjs` exit 0 |
| P2 source-string тесты | только grep I9/I10/I12 | grep = static; добавлены behavior (mock PUT/GET/pool). `it.fails` I9/C4 оставлен и **не** доказательство persist | 96 unit; I9 PUT дропает `bi_filters` |
| P2 skills в сессии | не было в `available_skills` | в этой сессии 5 project skills видны | чтение SKILL.md |

### Что не закрыто (ревьюер был прав)

- **Удалённый CI / защита `main`:** по-прежнему BLOCKED (`gh` нет, push запрещён). YAML ≠ required check.
- **Живой `stop`:** NOT RUN в UI. Скрипт `loop_count>=1` → `{}` не считается интеграцией Cursor.
- **Неполное автоподключение rules:** `planner.ts` / `ChartPreview.tsx` Read без banner. Globs на диске PASS.
- **E2E hardcoded `PROJECT_ID`:** вне CI, не чинилось.
- **S1 / I8 / C1 / golden ORDER BY:** продуктовые дефекты, не в scope.
- **Дамп БД:** не снимался.

### Локальный vs удалённый статус

- Локальная среда: **готова с ограничениями** (`check.sh full` exit 0, stamp full+build current).
- Удалённый CI и защита `main`: **не подтверждены**.

Самопроверка не отменяет вердикт ревьюера **READY WITH LIMITATIONS**.
