/**
 * Schema Intelligence Service
 * 
 * Main entry point for semantic model generation from database metadata
 */

import type { 
  ColumnMetadata, 
  ClassifiedColumn, 
  SemanticModel, 
  SchemaIntelligenceInput 
} from './types';
import { classifyColumn } from './typeClassifier';

export class SchemaIntelligenceService {
  /**
   * Build semantic model from database metadata
   * 
   * @param input - Database metadata containing columns
   * @returns Semantic model with classified columns
   */
  static buildSemanticModel(input: SchemaIntelligenceInput): SemanticModel {
    const dimensions: ClassifiedColumn[] = [];
    const measures: ClassifiedColumn[] = [];
    const timeFields: ClassifiedColumn[] = [];

    for (const column of input.columns) {
      const classification = classifyColumn(column);
      
      const classifiedColumn: ClassifiedColumn = {
        ...column,
        classification,
      };

      switch (classification) {
        case 'dimension':
          dimensions.push(classifiedColumn);
          break;
        case 'measure':
          measures.push(classifiedColumn);
          break;
        case 'timeField':
          timeFields.push(classifiedColumn);
          break;
      }
    }

    return {
      dimensions,
      measures,
      timeFields,
    };
  }

  /**
   * Build semantic model from raw schema response
   * Compatible with existing /api/datatalk/schema endpoint
   * 
   * @param schemaResponse - Response from schema endpoint
   * @returns Semantic model
   */
  static buildFromSchemaResponse(schemaResponse: {
    database?: string;
    columns?: ColumnMetadata[];
  }): SemanticModel {
    const database = schemaResponse.database || 'unknown';
    const columns = schemaResponse.columns || [];

    return this.buildSemanticModel({ database, columns });
  }
}
