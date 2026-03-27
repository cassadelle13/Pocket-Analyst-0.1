import type { LogicalQuery, SemanticFieldType, SemanticModelV1 } from "./types";
import { buildLogicalQueryFromMapping } from "./mappingToQuery";

type ColumnMetaLike = {
  name?: unknown;
  type?: unknown;
};

type MappingLike = {
  xColumn?: string;
  groupBy?: string;
  detailsColumns?: unknown[];
  details2Columns?: unknown[];
  drilldownColumns?: unknown[];
  filters?: Array<{ field?: unknown; operator?: unknown; value?: unknown; values?: unknown[] }>;
  orderBy?: Array<{ field?: unknown; dir?: unknown }>;
  yColumns?: Array<{ col?: string; agg?: unknown }>;
  y2Columns?: Array<{ col?: string; agg?: unknown }>;
};

function safeIdent(raw: string, fallback: string): string {
  const s = String(raw ?? "").trim();
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) return fallback;
  if (!/^[a-zA-Z_]/.test(cleaned)) return `_${cleaned}`;
  return cleaned;
}

function isSimpleIdent(raw: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(raw ?? "").trim());
}

function quoteField(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (isSimpleIdent(s)) return s;
  return `"${s.replace(/"/g, `""`)}"`;
}

function inferFieldType(rawType: unknown): SemanticFieldType {
  const t = String(rawType ?? "").toLowerCase();
  if (/(date|time|timestamp)/.test(t) && !/(char|text|varchar|string)/.test(t)) return "time";
  if (/(bool)/.test(t)) return "boolean";
  if (/(int|decimal|numeric|double|float|real|money|number)/.test(t)) return "number";
  return "string";
}

export function buildAutoSemanticModel(params: {
  tableKey: string;
  columnsMeta: ColumnMetaLike[];
  preferredModelName?: string;
}): { semanticModel: SemanticModelV1; sourceModel: string } {
  const modelName = safeIdent(
    String(params.preferredModelName ?? "").trim() || String(params.tableKey ?? "").split(".").pop() || "source_model",
    "source_model"
  );
  const dimensions: Record<string, { type: SemanticFieldType; sql: string }> = {};
  const measures: Record<string, { type: "sum" | "avg" | "count" | "countDistinct" | "min" | "max"; sql: string }> = {};
  let defaultTimeDimension = "";

  const cols = Array.isArray(params.columnsMeta) ? params.columnsMeta : [];
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i] ?? {};
    const rawName = String((col as any)?.name ?? "").trim();
    if (!rawName) continue;
    const dimName = safeIdent(rawName, `field_${i + 1}`);
    const fieldType = inferFieldType((col as any)?.type);
    if (!defaultTimeDimension && fieldType === "time") defaultTimeDimension = dimName;

    dimensions[dimName] = {
      type: fieldType,
      sql: `{{alias}}.${quoteField(rawName)}`,
    };

    if (fieldType === "number") {
      measures[dimName] = {
        type: "sum",
        sql: `{{alias}}.${quoteField(rawName)}`,
      };
    }
  }

  if (Object.keys(measures).length === 0) {
    measures.row_count = { type: "count", sql: "*" };
  }

  const semanticModel: SemanticModelV1 = {
    version: 1,
    models: {
      [modelName]: {
        source: { kind: "abstract" },
        ...(defaultTimeDimension ? { defaultTimeDimension } : {}),
        dimensions,
        measures,
      },
    },
  };

  return { semanticModel, sourceModel: modelName };
}

export function buildAutoSemanticQueryPayload(params: {
  tableKey: string;
  connectionId: string;
  connectionType?: string;
  columnsMeta: ColumnMetaLike[];
  mapping: MappingLike;
  vizType: string;
  pivotConfig?: any;
  prevLogicalQuery?: any;
}): {
  semanticModel: SemanticModelV1;
  sourceBindings: Record<string, { connectionId: string; tableKey: string; connectionType?: string }>;
  logicalQuery: LogicalQuery & { vizType: string };
  sourceModel: string;
} {
  const { semanticModel, sourceModel } = buildAutoSemanticModel({
    tableKey: params.tableKey,
    columnsMeta: params.columnsMeta,
  });

  const logicalQuery = buildLogicalQueryFromMapping({
    mapping: params.mapping,
    modelJson: semanticModel,
    sourceModel,
    vizType: params.vizType,
    pivotConfig: params.pivotConfig,
    prevLogicalQuery: params.prevLogicalQuery,
  });

  return {
    semanticModel,
    sourceBindings: {
      [sourceModel]: {
        connectionId: String(params.connectionId ?? "").trim(),
        tableKey: String(params.tableKey ?? "").trim(),
        ...(params.connectionType ? { connectionType: String(params.connectionType).trim() } : {}),
      },
    },
    logicalQuery: logicalQuery as LogicalQuery & { vizType: string },
    sourceModel,
  };
}
