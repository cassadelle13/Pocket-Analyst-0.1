Базовый алгоритм (один раз, дальше повторяешь для всех графиков)
A) Создать график и подключить таблицу
Открой http://localhost:3000
Открой DB Explorer (левая панель БД).
Выбери соединение MusGen 2.
В списке таблиц нажми кнопку + напротив нужной таблицы
Это создаст новый график на канвасе, уже подключённый к таблице.
B) Добавить поля и собрать визуализацию
Открой Fields (панель “Fields”) — там будут поля таблицы.
Открой Visualizations (панель визуализаций).
Выбери тип: bar/line/table/pie/donut/kpi/...
Перетаскивай поля в слоты:
Axis (X) — дата/категория
Axis (Y) — числовая мера
Legend (group by) — разрез (категория)
Для каждой меры в Y выбери агрегацию в выпадающем списке:
COUNT — считать пользователей/события
SUM — сумма оплат/генераций/стоимости
AVG — среднее
(Опционально) Включай фильтры через:
Slicer (отдельный виджет-фильтр)
или фильтры внутри вашего дашборда (если используешь)
Теперь — конкретно по каждому виджету (что куда вставлять)
Важно: ниже я даю точные “рецепты” по логике. Но реальные имена таблиц/колонок в musgen_2 могут чуть отличаться (из дампа). Если у тебя в Fields они называются иначе — выбирай аналогичное поле (по смыслу и типу).

1) «Откуда пришли» ✅ МОЖНО
Источник: chat.refer_username

Вариант (Bar chart, топ источников)
Таблица: chat
Viz: bar
Axis (X): refer_username
Axis (Y): id (или любое непустое поле) → Agg = COUNT
Legend: пусто
Что получится
Сколько новых пользователей пришло от каждого refer_username.

2) «Кол-во пользователей» ✅ МОЖНО
Основа: chat.is_blocked

Тут обычно 3 числа/линии:

живые (не заблокированные)
заблокированные
всего
Вариант А (KPI: всего пользователей)
Таблица: chat
Viz: kpi
Value: id → Agg = COUNT
Вариант B (Pie/Donut: доля блокировок)
Таблица: chat
Viz: donut (или pie)
Category: is_blocked
Values: id → Agg = COUNT
Вариант C (Table: живые/заблок/всего)
Сейчас без формул/вычисляемых полей в UI это проще сделать как 2 виджета KPI:

KPI1: COUNT(id) (всего)
KPI2: фильтр is_blocked=true + COUNT(id) (заблок)
KPI3: фильтр is_blocked=false + COUNT(id) (живые)
3) DAU ✅ МОЖНО
Основа: music_generation.chat_id по дням

Line chart DAU
Таблица: music_generation
Viz: line
Axis (X): created_at (или дата генерации)
Axis (Y): chat_id → Agg = COUNT
(это будет “кол-во генераций в день”, не DAU)
Чтобы это было именно DAU (уникальные пользователи в день), нужен COUNT DISTINCT chat_id.
Если в агрегациях сейчас нет DISTINCT, то:

либо принимаем приближение “активность” = количество генераций
либо делаем отдельный SQL view/семантику (если готов).
Если у вас в агрегациях уже есть DISTINCT (проверь список) — ставь:

Agg: COUNT_DISTINCT / DISTINCT COUNT (если есть)
4) «Ошибки» ✅ МОЖНО
Основа: music_generation.status='ERROR_DELIVERED'

Line (ошибки по дням)
Таблица: music_generation
Viz: line
Axis (X): created_at
Axis (Y): id → Agg = COUNT
Фильтр: status = 'ERROR_DELIVERED'
Если фильтр через Slicer:

Создай Slicer на поле status, выбери значение ERROR_DELIVERED.
5) «Сводная таблица» ✅ МОЖНО (но нужен JOIN)
Основа: JOIN chat + music_generation + payment

Как собрать в текущем UI (самый быстрый путь)
Сейчас “универсальный chart builder” строит SQL из одной таблицы.
Чтобы получить сводную как в DataLens, делай так:

Вариант 1 (рекомендуемый): создать SQL VIEW в Postgres
Создай view musgen.v_daily_summary (примерно):

day
new_users
generations
payments
revenue
И уже в UI:

Таблица: v_daily_summary
Viz: table (или line/bar по отдельным метрикам)
В table кидаешь нужные колонки в Columns
Вариант 2 (без view): несколько отдельных виджетов
“Новые пользователи” из chat
“Генерации” из music_generation
“Оплаты/выручка” из payment А потом визуально на дашборде это будет “сводка”.
6) history — Сводная ✅ МОЖНО
Основа: payment + user_music_generation_cost

Тоже JOIN/агрегации.

Рецепт такой же:

лучше view v_history_daily_summary
либо отдельные виджеты:
из payment сумма оплат по дням
из user_music_generation_cost сумма/кол-во по дням
7) «Блокировки» ⚠️ ЧАСТИЧНО
Проблема: нет истории событий, только snapshot.

