/**
 * Schema Intelligence Types
 * 
 * Type definitions for semantic model classification
 */

export interface ColumnMetadata {
  database: string;
  schema?: string;
  table: string;
  name: string;
  type: string;
  nullable?: boolean;
}

export interface ClassifiedColumn extends ColumnMetadata {
  classification: 'dimension' | 'measure' | 'timeField';
}

export interface SemanticModel {
  dimensions: ClassifiedColumn[];
  measures: ClassifiedColumn[];
  timeFields: ClassifiedColumn[];
}

export interface SchemaIntelligenceInput {
  database: string;
  columns: ColumnMetadata[];
}
