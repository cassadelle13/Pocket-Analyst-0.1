import { uiAggToAggFn } from "./fieldClassifier";
import type { LogicalQuery, SemanticModelV1 } from "./types";
import type { VizType } from "@/types/viz";

type MappingLike = {
  xColumn?: string;
  groupBy?: string;
  detailsColumns?: string[];
  details2Columns?: string[];
  yColumns?: Array<{ col?: string; agg?: string }>;
  y2Columns?: Array<{ col?: string; agg?: string }>;
};

type Params = {
  vizType: VizType;
  mapping: MappingLike | null | undefined;
  sourceModel: string;
  semanticModel: SemanticModelV1 | null | undefined;
  prevLogicalQuery?: Partial<LogicalQuery> | null;
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

export function wellsToLogicalQuery(params: Params): LogicalQuery | null {
  const sourceModel = String(params.sourceModel ?? "").trim();
  const model = params.semanticModel;
  if (!sourceModel || !model || typeof model !== "object") return null;
  const modelObj = (model as any)?.models?.[sourceModel];
  if (!modelObj || typeof modelObj !== "object") return null;

  const dimensionsObj = (modelObj as any)?.dimensions && typeof (modelObj as any).dimensions === "object" ? (modelObj as any).dimensions : {};
  const measuresObj = (modelObj as any)?.measures && typeof (modelObj as any).measures === "object" ? (modelObj as any).measures : {};
  const calcMeasuresObj = (modelObj as any)?.calculatedMeasures && typeof (modelObj as any).calculatedMeasures === "object" ? (modelObj as any).calculatedMeasures : {};
  const calcFieldsObj = (modelObj as any)?.calculatedFields && typeof (modelObj as any).calculatedFields === "object" ? (modelObj as any).calculatedFields : {};
  const dimensionNames = Object.keys(dimensionsObj);
  const measureNames = Object.keys(measuresObj);
  const calcMeasureNames = Object.keys(calcMeasuresObj);
  const calcFieldNames = Object.keys(calcFieldsObj);
  const mapping = (params.mapping && typeof params.mapping === "object") ? params.mapping : {};

  const resolveRefInModel = (modelName: string, raw: string): string => {
    const m = ((model as any)?.models?.[modelName] && typeof (model as any).models[modelName] === "object")
      ? (model as any).models[modelName]
      : null;
    if (!m) return "";
    const dimensionKeys = Object.keys(((m as any)?.dimensions && typeof (m as any).dimensions === "object") ? (m as any).dimensions : {});
    const measureKeys = Object.keys(((m as any)?.measures && typeof (m as any).measures === "object") ? (m as any).measures : {});
    const calcMeasureKeys = Object.keys(((m as any)?.calculatedMeasures && typeof (m as any).calculatedMeasures === "object") ? (m as any).calculatedMeasures : {});
    const calcFieldKeys = Object.keys(((m as any)?.calculatedFields && typeof (m as any).calculatedFields === "object") ? (m as any).calculatedFields : {});
    const all = [...dimensionKeys, ...measureKeys, ...calcMeasureKeys, ...calcFieldKeys];
    const match = all.find((n) => n.toLowerCase() === raw.toLowerCase());
    return match ? `${modelName}.${match}` : "";
  };

  const toRef = (raw: unknown): string => {
    const value = String(raw ?? "").trim();
    if (!value) return "";
    if (value.includes(".")) return value;
    const dimMatch = dimensionNames.find((n) => n.toLowerCase() === value.toLowerCase());
    if (dimMatch) return `${sourceModel}.${dimMatch}`;
    const measureMatch = measureNames.find((n) => n.toLowerCase() === value.toLowerCase());
    if (measureMatch) return `${sourceModel}.${measureMatch}`;
    const calcMeasureMatch = calcMeasureNames.find((n) => n.toLowerCase() === value.toLowerCase());
    if (calcMeasureMatch) return `${sourceModel}.${calcMeasureMatch}`;
    const calcFieldMatch = calcFieldNames.find((n) => n.toLowerCase() === value.toLowerCase());
    if (calcFieldMatch) return `${sourceModel}.${calcFieldMatch}`;
    const allModels = ((model as any)?.models && typeof (model as any).models === "object")
      ? Object.keys((model as any).models)
      : [];
    for (const modelName of allModels) {
      const resolved = resolveRefInModel(modelName, value);
      if (resolved) return resolved;
    }
    if (String(process.env.NEXT_PUBLIC_DEBUG_WELLS_REF ?? "").trim() === "1") {
      try {
        console.warn("[wellsToLogicalQuery] unresolved field ref", { value, sourceModel });
      } catch {}
    }
    return "";
  };

  const yLike = [
    ...(Array.isArray(mapping.yColumns) ? mapping.yColumns : []),
    ...(Array.isArray(mapping.y2Columns) ? mapping.y2Columns : []),
  ];
  const yRefs = uniq(yLike.map((y) => toRef((y as any)?.col)));
  const axisRefs = (() => {
    if (params.vizType === "pie" || params.vizType === "donut") {
      return uniq([toRef(mapping.groupBy)]);
    }
    return uniq([toRef(mapping.xColumn), toRef(mapping.groupBy)]);
  })();
  const detailsRefs = uniq([
    ...(Array.isArray(mapping.detailsColumns) ? mapping.detailsColumns : []).map(toRef),
    ...(Array.isArray(mapping.details2Columns) ? mapping.details2Columns : []).map(toRef),
  ]);

  const dimensions: string[] = [];
  const measures: string[] = [];
  const resolveModelField = (ref: string): { modelName: string; fieldName: string } | null => {
    const s = String(ref ?? "").trim();
    const idx = s.indexOf(".");
    if (idx <= 0 || idx >= s.length - 1) return null;
    return { modelName: s.slice(0, idx), fieldName: s.slice(idx + 1) };
  };
  const addDimOrMeasure = (ref: string) => {
    const parsed = resolveModelField(ref);
    if (!parsed) return;
    const modelName = parsed.modelName;
    const field = parsed.fieldName;
    const targetModelObj = ((model as any)?.models?.[modelName] && typeof (model as any).models[modelName] === "object")
      ? (model as any).models[modelName]
      : null;
    if (!targetModelObj) return;
    const targetDimensions = (targetModelObj as any)?.dimensions && typeof (targetModelObj as any).dimensions === "object"
      ? (targetModelObj as any).dimensions
      : {};
    const targetMeasures = (targetModelObj as any)?.measures && typeof (targetModelObj as any).measures === "object"
      ? (targetModelObj as any).measures
      : {};
    const targetCalcMeasures = (targetModelObj as any)?.calculatedMeasures && typeof (targetModelObj as any).calculatedMeasures === "object"
      ? (targetModelObj as any).calculatedMeasures
      : {};
    const targetCalcFields = (targetModelObj as any)?.calculatedFields && typeof (targetModelObj as any).calculatedFields === "object"
      ? (targetModelObj as any).calculatedFields
      : {};
    if (Object.prototype.hasOwnProperty.call(targetMeasures, field)) {
      measures.push(ref);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(targetCalcMeasures, field)) {
      measures.push(ref);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(targetDimensions, field)) {
      dimensions.push(ref);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(targetCalcFields, field)) {
      measures.push(ref);
    }
  };

  if (params.vizType === "table") {
    detailsRefs.forEach(addDimOrMeasure);
  } else if (params.vizType === "pivot") {
    detailsRefs.forEach(addDimOrMeasure);
    yRefs.forEach(addDimOrMeasure);
  } else {
    axisRefs.forEach(addDimOrMeasure);
    yRefs.forEach(addDimOrMeasure);
  }

  const uniqDims = uniq(dimensions);
  let uniqMeasures = uniq(measures);
  const hasDims = uniqDims.length > 0;
  const hasMeasures = uniqMeasures.length > 0;
  if (!hasDims && !hasMeasures) return null;
  const allowsDimensionOnly = params.vizType === "table" || params.vizType === "slicer";
  if (!allowsDimensionOnly && hasDims && !hasMeasures) {
    const fallbackMeasure = (() => {
      if (measureNames.includes("row_count")) return `${sourceModel}.row_count`;
      const sorted = [...measureNames]
        .map((m) => String(m ?? "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return sorted[0] ? `${sourceModel}.${sorted[0]}` : "";
    })();
    if (fallbackMeasure) {
      uniqMeasures = [fallbackMeasure];
    } else {
      return null;
    }
  }

  const measureAggOverrides: Record<string, "sum" | "avg" | "count" | "countDistinct" | "min" | "max"> = {};
  for (const item of yLike) {
    const ref = toRef((item as any)?.col);
    if (!ref) continue;
    const agg = uiAggToAggFn((item as any)?.agg);
    if (agg) measureAggOverrides[ref] = agg;
  }

  const measuresV2 = uniqMeasures.map((ref) => {
    const aggFn = measureAggOverrides[ref];
    return aggFn ? ({ ref, aggFn } as const) : ({ ref } as const);
  });

  const prev = (params.prevLogicalQuery && typeof params.prevLogicalQuery === "object") ? params.prevLogicalQuery : {};
  return {
    ...(prev as any),
    sourceModel,
    dimensions: uniqDims,
    measures: uniqMeasures,
    measuresV2: measuresV2.length > 0 ? measuresV2 : [],
    measureAggOverrides: Object.keys(measureAggOverrides).length > 0 ? measureAggOverrides : {},
    ...(params.vizType === "table" ? { noFallbackMeasure: true } : {}),
    clientClassified: true,
    filterNullDimensions: false,
    limit: Number.isFinite(Number((prev as any)?.limit)) ? Number((prev as any).limit) : 500,
  } as LogicalQuery;
}