Что можно
текущее число заблокированных:
chat → KPI → COUNT(id) с фильтром is_blocked=true
Чего нельзя “честно”
график “сколько заблокировали по дням” без таблицы событий (audit log).
8) «Новые пользователи» ✅ МОЖНО
Основа: chat.created_at

Line/Bar по дням
Таблица: chat
Viz: bar (или line)
Axis (X): created_at
Axis (Y): id → Agg = COUNT
9) «Клики за период» ❌ НЕТ
Нет таблицы событий кликов в musgen_2. Нужна таблица event-логов.

10) «CTR Новая песня → Генерация» ❌ НЕТ
Нет click events → нет числителя/знаменателя.

11) «Оплаты» ✅ МОЖНО
Основа: payment.created_at

Оплаты по дням (count платежей)
Таблица: payment
Viz: line или bar
Axis (X): created_at
Axis (Y): id → Agg = COUNT
Выручка по дням (sum amount)
Axis (Y): amount / price / sum → Agg = SUM
12) Retention ✅ МОЖНО
Основа: когортная логика chat + music_generation

Если делать через ваш Cohort Pivot step
Подключи таблицу фактов активности (скорее всего music_generation).
Открой Visualizations.
Включи pipeline step Cohort Pivot (Enabled).
Заполни поля:
Cohort period: поле даты “регистрации” пользователя
Если его нет в music_generation, retention корректно не сделать без join/view.
Event time: music_generation.created_at
Entity id: music_generation.chat_id
Из-за того, что регистрация (chat.created_at) в другой таблице, правильный вариант:

создать view v_user_activity где есть:
user_id (chat_id)
cohort_time (chat.created_at)
event_time (music_generation.created_at)
И уже на view включать Cohort Pivot.

===

Musgen Analytics Dashboard — Репликация 12 виджетов DataLens в PocketAnalyst
Реализовать все 12 виджетов дашборда musgen-аналитика из DataLens используя имеющуюся БД musgen_2 (PostgreSQL) и существующую инфраструктуру PocketAnalyst, добавив недостающие REST API endpoints и SQL-вьюшки.

Анализ: что за виджеты и какие поля нужны
Скриншот 1 (верхний ряд + нижний)
#	Виджет	Тип	Поля DataLens	Таблица в musgen_2
1	Откуда пришли	Таблица	refer_username, COUNT(*)	musgen.chat
2	Кол-во пользователей (без блока)	Таблица по дням	day, живые / всего / заблоки.	musgen.chat
3	DAU	Bar chart по дням	day, COUNT(DISTINCT chat_id)	musgen.music_generation
4	Ошибки	Bar chart по дням	day, errors_count	musgen.music_generation (status=ERROR*)
5	Сводная таблица	Таблица	day, новые пол., генерации, оплаты, баланс	JOIN нескольких таблиц
6	history — Сводная таблица	Таблица	day, сумма, кол-во польз., покупки, генерации, бесплатные	musgen.payment + musgen.music_generation
7	Блокировки	Bar (grouped)	day, blocked_count, unblocked_count	musgen.chat
8	Новые пользователи	Bar chart	day, new_users	musgen.chat
9	Клики за период	Таблица	event_name, clicks	❌ НЕТ В БД
10	CTR Новая песня → Генерация	KPI (3 числа)	new_song_clicks, converted_clicks, conversion_percent	❌ НЕТ В БД
11	Оплаты	Bar chart	day, payments_count	musgen.payment
12	Retention	Line chart (multi)	cohort_day, cohort_size, d1%, d7%, d30%	musgen.chat + musgen.music_generation
Анализ БД musgen_2 (реальные данные)
Схема musgen — 16 таблиц
Ключевые таблицы:

