/**
 * Schema Intelligence Module
 * 
 * Exports for semantic model generation
 */

export { SchemaIntelligenceService } from './SchemaIntelligenceService';
export { classifyColumn, classifyColumns } from './typeClassifier';
export type { 
  ColumnMetadata, 
  ClassifiedColumn, 
  SemanticModel, 
  SchemaIntelligenceInput 
} from './types';
