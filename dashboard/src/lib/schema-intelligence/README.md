# Schema Intelligence Module

Rules-based semantic model generator for database metadata classification.

## Overview

Classifies database columns into three semantic categories:
- **dimensions** - categorical/string data (VARCHAR, ENUM, UUID, BOOL)
- **measures** - numeric data (INT, FLOAT, DECIMAL)
- **timeFields** - temporal data (DATE, TIMESTAMP, DATETIME)

## Usage

### Basic Usage

```typescript
import { SchemaIntelligenceService } from '@/lib/schema-intelligence';

const input = {
  database: 'analytics',
  columns: [
    { database: 'analytics', table: 'events', name: 'event_id', type: 'UUID' },
    { database: 'analytics', table: 'events', name: 'event_name', type: 'VARCHAR(255)' },
    { database: 'analytics', table: 'events', name: 'user_id', type: 'VARCHAR(255)' },
    { database: 'analytics', table: 'events', name: 'timestamp', type: 'TIMESTAMP' },
    { database: 'analytics', table: 'events', name: 'revenue', type: 'DECIMAL(10,2)' },
    { database: 'analytics', table: 'events', name: 'quantity', type: 'INT' },
  ]
};

const semanticModel = SchemaIntelligenceService.buildSemanticModel(input);

console.log(semanticModel);
```

### Output Example

```json
{
  "dimensions": [
    {
      "database": "analytics",
      "table": "events",
      "name": "event_id",
      "type": "UUID",
      "classification": "dimension"
    },
    {
      "database": "analytics",
      "table": "events",
      "name": "event_name",
      "type": "VARCHAR(255)",
      "classification": "dimension"
    },
    {
      "database": "analytics",
      "table": "events",
      "name": "user_id",
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
    },
    {
      "database": "analytics",
      "table": "events",
      "name": "quantity",
      "type": "INT",
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

### Integration with Schema Endpoint

```typescript
import { SchemaIntelligenceService } from '@/lib/schema-intelligence';

// Get schema from datatalk endpoint
const response = await fetch('/api/datatalk/schema', {
  method: 'POST',
  body: JSON.stringify({ connection: { ... } })
});

const schemaData = await response.json();

// Build semantic model
const semanticModel = SchemaIntelligenceService.buildFromSchemaResponse(schemaData.data);
```

### API Endpoint

```bash
POST /api/datatalk/semantic-model
Content-Type: application/json

{
  "database": "analytics",
  "columns": [
    { "database": "analytics", "table": "events", "name": "id", "type": "INT" },
    { "database": "analytics", "table": "events", "name": "name", "type": "VARCHAR" }
  ]
}
```

Response:
```json
{
  "data": {
    "dimensions": [...],
    "measures": [...],
    "timeFields": [...]
  }
}
```

## Classification Rules

### Measures (Numeric Types)
- Integer: `INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `INTEGER`
- Unsigned: `UINT8`, `UINT16`, `UINT32`, `UINT64`
- Float: `FLOAT`, `DOUBLE`, `REAL`, `FLOAT32`, `FLOAT64`
- Decimal: `DECIMAL`, `NUMERIC`, `NUMBER`
- ClickHouse: `INT8`-`INT256`, `DECIMAL32`-`DECIMAL256`

### Time Fields (Temporal Types)
- Date: `DATE`, `DATE32`
- DateTime: `DATETIME`, `DATETIME64`, `TIMESTAMP`
- Time: `TIME`, `TIMESTAMPTZ`, `DATETIMEOFFSET`

### Dimensions (Categorical Types)
- String: `VARCHAR`, `CHAR`, `TEXT`, `STRING`, `NVARCHAR`
- Enum: `ENUM`, `ENUM8`, `ENUM16`
- Boolean: `BOOL`, `BOOLEAN`
- UUID: `UUID`
- ClickHouse: `FIXEDSTRING`, `LOWCARDINALITY`

## Supported Databases

- ClickHouse
- PostgreSQL
- MySQL
- MSSQL

Type normalization handles vendor-specific variations automatically.

## Design Principles

1. **Deterministic** - Same input always produces same output
2. **No AI/ML** - Pure rules-based classification
3. **No heuristics** - Only type-based logic
4. **Minimal dependencies** - Zero external packages
5. **Type-safe** - Full TypeScript coverage

## Architecture

```
schema-intelligence/
├── types.ts                    # Type definitions
├── typeClassifier.ts           # Classification logic
├── SchemaIntelligenceService.ts # Main service
├── index.ts                    # Public exports
└── README.md                   # Documentation
```

## Testing

```typescript
import { classifyColumn } from '@/lib/schema-intelligence';

// Test individual column
const column = {
  database: 'test',
  table: 'users',
  name: 'age',
  type: 'INT'
};

const classification = classifyColumn(column);
console.assert(classification === 'measure');
```

## Limitations

- Does not detect relationships between tables
- Does not recommend visualization types
- Does not analyze data cardinality or distribution
- Does not handle complex/nested types (JSON, ARRAY)

These are intentional design constraints for simplicity and determinism.
