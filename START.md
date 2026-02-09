# 🚀 Быстрый запуск PocketAnalyst

## Одна команда для запуска всего

```bash
docker-compose up -d storage dashboard
```

Это запустит:
- ✅ ClickHouse (БД)
- ✅ Dashboard (фронтенд)

**Время запуска**: 3-5 минут при первой сборке, 30 секунд при повторном запуске.

---

## После запуска

1. Дождитесь сообщения: `✔ Container pocketanalyst-dashboard Started`
2. Откройте: **http://localhost:3000**
3. Перейдите в **Chart Builder** (третья кнопка в меню)

---

## Проблема: Долгая сборка

**Причина**: Docker собирает dashboard каждый раз заново (~30 минут npm install)

**Решение**: Используйте уже собранные образы или запускайте локально:

### Вариант 1: Локальный запуск (быстро)

```bash
# 1. Запустить только ClickHouse
docker-compose up -d storage

# 2. Запустить фронтенд локально
cd dashboard
npm run dev
```

**Проблема**: Нужно изменить `host: 'storage'` на `host: 'localhost'` в Chart Builder

### Вариант 2: Оптимизированный Docker (рекомендуется)

Создайте `.dockerignore` файлы (уже созданы) и используйте BuildKit:

```bash
# Включить BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Или в PowerShell
$env:DOCKER_BUILDKIT=1
$env:COMPOSE_DOCKER_CLI_BUILD=1

# Запустить
docker-compose up -d --build storage dashboard
```

---

## Текущая проблема

**Chart Builder не работает** из-за:

1. ❌ Долгая сборка Docker (30+ минут)
2. ❌ При локальном запуске — неправильный host
3. ❌ Нет готовых pre-built образов

---

## Рекомендация

**Используйте локальный запуск для разработки:**

```bash
# 1. Запустить ClickHouse
docker-compose up -d storage

# 2. В другом терминале
cd dashboard
npm run dev

# 3. Открыть http://localhost:3000/chart-builder
```

**Для production**: Соберите образы один раз и используйте их:

```bash
# Собрать образы
docker-compose build

# Запустить
docker-compose up -d storage dashboard
```

---

## Что работает сейчас

✅ ClickHouse запущен и работает  
✅ Фронтенд код исправлен (выбор таблицы, персистентность, множественные графики)  
✅ Chart Builder добавлен в навигацию  
❌ Docker сборка слишком долгая  
❌ Chart Builder не протестирован в работе  

---

## Следующие шаги

1. Решить проблему с долгой сборкой Docker
2. Протестировать Chart Builder
3. Добавить тестовые данные в ClickHouse
