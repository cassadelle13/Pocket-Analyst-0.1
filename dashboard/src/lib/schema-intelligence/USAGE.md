# Schema Intelligence - Quick Start

## Установка

Модуль уже интегрирован в проект. Никаких дополнительных зависимостей не требуется.

## Базовое использование

```typescript
import { SchemaIntelligenceService } from '@/lib/schema-intelligence';

// Входные данные
const input = {
  database: 'analytics',
  columns: [
    { database: 'analytics', table: 'events', name: 'event_id', type: 'UUID' },
    { database: 'analytics', table: 'events', name: 'timestamp', type: 'TIMESTAMP' },
    { database: 'analytics', table: 'events', name: 'revenue', type: 'DECIMAL(10,2)' },
  ]
};

// Построение семантической модели
const model = SchemaIntelligenceService.buildSemanticModel(input);

// Результат
console.log(model.dimensions);  // [{ name: 'event_id', type: 'UUID', ... }]
console.log(model.timeFields);  // [{ name: 'timestamp', type: 'TIMESTAMP', ... }]
console.log(model.measures);    // [{ name: 'revenue', type: 'DECIMAL(10,2)', ... }]
```

## API Endpoint

```bash
# POST /api/datatalk/semantic-model
curl -X POST http://localhost:3000/api/datatalk/semantic-model \
  -H "Content-Type: application/json" \
  -d '{
    "database": "analytics",
    "columns": [
      {"database": "analytics", "table": "events", "name": "id", "type": "INT"},
      {"database": "analytics", "table": "events", "name": "created_at", "type": "TIMESTAMP"}
    ]
  }'
```

## Интеграция с DataTalk

```typescript
// В компоненте DataTalk
const schemaResponse = await fetch('/api/datatalk/schema', {
  method: 'POST',
  body: JSON.stringify({ connection })
});

const schemaData = await schemaResponse.json();

// Получить семантическую модель
const semanticModel = SchemaIntelligenceService.buildFromSchemaResponse(schemaData.data);

// Использовать для UI подсказок
const dimensionColumns = semanticModel.dimensions.map(col => col.name);
const measureColumns = semanticModel.measures.map(col => col.name);
```

## Классификация колонок

### Dimensions (категориальные)
- Строки: `VARCHAR`, `TEXT`, `STRING`
- Enum: `ENUM`, `ENUM8`
- Boolean: `BOOL`, `BOOLEAN`
- UUID: `UUID`

### Measures (числовые)
- Целые: `INT`, `BIGINT`, `SMALLINT`
- Дробные: `FLOAT`, `DOUBLE`, `DECIMAL`
- Unsigned: `UINT8`, `UINT32`, `UINT64`

### Time Fields (временные)
- Дата: `DATE`, `DATE32`
- Время: `DATETIME`, `TIMESTAMP`, `TIME`

## Тестирование

```bash
# Запустить демо скрипт
npx tsx scripts/test-schema-intelligence.ts
```

## Примеры вывода

```json
{
  "dimensions": [
    {
      "database": "analytics",
      "table": "events",
      "name": "event_name",
      "type": "VARCHAR(255)",
      "classification": "dimension"
    }
  ],
  "measures": [
    {
      "database": "analytics",
      "table": "events",
      "name": "revenue",
      "type": "DECIMAL(10,2)",
      "classification": "measure"
    }
  ],
  "timeFields": [
    {
      "database": "analytics",
      "table": "events",
      "name": "timestamp",
      "type": "TIMESTAMP",
      "classification": "timeField"
    }
  ]
}
```
