/**
 * Query Generator
 * 
 * Generates SQL queries from chart configuration
 */

import type { ChartConfig } from '../../types/chart-builder';
import { sqlStringLiteral } from '../propertyFilterUtils';

export function generateQuery(
  config: ChartConfig,
  tableName: string,
  limit: number = 1000
): string | null {
  if (!config.xAxis || config.yAxis.length === 0) {
    return null;
  }

  const xColumn = `${config.xAxis.table}.${config.xAxis.name}`;
  const yColumns = config.yAxis.map(y => {
    if (y.classification === 'measure') {
      return `SUM(${y.table}.${y.name}) as ${y.name}`;
    }
    return `${y.table}.${y.name}`;
  });

  const selectClause = [xColumn, ...yColumns].join(', ');
  
  let whereClause = '';
  if (config.filters.length > 0) {
    const conditions = config.filters.map(f => {
      const value = sqlStringLiteral(f.value);
      switch (f.operator) {
        case 'eq':
          return `${f.column} = ${value}`;
        case 'gt':
          return `${f.column} > ${value}`;
        case 'lt':
          return `${f.column} < ${value}`;
        case 'contains':
          return `${f.column} LIKE '%${f.value}%'`;
        default:
          return `${f.column} = ${value}`;
      }
    });
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  }

  const groupByClause = `GROUP BY ${xColumn}`;
  const orderByClause = `ORDER BY ${xColumn}`;
  const limitClause = `LIMIT ${limit}`;

  return `
SELECT ${selectClause}
FROM ${tableName}
${whereClause}
${groupByClause}
${orderByClause}
${limitClause}
  `.trim();
}
