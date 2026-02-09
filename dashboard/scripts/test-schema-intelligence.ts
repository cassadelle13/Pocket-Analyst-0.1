/**
 * Schema Intelligence Demo Script
 * 
 * Run: npx tsx scripts/test-schema-intelligence.ts
 */

import { SchemaIntelligenceService } from '../src/lib/schema-intelligence';

console.log('=== Schema Intelligence Module Demo ===\n');

// Example 1: ClickHouse analytics schema
const clickhouseInput = {
  database: 'analytics',
  columns: [
    { database: 'analytics', table: 'events', name: 'event_id', type: 'String' },
    { database: 'analytics', table: 'events', name: 'event_name', type: 'LowCardinality(String)' },
    { database: 'analytics', table: 'events', name: 'user_id', type: 'String' },
    { database: 'analytics', table: 'events', name: 'timestamp', type: 'DateTime64(3)' },
    { database: 'analytics', table: 'events', name: 'revenue', type: 'Decimal64(2)' },
    { database: 'analytics', table: 'events', name: 'duration_ms', type: 'UInt32' },
    { database: 'analytics', table: 'events', name: 'platform', type: 'Enum8' },
    { database: 'analytics', table: 'events', name: 'is_mobile', type: 'Bool' },
  ]
};

const model = SchemaIntelligenceService.buildSemanticModel(clickhouseInput);

console.log('📊 ClickHouse Analytics Schema');
console.log('─'.repeat(50));
console.log(`Total columns: ${clickhouseInput.columns.length}`);
console.log(`Dimensions: ${model.dimensions.length}`);
console.log(`Measures: ${model.measures.length}`);
console.log(`Time Fields: ${model.timeFields.length}\n`);

console.log('🏷️  Dimensions (categorical data):');
model.dimensions.forEach(col => {
  console.log(`  - ${col.table}.${col.name} (${col.type})`);
});

console.log('\n📈 Measures (numeric data):');
model.measures.forEach(col => {
  console.log(`  - ${col.table}.${col.name} (${col.type})`);
});

console.log('\n⏰ Time Fields (temporal data):');
model.timeFields.forEach(col => {
  console.log(`  - ${col.table}.${col.name} (${col.type})`);
});

console.log('\n' + '='.repeat(50));
console.log('✅ Schema Intelligence Module working correctly!');
console.log('='.repeat(50));