chat — id, name, username, created_at, refer_username, is_blocked — 10 122 записи, до 2026-02-07
music_generation — id, chat_id, status, error, error_type, created_at — 6 041 запись (SUCCEEDED=5299, NOT_DELIVERED=546, ERROR_DELIVERED=195)
payment — id, chat_id, amount_value, status, processed_at, created_at — 482 записи (SUCCEEDED=173, CANCELLED=308)
balance — chat_id, free_generation_count, paid_generation_count — 10 122 записи
user_music_generation_cost — music_generation_id, chat_id, cost, is_free, created_at — содержит затраты
free_generation_error — 0 записей в dump (вероятно данные в ClickHouse events)
⚠️ Важно: дамп содержит данные до 2026-02-07, а CSV-экспорты датируются 2026-02-26 — разрыв в 3 недели данных!
Что можно построить сейчас (8/12)
#	Виджет	Статус	SQL
1	Откуда пришли	✅ МОЖНО	SELECT refer_username, COUNT(*) FROM musgen.chat GROUP BY refer_username
2	Кол-во пользователей	✅ МОЖНО	SELECT DATE(created_at), SUM(!is_blocked), COUNT(*), SUM(is_blocked) FROM musgen.chat GROUP BY DATE(created_at)
3	DAU	✅ МОЖНО	SELECT DATE(created_at), COUNT(DISTINCT chat_id) FROM musgen.music_generation GROUP BY DATE(created_at)
4	Ошибки	✅ МОЖНО (частично)	SELECT DATE(created_at), COUNT(*) FROM musgen.music_generation WHERE status LIKE 'ERROR%' GROUP BY DATE(created_at)
5	Сводная таблица	✅ МОЖНО	JOIN chat + music_generation + payment
6	history — Сводная таблица	✅ МОЖНО	JOIN payment + user_music_generation_cost
7	Блокировки	✅ МОЖНО	Нет поля unblocked_at → считаем по snapshot изменений через is_blocked
8	Новые пользователи	✅ МОЖНО	SELECT DATE(created_at), COUNT(*) FROM musgen.chat
9	Клики за период	❌ НЕТ	Нужна таблица событий — нет в musgen_2
10	CTR Новая песня → Генерация	❌ НЕТ	Нужны click events
11	Оплаты	✅ МОЖНО	SELECT DATE(processed_at), COUNT(*) FROM musgen.payment WHERE status='SUCCEEDED'
12	Retention	✅ МОЖНО	Когортный SQL — первый день пользователя из chat, активность из music_generation
Итого: 10/12 можно построить (виджеты 9 и 10 требуют данных кликов, которых нет в musgen_2)

===

PocketAnalyst — Полный аудит системы + стратегия улучшения
Глубокий разбор полётов: что работает, где дыры, и текущий статус выполнения.

Последнее обновление: 2026-02-26 | Проверено по реальному состоянию кода

✅ Статус выполнения задач
#	Задача	P	Статус
Fix 1	activeSourceModel восстановлен в VisualizationsSlideInPanel	P0	✅ Готово
Fix 2	dashboard:semantic-model-v1 → заменён на React Context API	P0	✅ Готово
Fix 3	Mock-данные (mockTrendData, Math.random()) удалены из ChartPreview	P0	✅ Готово
Fix 4	Retention → Web Worker (retention.worker.ts)	P0	✅ Готово
Fix 5	Проекты в Postgres (/api/projects → datatalk_meta)	P1	✅ Готово
Fix 6	MIN/MAX compile bug (LEAST/GREATEST)	P1	✅ Готово (MIN/MAX компилируются корректно)
—	"Explain This Chart" (/api/ai/explain-chart + UI)	P2	✅ Готово
—	chart-builder-v2/ пустая директория	P2	✅ Удалена
—	SemanticModelContext + Provider в DashboardDock	P2	✅ Готово
Fix 7	AI Agent chart_create + chart_set_query инструменты	P1	❌ Не сделано
—	Metabase H2 → Postgres	P2	❌ Не сделано
—	Matrix/Map/Filled map — заглушки в production UI	P2	❌ Не сделано
—	DATATALK_META_ENCRYPTION_KEY дефолтный ключ в git	P2	❌ Не сделано
—	MSSQL init — healthcheck + depends_on: service_healthy + pinned mssql-tools:18	P1	✅ Готово
—	AI Service — таблица событий ClickHouse параметризована (CLICKHOUSE_EVENTS_TABLE)	P1	✅ Готово
—	Мёртвый груз: incrementalSync, sentinel, jitsu, dataSampling	P3	❌ Не сделано
1. Архитектура системы (Docker-стек)
Контейнер	Роль	Порт	Статус
pocketanalyst-storage	ClickHouse (аналитика)	8123	✅ Healthcheck
datatalk-postgres	Meta DB (семантика, соединения, модели)	15432	✅ Healthcheck
datatalk-agent	Query/Schema proxy (TS, Fastify)	9010	✅ Auth via shared secret
pocketanalyst-ai	AI Service (Python FastAPI, OpenAI/LiteLLM)	8004	⚠️ Без healthcheck
pocketanalyst-ingest	Vector инжест в ClickHouse	9009	✅ Depends on storage
pocketanalyst-dashboard	Next.js 15 фронтенд	3002	✅ Main app
datatalk-metabase	Embedded Metabase (изолирован)	3001	⚠️ H2 embedded DB = нестабильно
datatalk-mysql	MySQL 8.4 (для мультиконнект)	13306	✅
datatalk-mssql	MSSQL 2022 (для мультиконнект)	11433	⚠️ 1536M памяти, тяжёлый
datatalk-cloudflared	Cloudflare туннель (опционально)	—	⚠️ Idle если нет токена
postgres-init / mssql-init	Разовые init-скрипты	—	✅ restart: "no"
Общая память под весь стек: ~8.5 GB. Для dev-машины это много.

===

