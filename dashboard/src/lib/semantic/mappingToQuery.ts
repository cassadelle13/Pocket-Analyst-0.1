import { classifyFieldRef, uiAggToAggFn } from "./fieldClassifier";

type AggFn = "sum" | "avg" | "count" | "countDistinct" | "min" | "max";

type MappingLike = {
  xColumn?: string;
  groupBy?: string;
  detailsColumns?: unknown[];
  details2Columns?: unknown[];
  drilldownColumns?: unknown[];
  filters?: Array<{ field?: unknown; operator?: unknown; value?: unknown; values?: unknown[] }>;
  orderBy?: Array<{ field?: unknown; dir?: unknown }>;
  limit?: unknown;
  offset?: unknown;
  page?: unknown;
  pageSize?: unknown;
  yColumns?: Array<{ col?: string; agg?: unknown }>;
  y2Columns?: Array<{ col?: string; agg?: unknown }>;
};

function uniqStrings(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function buildLogicalQueryFromMapping(params: {
  mapping: MappingLike;
  modelJson: any;
  sourceModel: string;
  vizType: string;
  pivotConfig?: any;
  prevLogicalQuery?: any;
}): {
  sourceModel: string;
  vizType: string;
  dimensions: string[];
  measures: string[];
  measuresV2?: Array<{ ref: string; aggFn?: AggFn }>;
  measureAggOverrides?: Record<string, AggFn>;
  noFallbackMeasure?: true;
  filterNullDimensions?: true;
  filters?: Array<{ field: string; op: any; values: any[] }>;
  orderBy?: Array<{ field: string; dir: "asc" | "desc" }>;
  time?: { dimension: string; granularity?: string };
  limit: number;
  offset?: number;
} {
  const { mapping, modelJson, sourceModel, vizType, pivotConfig, prevLogicalQuery } = params;

  const getFieldKind = (ref: string): "dimension" | "measure" | "unknown" => {
    const kind = classifyFieldRef(ref, modelJson as any);
    if (kind === "measure") return "measure";
    if (kind === "dimension" || kind === "time") return "dimension";
    return "unknown";
  };

  const toFieldRef = (raw: string) => {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (s.includes(".")) return s;

    const models = modelJson?.models && typeof modelJson.models === "object" ? modelJson.models : {};
    const candidates = [sourceModel, ...Object.keys(models).filter((m: string) => m !== sourceModel)];
    for (const mName of candidates) {
      const m = models?.[mName];
      if (!m || typeof m !== "object") continue;
      const dims = m?.dimensions && typeof m.dimensions === "object" ? Object.keys(m.dimensions) : [];
      const meas = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
      const found = [...dims, ...meas].find((k) => k.toLowerCase() === s.toLowerCase());
      if (found) return `${mName}.${found}`;
    }
    return "";
  };

  const xCol = String((mapping as any)?.xColumn ?? "").trim();
  const gCol = String((mapping as any)?.groupBy ?? "").trim();
  const detailsCols = Array.isArray((mapping as any)?.detailsColumns)
    ? (mapping as any).detailsColumns.map((c: any) => String(c ?? "").trim()).filter(Boolean)
    : [];
  const details2Cols = Array.isArray((mapping as any)?.details2Columns)
    ? (mapping as any).details2Columns.map((c: any) => String(c ?? "").trim()).filter(Boolean)
    : [];
  const drillCols = Array.isArray((mapping as any)?.drilldownColumns)
    ? (mapping as any).drilldownColumns.map((c: any) => String(c ?? "").trim()).filter(Boolean)
    : [];
  const yCols = Array.isArray((mapping as any)?.yColumns) ? (mapping as any).yColumns : [];
  const yRaw = yCols.map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
  const y2Cols = Array.isArray((mapping as any)?.y2Columns) ? (mapping as any).y2Columns : [];
  const y2Raw = y2Cols.map((yy: any) => String(yy?.col ?? "").trim()).filter(Boolean);
  const yLike = [...yCols, ...y2Cols];

  const yAggOverrideByRef = (() => {
    const out = new Map<string, AggFn>();
    for (const y of yLike) {
      const colRaw = String((y as any)?.col ?? "").trim();
      if (!colRaw) continue;
      const ref = toFieldRef(colRaw);
      if (!ref) continue;
      const agg = uiAggToAggFn((y as any)?.agg);
      if (!agg) continue;
      out.set(ref, agg);
    }
    return out;
  })();

  const dimsBaseRaw = (vizType === "table" || vizType === "pivot")
    ? [...detailsCols, ...details2Cols]
    : (vizType === "pie" ? [gCol].filter(Boolean) : [xCol, gCol].filter(Boolean));
  const baseRefs: string[] = dimsBaseRaw.map(toFieldRef).filter(Boolean);
  const yRefs: string[] = [...yRaw, ...y2Raw].map(toFieldRef).filter(Boolean);

  const dimRefs = (() => {
    if (vizType === "table") {
      const out: string[] = [];
      for (const r of baseRefs) {
        if (getFieldKind(r) !== "measure") out.push(r);
      }
      return uniqStrings(out);
    }

    const baseDims = baseRefs.filter((r: string) => getFieldKind(r) === "dimension");
    const yDims = yRefs.filter((r: string) => getFieldKind(r) === "dimension");
    return uniqStrings([...baseDims, ...yDims]);
  })();

  const measureRefs = (() => {
    if (vizType === "table") {
      const fromDetails: string[] = [];
      for (const r of baseRefs) {
        if (getFieldKind(r) === "measure") fromDetails.push(r);
      }
      const fromY = yRefs.filter((r: string) => getFieldKind(r) === "measure" || yAggOverrideByRef.has(r));
      return uniqStrings([...fromY, ...fromDetails]);
    }

    const fromY = yRefs.filter((r: string) => getFieldKind(r) === "measure" || yAggOverrideByRef.has(r));
    if (fromY.length > 0) return uniqStrings(fromY);

    const m = (modelJson as any)?.models?.[sourceModel];
    const srcMeasures = m?.measures && typeof m.measures === "object" ? Object.keys(m.measures) : [];
    const fallback = String(srcMeasures[0] ?? "").trim();
    return fallback ? [`${sourceModel}.${fallback}`] : [];
  })();

  const extraDimRefs: string[] = [];
  for (const r of drillCols.map(toFieldRef).filter(Boolean)) {
    extraDimRefs.push(r);
  }
  if (pivotConfig) {
    const cohortField = toFieldRef(String((pivotConfig as any)?.cohortField ?? ""));
    const activityField = toFieldRef(String((pivotConfig as any)?.activityField ?? ""));
    const userIdField = toFieldRef(String((pivotConfig as any)?.userField ?? ""));
    for (const r of [cohortField, activityField, userIdField]) {
      if (r) extraDimRefs.push(r);
    }
  }

  const prevTime = (prevLogicalQuery && typeof prevLogicalQuery === "object") ? (prevLogicalQuery as any).time : null;
  const timeDim = prevTime && typeof prevTime === "object" ? String(prevTime.dimension ?? "").trim() : "";
  const timeGran = prevTime && typeof prevTime === "object" ? String(prevTime.granularity ?? "").trim() : "";

  const measureAggOverrides = (() => {
    const out: Record<string, AggFn> = {};
    for (const [ref, agg] of yAggOverrideByRef.entries()) {
      out[ref] = agg;
    }
    return out;
  })();

  const measuresV2 = measureRefs.map((ref) => {
    const field = String(ref ?? "").split(".").slice(1).join(".");
    const aggFn = measureAggOverrides[ref] ?? (field ? measureAggOverrides[field] : undefined);
    return aggFn ? { ref, aggFn } : { ref };
  });

  const orderBy = (() => {
    const raw = Array.isArray((mapping as any)?.orderBy) ? (mapping as any).orderBy : [];
    const out: Array<{ field: string; dir: "asc" | "desc" }> = [];
    for (const item of raw) {
      const ref = toFieldRef(String((item as any)?.field ?? ""));
      if (!ref) continue;
      const dir = String((item as any)?.dir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
      out.push({ field: ref, dir });
    }
    return out;
  })();

  const filters = (() => {
    const raw = Array.isArray((mapping as any)?.filters) ? (mapping as any).filters : [];
    const out: Array<{ field: string; op: any; values: any[] }> = [];
    for (const item of raw) {
      const ref = toFieldRef(String((item as any)?.field ?? ""));
      if (!ref) continue;
      const op = String((item as any)?.operator ?? "eq").trim() || "eq";
      const values = Array.isArray((item as any)?.values)
        ? (item as any).values
        : ((item as any)?.value != null ? [(item as any).value] : []);
      out.push({ field: ref, op: op as any, values });
    }
    return out;
  })();

  const normalizedLimit = (() => {
    const fromMapping = Number((mapping as any)?.limit);
    const fromPrev = Number((prevLogicalQuery as any)?.limit);
    const raw = Number.isFinite(fromMapping) ? fromMapping : (Number.isFinite(fromPrev) ? fromPrev : 500);
    return Math.max(1, Math.min(50_000, Math.floor(raw)));
  })();
  const normalizedOffset = (() => {
    const pageSizeRaw = Number((mapping as any)?.pageSize);
    const pageRaw = Number((mapping as any)?.page);
    if (Number.isFinite(pageRaw) && Number.isFinite(pageSizeRaw) && pageRaw >= 1 && pageSizeRaw >= 1) {
      return Math.floor((pageRaw - 1) * pageSizeRaw);
    }
    const fromMapping = Number((mapping as any)?.offset);
    const fromPrev = Number((prevLogicalQuery as any)?.offset);
    const raw = Number.isFinite(fromMapping) ? fromMapping : (Number.isFinite(fromPrev) ? fromPrev : 0);
    return Math.max(0, Math.floor(raw));
  })();

  return {
    sourceModel,
    vizType,
    dimensions: Array.from(new Set([...dimRefs, ...extraDimRefs])),
    measures: measureRefs,
    ...(measuresV2.length > 0 ? { measuresV2 } : {}),
    ...(Object.keys(measureAggOverrides).length > 0 ? { measureAggOverrides } : {}),
    ...(vizType === "table" ? { noFallbackMeasure: true } : {}),
    ...(vizType === "table" ? { filterNullDimensions: true } : {}),
    ...(filters.length > 0 ? { filters } : {}),
    ...(orderBy.length > 0 ? { orderBy } : {}),
    ...(timeDim ? { time: { dimension: timeDim, ...(timeGran ? { granularity: timeGran } : {}) } } : {}),
    limit: normalizedLimit,
    ...(normalizedOffset > 0 ? { offset: normalizedOffset } : {}),
  };
}
