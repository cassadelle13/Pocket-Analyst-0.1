# Как работает автоматическое обнаружение БД

## ✅ Автоматическое обнаружение УЖЕ РАБОТАЕТ!

При открытии страницы `/connect` система **автоматически** запускает обнаружение БД.

### Что происходит автоматически:

1. **Пользователь открывает** `http://localhost:3001/connect`

2. **Автоматически вызывается** функция `discoverDatabases()`
   ```typescript
   useEffect(() => {
     if (!isDemoMode) {
       discoverDatabases(); // ← Автоматический вызов при загрузке
     }
   }, [isDemoMode]);
   ```

3. **Frontend делает запрос** к `/api/discover`

4. **Backend проксирует** запрос к `datatalk-agent:9010/discover`

5. **datatalk-agent выполняет:**
   - ✅ Сканирование localhost (все порты: 5432-5434, 3306-3308, 1433-1434)
   - ✅ Поиск Docker контейнеров с БД
   - ✅ Поиск файловых БД (SQLite, Access) в Documents/Desktop/Downloads
   - ⏱️ Занимает 1-2 секунды

6. **Результаты отображаются** на странице автоматически

## Что видит пользователь:

```
┌─────────────────────────────────────────────┐
│  Connect to Database                        │
│  ┌─────────────────────────────────────┐   │
│  │ 🔍 Searching for databases...       │   │ ← Автоматически
│  └─────────────────────────────────────┘   │
│                                             │
│  Available Databases                        │
│  Found 3 available                          │ ← Результаты
│                                             │
│  ✅ PostgreSQL (localhost:5432)             │
│  ✅ MySQL (localhost:3306)                  │
│  ✅ MSSQL (localhost:1433)                  │
└─────────────────────────────────────────────┘
```

## Никаких ручных действий не требуется!

Пользователю **НЕ НУЖНО**:
- ❌ Вводить команды в терминал
- ❌ Вызывать API вручную
- ❌ Нажимать кнопку "Search"

Все происходит **АВТОМАТИЧЕСКИ** при загрузке страницы!

## Режимы обнаружения:

### Quick Scan (по умолчанию, автоматически)
- Сканирует localhost
- Все стандартные и нестандартные порты
- Docker контейнеры
- Файловые БД
- **Время:** 1-2 секунды

### Full Network Scan (опционально, вручную)
Если нужно найти БД в локальной сети:
1. Нажать кнопку "Scan Network" на странице /connect
2. Система просканирует всю локальную сеть (192.168.x.x)
3. **Время:** 30-60 секунд

## Архитектура автоматического обнаружения:

```
User opens /connect
    ↓
useEffect() triggers
    ↓
discoverDatabases() called automatically
    ↓
GET /api/discover
    ↓
GET datatalk-agent:9010/discover
    ↓
┌─────────────────────────────────────┐
│ datatalk-agent выполняет:           │
│ 1. quickScan() - localhost          │
│ 2. findDatabaseContainers() - Docker│
│ 3. findDatabaseFiles() - files      │
└─────────────────────────────────────┘
    ↓
Returns: { network: [...], docker: [...], files: [...] }
    ↓
Frontend обрабатывает и показывает результаты
    ↓
User видит список доступных БД
```

## Что найдет система автоматически:

### 1. Сетевые БД на localhost
- PostgreSQL на портах 5432, 5433, 5434
- MySQL на портах 3306, 3307, 3308
- MSSQL на портах 1433, 1434

### 2. Docker контейнеры
- Все контейнеры с PostgreSQL
- Все контейнеры с MySQL/MariaDB
- Все контейнеры с MSSQL
- **Бонус:** Автоматически получает credentials из env variables!

### 3. Файловые БД
- SQLite файлы (.db, .sqlite, .sqlite3, .db3)
- MS Access файлы (.mdb, .accdb)
- В папках: Documents, Desktop, Downloads

## Пример реального использования:

```bash
# 1. Запустить приложение
docker-compose up -d

# 2. Открыть браузер
http://localhost:3001/connect

# 3. Подождать 1-2 секунды

# 4. Увидеть список БД:
# ✅ PostgreSQL (localhost:5432) - datatalk_meta
# ✅ MySQL (localhost:3306) - datatalk_test
# ✅ MSSQL (localhost:1433) - master
# ✅ Docker: postgres (datatalk-postgres:5432)
# ✅ File: mydata.db (C:\Users\...\Documents\mydata.db)

# 5. Выбрать БД и подключиться!
```

## Итог:

**Система УЖЕ работает автоматически!**

Никаких дополнительных настроек или команд не требуется.
Просто откройте `/connect` и система сама найдет все доступные БД.

🚀 **Готово к использованию прямо сейчас!**
