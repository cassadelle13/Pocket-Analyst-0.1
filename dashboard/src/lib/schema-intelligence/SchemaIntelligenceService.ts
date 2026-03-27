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
import type { SemanticModelV1 } from '../semantic/types';

export class SchemaIntelligenceService {
  private static normalizeType(raw: string): string {
    return String(raw ?? "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, "")
      .replace(/nullable/g, "")
      .trim();
  }

  private static inferDimensionSemanticType(column: ColumnMetadata): "string" | "time" | "boolean" {
    const t = this.normalizeType((column as any)?.type ?? "");
    if (t.includes("date") || t.includes("time")) return "time";
    if (t === "bool" || t === "boolean" || t === "uint8") return "boolean";
    return "string";
  }

  private static inferMeasureAgg(column: ColumnMetadata): "sum" | "avg" {
    const name = String((column as any)?.name ?? "").toLowerCase().trim();
    if (!name) return "sum";
    if (/(rate|ratio|pct|percent|average|avg|mean)$/i.test(name)) return "avg";
    return "sum";
  }

  private static isIdentifierLike(rawName: string): boolean {
    const n = String(rawName ?? "").toLowerCase().trim();
    if (!n) return false;
    if (n === "id") return true;
    if (n.endsWith("_id")) return true;
    if (n.endsWith("id") && n.length <= 6) return true;
    return false;
  }

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

  static buildSemanticModelV1FromSchemaResponse(schemaResponse: {
    database?: string;
    columns?: ColumnMetadata[];
  }): { semanticModel: SemanticModelV1; modelToTableKey: Record<string, string> } {
    const database = String(schemaResponse.database || 'unknown');
    const columns = Array.isArray(schemaResponse.columns) ? schemaResponse.columns : [];

    const safeKey = (raw: string): string => {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '_');
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleaned)) return '';
      return cleaned;
    };

    const group = new Map<string, ColumnMetadata[]>();
    const modelToTableKey: Record<string, string> = {};

    for (const c of columns) {
      const table = String((c as any)?.table ?? '').trim();
      const name = String((c as any)?.name ?? '').trim();
      if (!table || !name) continue;
      const modelName = safeKey(table);
      if (!modelName) continue;

      const schemaName = (c as any)?.schema != null ? String((c as any).schema).trim() : '';
      const dbName = String((c as any)?.database ?? database).trim();
      const tableKey = `${schemaName || dbName}.${table}`;
      modelToTableKey[modelName] = tableKey;

      const prev = group.get(modelName);
      if (prev) prev.push(c);
      else group.set(modelName, [c]);
    }

    const models: SemanticModelV1['models'] = {};

    for (const [modelName, cols] of group.entries()) {
      const dimensions: Record<string, { type: any; sql: string }> = {};
      const measures: Record<string, { type: any; sql: string }> = {};
      const calculatedFields: Record<string, any> = {};
      const idLikeDims: string[] = [];

      const colNames = cols.map((c) => String((c as any)?.name ?? '').trim()).filter(Boolean);
      const lower = new Set(colNames.map((n) => n.toLowerCase()));

      const pk = (() => {
        if (lower.has('id')) return 'id';
        const byTable = `${modelName.toLowerCase()}_id`;
        if (lower.has(byTable)) return byTable;
        const anyId = colNames.find((n) => n.toLowerCase().endsWith('_id'));
        return anyId ? String(anyId).trim() : '';
      })();

      const defaultTimeDimension = (() => {
        const prefs = [
          'created_at',
          'updated_at',
          'timestamp',
          'ts',
          'date',
          'event_ts',
          'event_time',
          'event_date',
          'registered_at',
          'order_date',
          'occurred_at',
          'happened_at',
          'log_time',
          'signup_at',
          'purchase_date',
          'session_start',
          'dt',
          'deleted_at',
          'closed_at',
          'started_at',
          'ended_at',
          'inserted_at',
          'modified_at',
          'published_at',
        ];
        for (const p of prefs) {
          if (lower.has(p)) return p;
        }
        const anyTime = cols.find((c) => classifyColumn(c) === 'timeField');
        return anyTime ? String((anyTime as any)?.name ?? '').trim() : '';
      })();

      for (const c of cols) {
        const name = String((c as any)?.name ?? '').trim();
        const key = safeKey(name);
        if (!key) continue;

        const classification = classifyColumn(c);
        const sqlExpr = `{{alias}}.${key}`;

        if (classification === 'measure') {
          if (!measures[key]) measures[key] = { type: this.inferMeasureAgg(c), sql: sqlExpr };
          continue;
        }

        if (classification === 'timeField') {
          if (!dimensions[key]) dimensions[key] = { type: 'time', sql: sqlExpr };
          continue;
        }

        if (!dimensions[key]) dimensions[key] = { type: this.inferDimensionSemanticType(c), sql: sqlExpr };
        if (this.isIdentifierLike(name)) idLikeDims.push(key);
      }

      const pkKey = safeKey(pk);
      if (pkKey && !measures[`${pkKey}_count_distinct`]) {
        measures[`${pkKey}_count_distinct`] = {
          type: 'countDistinct',
          sql: `{{alias}}.${pkKey}`,
        };
      }

      if (!measures.rows) {
        measures.rows = { type: 'count', sql: '*' };
      }

      for (const dimKey of idLikeDims) {
        const mKey = `${dimKey}_count_distinct`;
        if (measures[mKey]) continue;
        measures[mKey] = {
          type: 'countDistinct',
          sql: `{{alias}}.${dimKey}`,
        };
      }

      const retentionUserDim = (() => {
        const preferred = ['user_id', 'customer_id', 'client_id', 'visitor_id', 'device_id'];
        for (const k of preferred) {
          if (dimensions[k]) return k;
        }
        if (pkKey && dimensions[pkKey]) return pkKey;
        return idLikeDims.find((k) => !!dimensions[k]) || '';
      })();

      if (defaultTimeDimension && dimensions[defaultTimeDimension] && retentionUserDim) {
        const metricMeasureKey = `${retentionUserDim}_count_distinct`;
        const metricRef = measures[metricMeasureKey]
          ? `${modelName}.${metricMeasureKey}`
          : `${modelName}.${retentionUserDim}`;
        calculatedFields.retention = {
          type: 'pivot_cohort',
          cohortBy: `${modelName}.${defaultTimeDimension}`,
          eventDate: `${modelName}.${defaultTimeDimension}`,
          metric: metricRef,
          periods: [0, 1, 7, 14, 30],
          unit: 'day',
          pivotMode: 'auto',
          pivotRowLimit: 500,
        };
      }

      models[modelName] = {
        source: { kind: 'abstract' },
        ...(pk ? { primaryKey: pk } : {}),
        ...(defaultTimeDimension ? { defaultTimeDimension } : {}),
        dimensions,
        measures,
        ...(Object.keys(calculatedFields).length ? { calculatedFields } : {}),
      } as any;
    }

    const modelNames = Object.keys(models);
    const modelSet = new Set(modelNames);

    const normalizeModelCandidate = (raw: string): string[] => {
      const base = safeKey(raw);
      if (!base) return [];
      const res = [base];
      if (base.endsWith('s') && base.length > 1) res.push(base.slice(0, -1));
      else res.push(`${base}s`);
      return Array.from(new Set(res)).filter((x) => x && modelSet.has(x));
    };

    for (const fromModel of modelNames) {
      const m = (models as any)[fromModel];
      const dims = (m?.dimensions && typeof m.dimensions === 'object') ? Object.keys(m.dimensions) : [];
      const joins: Record<string, any> = {};

      for (const d of dims) {
        const lc = String(d).toLowerCase();
        if (!lc.endsWith('_id')) continue;
        const prefix = lc.slice(0, -3);
        if (!prefix) continue;
        const candidates = normalizeModelCandidate(prefix);
        for (const toModel of candidates) {
          if (toModel === fromModel) continue;
          const toPk = String((models as any)[toModel]?.primaryKey ?? 'id').trim() || 'id';
          const joinName = toModel;
          if (joins[joinName]) continue;
          joins[joinName] = {
            toModel,
            type: 'many_to_one',
            fromField: `${fromModel}.${d}`,
            toField: `${toModel}.${toPk}`,
            operator: 'eq',
            direction: 'both',
            active: true,
          };
        }
      }

      if (Object.keys(joins).length) {
        (models as any)[fromModel] = {
          ...m,
          joins: {
            ...(m?.joins && typeof m.joins === 'object' ? m.joins : {}),
            ...joins,
          },
        };
      }
    }

    return {
      semanticModel: {
        version: 1,
        models,
      },
      modelToTableKey,
    };
  }
}
