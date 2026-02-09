/**
 * Schema Intelligence Examples
 * 
 * Demonstrates usage of the semantic model builder
 */

import { SchemaIntelligenceService } from './SchemaIntelligenceService';
import type { SchemaIntelligenceInput } from './types';

/**
 * Example 1: E-commerce analytics schema
 */
export function exampleEcommerce(): void {
  const input: SchemaIntelligenceInput = {
    database: 'ecommerce',
    columns: [
      // Orders table
      { database: 'ecommerce', table: 'orders', name: 'order_id', type: 'UUID' },
      { database: 'ecommerce', table: 'orders', name: 'user_id', type: 'VARCHAR(255)' },
      { database: 'ecommerce', table: 'orders', name: 'status', type: 'ENUM' },
      { database: 'ecommerce', table: 'orders', name: 'total_amount', type: 'DECIMAL(10,2)' },
      { database: 'ecommerce', table: 'orders', name: 'created_at', type: 'TIMESTAMP' },
      { database: 'ecommerce', table: 'orders', name: 'item_count', type: 'INT' },
      
      // Products table
      { database: 'ecommerce', table: 'products', name: 'product_id', type: 'UUID' },
      { database: 'ecommerce', table: 'products', name: 'name', type: 'VARCHAR(500)' },
      { database: 'ecommerce', table: 'products', name: 'category', type: 'VARCHAR(100)' },
      { database: 'ecommerce', table: 'products', name: 'price', type: 'DECIMAL(10,2)' },
      { database: 'ecommerce', table: 'products', name: 'stock_quantity', type: 'INT' },
      { database: 'ecommerce', table: 'products', name: 'is_active', type: 'BOOLEAN' },
    ]
  };

  const model = SchemaIntelligenceService.buildSemanticModel(input);
  
  console.log('=== E-commerce Semantic Model ===');
  console.log('Dimensions:', model.dimensions.length);
  console.log('Measures:', model.measures.length);
  console.log('Time Fields:', model.timeFields.length);
  console.log(JSON.stringify(model, null, 2));
}

/**
 * Example 2: ClickHouse analytics schema
 */
export function exampleClickHouse(): void {
  const input: SchemaIntelligenceInput = {
    database: 'analytics',
    columns: [
      { database: 'analytics', table: 'events', name: 'event_id', type: 'String' },
      { database: 'analytics', table: 'events', name: 'event_name', type: 'LowCardinality(String)' },
      { database: 'analytics', table: 'events', name: 'user_id', type: 'String' },
      { database: 'analytics', table: 'events', name: 'session_id', type: 'String' },
      { database: 'analytics', table: 'events', name: 'timestamp', type: 'DateTime64(3)' },
      { database: 'analytics', table: 'events', name: 'revenue', type: 'Decimal64(2)' },
      { database: 'analytics', table: 'events', name: 'duration_ms', type: 'UInt32' },
      { database: 'analytics', table: 'events', name: 'platform', type: 'Enum8' },
      { database: 'analytics', table: 'events', name: 'country', type: 'FixedString(2)' },
    ]
  };

  const model = SchemaIntelligenceService.buildSemanticModel(input);
  
  console.log('=== ClickHouse Semantic Model ===');
  console.log('Dimensions:', model.dimensions.length);
  console.log('Measures:', model.measures.length);
  console.log('Time Fields:', model.timeFields.length);
  console.log(JSON.stringify(model, null, 2));
}

/**
 * Example 3: PostgreSQL schema
 */
export function examplePostgreSQL(): void {
  const input: SchemaIntelligenceInput = {
    database: 'app_db',
    columns: [
      { database: 'app_db', schema: 'public', table: 'users', name: 'id', type: 'BIGINT' },
      { database: 'app_db', schema: 'public', table: 'users', name: 'email', type: 'VARCHAR(255)' },
      { database: 'app_db', schema: 'public', table: 'users', name: 'created_at', type: 'TIMESTAMPTZ' },
      { database: 'app_db', schema: 'public', table: 'users', name: 'is_verified', type: 'BOOLEAN' },
      { database: 'app_db', schema: 'public', table: 'users', name: 'login_count', type: 'INTEGER' },
      { database: 'app_db', schema: 'public', table: 'users', name: 'last_login', type: 'TIMESTAMP' },
    ]
  };

  const model = SchemaIntelligenceService.buildSemanticModel(input);
  
  console.log('=== PostgreSQL Semantic Model ===');
  console.log('Dimensions:', model.dimensions.length);
  console.log('Measures:', model.measures.length);
  console.log('Time Fields:', model.timeFields.length);
  console.log(JSON.stringify(model, null, 2));
}

/**
 * Run all examples
 */
export function runAllExamples(): void {
  exampleEcommerce();
  console.log('\n');
  exampleClickHouse();
  console.log('\n');
  examplePostgreSQL();
}
