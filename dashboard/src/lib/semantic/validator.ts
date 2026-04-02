import type { SemanticModelV1 } from "./types";
import type { LogicalQuery, SemanticQueryRequest } from "./types";
import { SEMANTIC_REF_RE } from "./requestContext";

function isObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeIdent(id: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id);
}

function isRef(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return !!s && SEMANTIC_REF_RE.test(s);
}

function isPivotMode(v: unknown): boolean {
  return v === "auto" || v === "client" || v === "sql";
}

function isCohortUnit(v: unknown): boolean {
  return v === "day" || v === "week" || v === "month";
}

const FORBIDDEN_SQL_RE = /(;)|(--)|(\/\*)|(\*\/)|\b(drop|alter|insert|update|delete|truncate|create|grant|revoke)\b/i;

function validateSqlExpr(expr: unknown, path: string): string[] {
  const errors: string[] = [];
  const s = String(expr ?? "").trim();
  if (!s) {
    errors.push(`${path}: sql is empty`);
    return errors;
  }
  if (FORBIDDEN_SQL_RE.test(s)) {
    errors.push(`${path}: sql contains forbidden tokens/keywords`);
  }
  return errors;
}

export type ValidateSemanticModelResult = {
  ok: boolean;
  errors: string[];
};

export function validateSemanticModelV1(model: unknown): ValidateSemanticModelResult {
  const errors: string[] = [];

  if (!isObject(model)) return { ok: false, errors: ["model must be an object"] };
  if ((model as any).version !== 1) errors.push("model.version must be 1");

  const models = (model as any).models;
  if (!isObject(models)) {
    errors.push("model.models must be an object");
    return { ok: errors.length === 0, errors };
  }

  for (const [modelName, m] of Object.entries(models)) {
    if (!safeIdent(modelName)) errors.push(`models.${modelName}: invalid identifier`);
    if (!isObject(m)) {
      errors.push(`models.${modelName}: must be an object`);
      continue;
    }

    const source = (m as any).source;
    if (source != null) {
      if (!isObject(source)) {
        errors.push(`models.${modelName}.source: must be an object`);
      } else {
        if (String(source.kind ?? "") !== "abstract") errors.push(`models.${modelName}.source.kind must be 'abstract'`);
      }
    }

    const dims = (m as any).dimensions;
    if (!isObject(dims)) {
      errors.push(`models.${modelName}.dimensions must be an object`);
    } else {
      for (const [dimName, d] of Object.entries(dims)) {
        if (!safeIdent(dimName)) errors.push(`models.${modelName}.dimensions.${dimName}: invalid identifier`);
        if (!isObject(d)) {
          errors.push(`models.${modelName}.dimensions.${dimName}: must be an object`);
          continue;
        }
        const type = String((d as any).type ?? "");
        if (type !== "string" && type !== "number" && type !== "time" && type !== "boolean") {
          errors.push(`models.${modelName}.dimensions.${dimName}.type invalid`);
        }
        errors.push(...validateSqlExpr((d as any).sql, `models.${modelName}.dimensions.${dimName}`));
      }
    }

    const measures = (m as any).measures;
    if (!isObject(measures)) {
      errors.push(`models.${modelName}.measures must be an object`);
    } else {
      for (const [measureName, mm] of Object.entries(measures)) {
        if (!safeIdent(measureName)) errors.push(`models.${modelName}.measures.${measureName}: invalid identifier`);
        if (!isObject(mm)) {
          errors.push(`models.${modelName}.measures.${measureName}: must be an object`);
          continue;
        }
        const type = String((mm as any).type ?? "").toLowerCase();
        const allowed = new Set(["sum", "avg", "count", "countdistinct", "min", "max"]);
        if (!allowed.has(type)) errors.push(`models.${modelName}.measures.${measureName}.type invalid`);
        errors.push(...validateSqlExpr((mm as any).sql ?? "*", `models.${modelName}.measures.${measureName}`));
      }
    }

    const calc = (m as any).calculatedMeasures;
    if (calc != null) {
      if (!isObject(calc)) {
        errors.push(`models.${modelName}.calculatedMeasures must be an object`);
      } else {
        for (const [calcName, cc] of Object.entries(calc)) {
          if (!safeIdent(calcName)) errors.push(`models.${modelName}.calculatedMeasures.${calcName}: invalid identifier`);
          if (!isObject(cc)) {
            errors.push(`models.${modelName}.calculatedMeasures.${calcName}: must be an object`);
            continue;
          }
          errors.push(...validateSqlExpr((cc as any).sql, `models.${modelName}.calculatedMeasures.${calcName}`));
        }
      }
    }

    const calcFields = (m as any).calculatedFields;
    if (calcFields != null) {
      if (!isObject(calcFields)) {
        errors.push(`models.${modelName}.calculatedFields must be an object`);
      } else {
        for (const [fieldName, def] of Object.entries(calcFields)) {
          if (!safeIdent(fieldName)) errors.push(`models.${modelName}.calculatedFields.${fieldName}: invalid identifier`);
          if (!isObject(def)) {
            errors.push(`models.${modelName}.calculatedFields.${fieldName}: must be an object`);
            continue;
          }
          const t = String((def as any).type ?? "").trim();
          const basePath = `models.${modelName}.calculatedFields.${fieldName}`;

          if (t === "pivot_cohort") {
            const cohortBy = (def as any).cohortBy;
            const eventDate = (def as any).eventDate;
            const metric = (def as any).metric;
            const periods = (def as any).periods;
            const unit = (def as any).unit;
            const pivotMode = (def as any).pivotMode;
            const pivotRowLimit = (def as any).pivotRowLimit;

            if (!isRef(cohortBy)) errors.push(`${basePath}.cohortBy must be a ref 'Model.field'`);
            if (!isRef(eventDate)) errors.push(`${basePath}.eventDate must be a ref 'Model.field'`);
            if (!isRef(metric)) errors.push(`${basePath}.metric must be a ref 'Model.field'`);
            if (!Array.isArray(periods) || periods.length === 0 || periods.some((p) => !Number.isFinite(Number(p)) || Number(p) < 0)) {
              errors.push(`${basePath}.periods must be a non-empty array of non-negative numbers`);
            }
            if (unit != null && !isCohortUnit(unit)) errors.push(`${basePath}.unit must be one of day|week|month`);
            if (pivotMode != null && !isPivotMode(pivotMode)) errors.push(`${basePath}.pivotMode must be one of auto|client|sql`);
            if (pivotRowLimit != null && (!Number.isFinite(Number(pivotRowLimit)) || Number(pivotRowLimit) < 1)) {
              errors.push(`${basePath}.pivotRowLimit must be a positive number`);
            }
            continue;
          }

          if (t === "conversion_rate") {
            const numerator = (def as any).numerator;
            const denominator = (def as any).denominator;
            const format = (def as any).format;
            if (!isRef(numerator)) errors.push(`${basePath}.numerator must be a ref 'Model.field'`);
            if (!isRef(denominator)) errors.push(`${basePath}.denominator must be a ref 'Model.field'`);
            if (format != null && format !== "percent" && format !== "decimal") {
              errors.push(`${basePath}.format must be one of percent|decimal`);
            }
            continue;
          }

          if (t === "rolling_avg") {
            const measure = (def as any).measure;
            const window = (def as any).window;
            const orderBy = (def as any).orderBy;
            const partitionBy = (def as any).partitionBy;
            if (!isRef(measure)) errors.push(`${basePath}.measure must be a ref 'Model.field'`);
            if (!isRef(orderBy)) errors.push(`${basePath}.orderBy must be a ref 'Model.field'`);
            if (!Number.isFinite(Number(window)) || Number(window) < 1) errors.push(`${basePath}.window must be a positive number`);
            if (partitionBy != null) {
              if (!Array.isArray(partitionBy) || partitionBy.some((x) => !isRef(x))) {
                errors.push(`${basePath}.partitionBy must be an array of refs 'Model.field'`);
              }
            }
            continue;
          }

          if (t === "window_agg") {
            const fn = String((def as any).fn ?? "").toLowerCase();
            const measure = (def as any).measure;
            const partitionBy = (def as any).partitionBy;
            const orderBy = (def as any).orderBy;
            const frameStart = (def as any).frameStart;
            const frameEnd = (def as any).frameEnd;
            const allowedFn = new Set(["sum", "avg", "max", "min", "count"]);
            if (!allowedFn.has(fn)) errors.push(`${basePath}.fn must be one of sum|avg|max|min|count`);
            if (!isRef(measure)) errors.push(`${basePath}.measure must be a ref 'Model.field'`);
            if (partitionBy != null) {
              if (!Array.isArray(partitionBy) || partitionBy.some((x) => !isRef(x))) {
                errors.push(`${basePath}.partitionBy must be an array of refs 'Model.field'`);
              }
            }
            if (orderBy != null && !isRef(orderBy)) errors.push(`${basePath}.orderBy must be a ref 'Model.field'`);
            if (frameStart != null && (!Number.isFinite(Number(frameStart)) || Number(frameStart) < 0)) {
              errors.push(`${basePath}.frameStart must be a non-negative number`);
            }
            if (frameEnd != null && (!Number.isFinite(Number(frameEnd)) || Number(frameEnd) < 0)) {
              errors.push(`${basePath}.frameEnd must be a non-negative number`);
            }
            continue;
          }

          errors.push(`${basePath}.type invalid`);
        }
      }
    }

    const joins = (m as any).joins;
    if (joins != null) {
      if (!isObject(joins)) {
        errors.push(`models.${modelName}.joins must be an object`);
      } else {
        for (const [joinName, j] of Object.entries(joins)) {
          if (!safeIdent(joinName)) errors.push(`models.${modelName}.joins.${joinName}: invalid identifier`);
          if (!isObject(j)) {
            errors.push(`models.${modelName}.joins.${joinName}: must be an object`);
            continue;
          }
          const toModel = String((j as any).toModel ?? "").trim();
          if (!toModel) errors.push(`models.${modelName}.joins.${joinName}.toModel is required`);
          const type = String((j as any).type ?? "");
          if (type !== "many_to_one" && type !== "one_to_many" && type !== "one_to_one") {
            errors.push(`models.${modelName}.joins.${joinName}.type invalid`);
          }

          const fromField = (j as any).fromField;
          const toField = (j as any).toField;
          const operator = String((j as any).operator ?? "").trim();
          const direction = String((j as any).direction ?? "").trim();
          const active = (j as any).active;
          const on = (j as any).on;

          const hasStructured = fromField != null || toField != null || operator || direction || active != null;
          const hasLegacyOn = on != null && String(on ?? "").trim();

          if (!hasStructured && !hasLegacyOn) {
            errors.push(`models.${modelName}.joins.${joinName}: either structured (fromField/toField/...) or legacy on must be provided`);
          }

          if (hasStructured) {
            if (!isRef(fromField)) errors.push(`models.${modelName}.joins.${joinName}.fromField must be a ref 'Model.field'`);
            if (!isRef(toField)) errors.push(`models.${modelName}.joins.${joinName}.toField must be a ref 'Model.field'`);
            if (operator && operator !== "eq") errors.push(`models.${modelName}.joins.${joinName}.operator invalid`);
            if (direction && direction !== "single" && direction !== "both") errors.push(`models.${modelName}.joins.${joinName}.direction invalid`);
            if (active != null && typeof active !== "boolean") errors.push(`models.${modelName}.joins.${joinName}.active must be boolean`);
          }

          if (hasLegacyOn) {
            errors.push(...validateSqlExpr(on, `models.${modelName}.joins.${joinName}.on`));
          }
        }
      }
    }

    const rls = (m as any).rls;
    if (rls != null) {
      if (!Array.isArray(rls)) {
        errors.push(`models.${modelName}.rls must be an array`);
      } else {
        const allowedOps = new Set([
          "eq", "neq", "in", "not_in", "between", "not_between",
          "gt", "gte", "lt", "lte", "contains", "icontains",
          "notcontains", "noticontains", "startswith", "istartswith",
          "endswith", "iendswith", "isnull", "isnotnull", "top_n",
        ]);
        for (let i = 0; i < rls.length; i += 1) {
          const rr = rls[i];
          const basePath = `models.${modelName}.rls[${i}]`;
          if (!isObject(rr)) {
            errors.push(`${basePath}: must be an object`);
            continue;
          }
          const field = String((rr as any)?.field ?? "").trim();
          const op = String((rr as any)?.op ?? "eq").trim();
          const param = String((rr as any)?.param ?? "").trim();
          if (!isRef(field)) errors.push(`${basePath}.field must be a ref 'Model.field'`);
          if (!param) errors.push(`${basePath}.param is required`);
          if (!allowedOps.has(op)) errors.push(`${basePath}.op invalid`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeSemanticModelV1(model: SemanticModelV1): SemanticModelV1 {
  return model;
}

export type ValidateLogicalQueryResult = {
  ok: boolean;
  errors: string[];
};

function hasOwn(obj: unknown, key: string): boolean {
  return !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

function getFieldKind(model: SemanticModelV1, ref: string): "dimension" | "measure" | "unknown" {
  const s = String(ref ?? "").trim();
  if (!s.includes(".")) return "unknown";
  const [modelName, ...rest] = s.split(".");
  const field = rest.join(".").trim();
  if (!modelName || !field) return "unknown";
  const m = (model as any)?.models?.[modelName];
  if (!m || typeof m !== "object") return "unknown";
  if (hasOwn((m as any)?.measures, field)) return "measure";
  if (hasOwn((m as any)?.calculatedMeasures, field)) return "measure";
  if (hasOwn((m as any)?.calculatedFields, field)) return "measure";
  if (hasOwn((m as any)?.dimensions, field)) return "dimension";
  return "unknown";
}

export function validateLogicalQuery(query: unknown, model: SemanticModelV1): ValidateLogicalQueryResult {
  const errors: string[] = [];
  const q = (query && typeof query === "object") ? (query as LogicalQuery) : null;
  if (!q) return { ok: false, errors: ["query must be an object"] };

  const sourceModel = String((q as any)?.sourceModel ?? "").trim();
  if (!sourceModel) errors.push("query.sourceModel is required");
  if (sourceModel && !hasOwn((model as any)?.models, sourceModel)) {
    errors.push(`query.sourceModel does not exist in semantic model: ${sourceModel}`);
  }

  const dims = Array.isArray((q as any)?.dimensions) ? (q as any).dimensions : [];
  const measures = Array.isArray((q as any)?.measures) ? (q as any).measures : [];
  const filters = Array.isArray((q as any)?.filters) ? (q as any).filters : [];
  const orderBy = Array.isArray((q as any)?.orderBy) ? (q as any).orderBy : [];

  for (const ref of dims) {
    const s = String(ref ?? "").trim();
    if (!isRef(s)) errors.push(`query.dimensions contains invalid ref: ${s}`);
    else if (getFieldKind(model, s) === "unknown") errors.push(`query.dimensions contains unknown ref: ${s}`);
  }

  for (const ref of measures) {
    const s = String(ref ?? "").trim();
    if (!isRef(s)) errors.push(`query.measures contains invalid ref: ${s}`);
    else if (getFieldKind(model, s) === "unknown") errors.push(`query.measures contains unknown ref: ${s}`);
  }

  const measuresV2 = Array.isArray((q as any)?.measuresV2) ? (q as any).measuresV2 : [];
  for (const m of measuresV2) {
    const ref = String((m as any)?.ref ?? "").trim();
    if (!isRef(ref)) errors.push(`query.measuresV2 contains invalid ref: ${ref}`);
    else if (getFieldKind(model, ref) === "unknown") errors.push(`query.measuresV2 contains unknown ref: ${ref}`);
  }

  for (const f of filters) {
    const field = String((f as any)?.field ?? "").trim();
    if (!isRef(field)) errors.push(`query.filters contains invalid field ref: ${field}`);
    else if (getFieldKind(model, field) === "unknown") errors.push(`query.filters contains unknown field ref: ${field}`);
  }

  for (const o of orderBy) {
    const field = String((o as any)?.field ?? "").trim();
    if (!field) continue;
    if (!isRef(field) && !safeIdent(field)) errors.push(`query.orderBy contains invalid field: ${field}`);
    if (isRef(field) && getFieldKind(model, field) === "unknown") errors.push(`query.orderBy contains unknown ref: ${field}`);
  }

  const hasDims = dims.length > 0;
  const hasMeasures = measures.length > 0 || measuresV2.length > 0;
  if (!hasDims && !hasMeasures) {
    errors.push("query must request at least one dimension or measure");
  }

  // Guard against common aggregation mismatch: dimensions + no measures in non-table mode.
  const vizType = String((q as any)?.vizType ?? "").toLowerCase();
  if (vizType !== "table" && hasDims && !hasMeasures) {
    errors.push("non-table query with dimensions must include at least one measure");
  }

  const limitRaw = (q as any)?.limit;
  if (limitRaw != null && (!Number.isFinite(Number(limitRaw)) || Number(limitRaw) < 1)) {
    errors.push("query.limit must be a positive number");
  }
  const offsetRaw = (q as any)?.offset;
  if (offsetRaw != null && (!Number.isFinite(Number(offsetRaw)) || Number(offsetRaw) < 0)) {
    errors.push("query.offset must be a non-negative number");
  }

  return { ok: errors.length === 0, errors };
}

export function validateSemanticQueryRequest(body: unknown): ValidateLogicalQueryResult {
  const errors: string[] = [];
  const req = (body && typeof body === "object") ? (body as SemanticQueryRequest) : null;
  if (!req) return { ok: false, errors: ["request body must be an object"] };
  if (!req.query || typeof req.query !== "object") errors.push("query is required");

  const hasSemanticModelId = !!String((req as any)?.semanticModelId ?? "").trim();
  const hasEmbeddedModel = !!((req as any)?.semanticModel && typeof (req as any).semanticModel === "object");
  if (!hasSemanticModelId && !hasEmbeddedModel) {
    errors.push("semanticModelId or embedded semanticModel is required");
  }

  if (hasEmbeddedModel) {
    const validated = validateSemanticModelV1((req as any).semanticModel);
    if (!validated.ok) {
      for (const e of validated.errors) errors.push(`semanticModel: ${e}`);
    }
  }

  if (hasEmbeddedModel) {
    const lb = validateLogicalQuery((req as any).query, (req as any).semanticModel as SemanticModelV1);
    if (!lb.ok) {
      for (const e of lb.errors) errors.push(e);
    }
  }

  const pageRaw = (req as any)?.page;
  const pageSizeRaw = (req as any)?.pageSize;
  const offsetRowsRaw = (req as any)?.offsetRows;
  if (pageRaw != null && (!Number.isFinite(Number(pageRaw)) || Number(pageRaw) < 1)) {
    errors.push("page must be a positive number");
  }
  if (pageSizeRaw != null && (!Number.isFinite(Number(pageSizeRaw)) || Number(pageSizeRaw) < 1)) {
    errors.push("pageSize must be a positive number");
  }
  if (offsetRowsRaw != null && (!Number.isFinite(Number(offsetRowsRaw)) || Number(offsetRowsRaw) < 0)) {
    errors.push("offsetRows must be a non-negative number");
  }

  return { ok: errors.length === 0, errors };
}
