export type SemanticFieldType = "string" | "number" | "time" | "boolean";

export type SemanticMeasureType =
  | "sum"
  | "avg"
  | "count"
  | "countDistinct"
  | "min"
  | "max";

export type SemanticJoinType = "many_to_one" | "one_to_many" | "one_to_one";

export type SemanticJoinDirection = "single" | "both";

export type SemanticJoinV1 = {
  toModel: string;
  type: SemanticJoinType;

  // Preferred (Power BI-like) structured relationship definition.
  fromField?: string;
  toField?: string;
  operator?: "eq";
  direction?: SemanticJoinDirection;
  active?: boolean;

  // Legacy escape hatch (back-compat). If provided, planner will render this ON clause.
  on?: string;
};

export type PivotMode = "auto" | "client" | "sql";

export type PivotRole = "pivot_row" | "pivot_column" | "pivot_measure" | "pivot_annotation";

export type CohortPivotUnit = "day" | "week" | "month";

export type PivotCohortFieldDef = {
  type: "pivot_cohort";
  source?: string;
  cohortBy: string;
  eventDate: string;
  metric: string;
  periods: number[];
  unit?: CohortPivotUnit;
  pivotMode?: PivotMode;
  pivotRowLimit?: number;
};

export type ConversionRateFieldDef = {
  type: "conversion_rate";
  numerator: string;
  denominator: string;
  format?: "percent" | "decimal";
};

export type RollingAvgFieldDef = {
  type: "rolling_avg";
  measure: string;
  window: number;
  orderBy: string;
  partitionBy?: string[];
};

export type WindowAggFieldDef = {
  type: "window_agg";
  fn: "sum" | "avg" | "max" | "min" | "count";
  measure: string;
  partitionBy?: string[];
  orderBy?: string;
  frameStart?: number;
  frameEnd?: number;
};

export type CalculatedFieldDef =
  | PivotCohortFieldDef
  | ConversionRateFieldDef
  | RollingAvgFieldDef
  | WindowAggFieldDef;

export type SemanticModelV1 = {
  version: 1;
  models: Record<
    string,
    {
      source?: {
        kind: "abstract";
      };
      primaryKey?: string;
      defaultTimeDimension?: string;
      dimensions: Record<string, { type: SemanticFieldType; sql: string }>;
      measures: Record<string, { type: SemanticMeasureType; sql: string; filters?: LogicalFilter[] }>;
      calculatedMeasures?: Record<string, { sql: string; format?: "number" | "percent" | "currency" }>;
      calculatedFields?: Record<string, CalculatedFieldDef>;
      rls?: Array<{
        field: string;
        op?: LogicalFilter["op"];
        param: string;
      }>;
      joins?: Record<string, SemanticJoinV1>;
    }
  >;
};

export type SemanticModelSourceBinding = {
  semanticModelId: string;
  scopeType: "project" | "dashboard";
  scopeId: string;
  modelName: string;
  connectionId: string;
  tableKey: string;
};

export type LogicalFilter = {
  field: string;
  op:
    | "eq"
    | "neq"
    | "in"
    | "not_in"
    | "between"
    | "not_between"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "icontains"
    | "notcontains"
    | "noticontains"
    | "startswith"
    | "istartswith"
    | "endswith"
    | "iendswith"
    | "isnull"
    | "isnotnull";
  values: any[];
};

export type LogicalTime = {
  dimension: string;
  granularity?: "day" | "week" | "month" | "quarter" | "year";
};

export type AggFn = "sum" | "avg" | "count" | "countDistinct" | "min" | "max";
export type SqlDialect = "clickhouse" | "postgres" | "mssql";

export type MeasureRef = {
  ref: string;
  aggFn?: AggFn;
};

export type LogicalQuery = {
  sourceModel: string;
  dimensions?: string[];
  measures?: string[];
  measuresV2?: MeasureRef[];
  measureAggOverrides?: Record<string, AggFn>;
  time?: LogicalTime;
  filters?: LogicalFilter[];
  filterNullDimensions?: boolean;
  noFallbackMeasure?: boolean;
  orderBy?: Array<{ field: string; dir: "asc" | "desc" }>;
  limit?: number;
  offset?: number;
};

export type GlobalFilterContextV1 = {
  version: 1;
  filters: Array<{
    field: string;
    op: LogicalFilter["op"];
    values: any[];
    scope?: "report" | "page" | "visual";
    sourceChartId?: string;
    pageKey?: string;
  }>;
  dateRange?: {
    start?: string;
    end?: string;
  };
  params?: Record<string, any>;
};

export type QueryErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_QUERY"
  | "INVALID_MODEL"
  | "INVALID_SOURCE_BINDINGS"
  | "COMPILE_ERROR"
  | "EXECUTION_ERROR";

export type QueryError = {
  code: QueryErrorCode;
  message: string;
  path?: string;
  details?: unknown;
};

export type SemanticQueryRequest = {
  projectId?: string;
  semanticModelId?: string;
  semanticModel?: SemanticModelV1;
  sourceBindings?: Record<string, { connectionId: string; tableKey: string; connectionType?: string }>;
  query: LogicalQuery & { vizType?: string };
  globalContext?: GlobalFilterContextV1 | null;
  requestContext?: { chartId?: string; pageKey?: string } | null;
  ephemeralCalculatedMeasures?: Record<string, { sql: string; format?: "number" | "percent" | "currency" }>;
  role?: "user" | "business" | "admin";
  maxRows?: number;
  offsetRows?: number;
  page?: number;
  pageSize?: number;
  timeoutMs?: number;
  cacheHint?: string;
  compileOnly?: boolean;
  debug?: boolean;
};

export type SemanticQueryResponse = {
  data: {
    columns: string[];
    rows: unknown[][];
    rowCount?: number;
  };
  debug?: unknown;
  error?: QueryError;
};
