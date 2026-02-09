/**
 * Type Classifier Tests
 * 
 * Unit tests for column type classification
 */

import { classifyColumn } from '../typeClassifier';
import type { ColumnMetadata } from '../types';

describe('typeClassifier', () => {
  describe('Measures (Numeric Types)', () => {
    const measureTypes = [
      'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
      'INT8', 'INT16', 'INT32', 'INT64', 'INT128', 'INT256',
      'UINT8', 'UINT16', 'UINT32', 'UINT64',
      'FLOAT', 'FLOAT32', 'FLOAT64', 'DOUBLE', 'REAL',
      'DECIMAL', 'DECIMAL(10,2)', 'NUMERIC', 'NUMBER',
      'DECIMAL32(2)', 'DECIMAL64(4)', 'DECIMAL128(8)',
    ];

    measureTypes.forEach(type => {
      it(`should classify ${type} as measure`, () => {
        const column: ColumnMetadata = {
          database: 'test',
          table: 'test_table',
          name: 'test_column',
          type,
        };
        expect(classifyColumn(column)).toBe('measure');
      });
    });
  });

  describe('Time Fields (Temporal Types)', () => {
    const timeTypes = [
      'DATE', 'DATE32',
      'DATETIME', 'DATETIME64', 'DATETIME64(3)',
      'TIMESTAMP', 'TIMESTAMPTZ',
      'TIME',
      'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET',
    ];

    timeTypes.forEach(type => {
      it(`should classify ${type} as timeField`, () => {
        const column: ColumnMetadata = {
          database: 'test',
          table: 'test_table',
          name: 'test_column',
          type,
        };
        expect(classifyColumn(column)).toBe('timeField');
      });
    });
  });

  describe('Dimensions (Categorical Types)', () => {
    const dimensionTypes = [
      'VARCHAR', 'VARCHAR(255)', 'CHAR', 'CHAR(10)',
      'STRING', 'TEXT', 'NVARCHAR', 'NTEXT',
      'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT',
      'ENUM', 'ENUM8', 'ENUM16',
      'FIXEDSTRING', 'FIXEDSTRING(10)',
      'LOWCARDINALITY(STRING)',
      'UUID',
      'BOOL', 'BOOLEAN',
    ];

    dimensionTypes.forEach(type => {
      it(`should classify ${type} as dimension`, () => {
        const column: ColumnMetadata = {
          database: 'test',
          table: 'test_table',
          name: 'test_column',
          type,
        };
        expect(classifyColumn(column)).toBe('dimension');
      });
    });
  });

  describe('Nullable Types', () => {
    it('should handle Nullable(INT) as measure', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'Nullable(INT)',
        nullable: true,
      };
      expect(classifyColumn(column)).toBe('measure');
    });

    it('should handle Nullable(String) as dimension', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'Nullable(String)',
        nullable: true,
      };
      expect(classifyColumn(column)).toBe('dimension');
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle uppercase types', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'VARCHAR',
      };
      expect(classifyColumn(column)).toBe('dimension');
    });

    it('should handle lowercase types', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'varchar',
      };
      expect(classifyColumn(column)).toBe('dimension');
    });

    it('should handle mixed case types', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'VarChar',
      };
      expect(classifyColumn(column)).toBe('dimension');
    });
  });

  describe('Unknown Types Fallback', () => {
    it('should classify unknown type as dimension (safe fallback)', () => {
      const column: ColumnMetadata = {
        database: 'test',
        table: 'test_table',
        name: 'test_column',
        type: 'UNKNOWN_TYPE',
      };
      expect(classifyColumn(column)).toBe('dimension');
    });
  });
});
