import type { AggFn, MeasureRef, SemanticModelV1 } from "./types";

export type SemanticFieldKind = "dimension" | "measure" | "time" | "unknown";

export function uiAggToAggFn(raw: unknown): AggFn | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return undefined;
  if (s === "SUM") return "sum";
  if (s === "AVG" || s === "AVERAGE") return "avg";
  if (s === "COUNT") return "count";
  if (s === "COUNTD" || s === "COUNT_DISTINCT" || s === "COUNTUNIQUE") return "countDistinct";
  if (s === "MIN") return "min";
  if (s === "MAX") return "max";
  return undefined;
}

export function normalizeAggFn(raw: unknown): AggFn | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s === "sum") return "sum";
  if (s === "avg" || s === "average") return "avg";
  if (s === "count") return "count";
  if (s === "countdistinct" || s === "count_distinct" || s === "countd" || s === "countunique") return "countDistinct";
  if (s === "min") return "min";
  if (s === "max") return "max";
  return undefined;
}

export function classifyFieldRef(ref: string, semanticModel: SemanticModelV1): SemanticFieldKind {
  const q = String(ref ?? "").trim();
  if (!q || !q.includes(".")) return "unknown";
  const [modelName, ...rest] = q.split(".");
  const fieldName = rest.join(".").trim();
  if (!modelName || !fieldName) return "unknown";

  const modelDef = (semanticModel as any)?.models?.[modelName];
  if (!modelDef || typeof modelDef !== "object") return "unknown";

  const dimensions = modelDef?.dimensions && typeof modelDef.dimensions === "object" ? modelDef.dimensions : {};
  const measures = modelDef?.measures && typeof modelDef.measures === "object" ? modelDef.measures : {};
  const calculatedMeasures = modelDef?.calculatedMeasures && typeof modelDef.calculatedMeasures === "object"
    ? modelDef.calculatedMeasures
    : {};
  const calculatedFields = modelDef?.calculatedFields && typeof modelDef.calculatedFields === "object"
    ? modelDef.calculatedFields
    : {};

  if (Object.prototype.hasOwnProperty.call(measures, fieldName)) return "measure";
  if (Object.prototype.hasOwnProperty.call(calculatedMeasures, fieldName)) return "measure";
  if (Object.prototype.hasOwnProperty.call(calculatedFields, fieldName)) return "measure";
  if (Object.prototype.hasOwnProperty.call(dimensions, fieldName)) {
    const dimType = String((dimensions as any)?.[fieldName]?.type ?? "").toLowerCase();
    if (dimType === "time") return "time";
    return "dimension";
  }
  return "unknown";
}

export function toMeasureRefsWithAgg(
  refs: string[],
  aggByRef: Record<string, AggFn>
): MeasureRef[] {
  return refs
    .map((ref) => String(ref ?? "").trim())
    .filter(Boolean)
    .map((ref) => {
      const field = ref.split(".").slice(1).join(".");
      const agg = aggByRef[ref] ?? aggByRef[field];
      return agg ? { ref, aggFn: agg } : { ref };
    });
}
