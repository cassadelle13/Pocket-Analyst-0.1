"use client";

import type React from "react";
import type { BiFilter } from "../../../store/biFiltersContext";

export type DragFieldInfo = {
  ref: string;
  fieldType?: "dimension" | "measure" | "time";
  semanticType?: string;
};

export type ParsedDrop = { kind: "field"; field: DragFieldInfo };

export function parseDropEvent(e: React.DragEvent): ParsedDrop | null {
  const raw = e.dataTransfer.getData("application/json")
    || e.dataTransfer.getData("text/plain")
    || e.dataTransfer.getData("text")
    || "";
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const tableName = data && typeof data === "object" ? String((data as any)?.table ?? "").trim() : "";
    const fieldName = data && typeof data === "object" ? String((data as any)?.name ?? "").trim() : "";
    const tableDotName = (tableName && fieldName) ? `${tableName}.${fieldName}` : "";
    const ref = String(
      (data as any)?.column?.ref
      ?? (data as any)?.ref
      ?? (tableDotName || undefined)
      ?? (data as any)?.column?.name
      ?? (data as any)?.name
      ?? raw
    ).trim();
    if (!ref) return null;

    const kind = data && typeof data === "object" ? String((data as any)?.kind ?? "").trim() : "";
    const fieldType = data && typeof data === "object" ? String((data as any)?.fieldType ?? "").trim() : "";
    const semanticType = data && typeof data === "object" ? String((data as any)?.semanticType ?? "").trim() : "";
    const kindAllowsFieldType = kind === "semantic-field" || kind === "db-field";

    return {
      kind: "field",
      field: {
        ref,
        fieldType: kindAllowsFieldType && (fieldType === "dimension" || fieldType === "measure" || fieldType === "time")
          ? (fieldType as any)
          : undefined,
        semanticType: kindAllowsFieldType && semanticType ? semanticType : undefined,
      },
    };
  } catch {
    const ref = String(raw).trim();
    return ref ? { kind: "field", field: { ref } } : null;
  }
}

export type SlicerMode = "list" | "dropdown" | "tile" | "dateRange" | "range" | "hierarchy" | "input";

export type SlicerScope = "report" | "page" | "visual";

export type SlicerState = {
  fieldRef?: string;
  fieldSemanticType?: string;
  sourceKind?: "field" | "parameter" | "fieldParameter";
  parameterId?: string;
  fieldParameterId?: string;
  mode?: SlicerMode;
  multiSelect?: boolean;
  selectedValues?: string[];
  syncGroup?: string;
  showSearch?: boolean;
  showSelectAll?: boolean;
  orientation?: "vertical" | "horizontal";
  headerVisible?: boolean;
  headerTitle?: string;
  valuesFontSize?: number;
  valuesBackgroundColor?: string;
  restrictToLeafNodes?: boolean;
  sortOrder?: "asc" | "desc";
  forceSelection?: boolean;
  dateOp?: "between" | "gte" | "lte";
  dateFrom?: string;
  dateTo?: string;
  dateMode?: "absolute" | "relative";
  relativeAmount?: number;
  relativeUnit?: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
  hierarchyLevels?: string[];
  hierarchyPath?: string[];
  textFilterOp?: "eq" | "contains" | "startswith" | "icontains" | "istartswith";
  textFilterValue?: string;
};

export type DateRelOverride = {
  dateMode?: "absolute" | "relative";
  relativeAmount?: number;
  relativeUnit?: "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";
};

export function isSemanticRef(field: string): boolean {
  const s = String(field ?? "").trim();
  if (!s) return false;
  return /^[\p{L}_][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)+$/u.test(s);
}

export type SlicerBaseFilterCtx = {
  fieldRef: string;
  sourceModel?: string;
  effectiveScope: SlicerScope;
  pageKey: string;
  effectiveFilterTargetChartId: string;
  ownerFilterGroup?: string;
};

export function buildScopedFilter(base: SlicerBaseFilterCtx, op: BiFilter["op"], values: Array<string | number>): BiFilter {
  const rawField = String(base.fieldRef ?? "").trim();
  const sourceModel = String(base.sourceModel ?? "").trim();
  const field = isSemanticRef(rawField)
    ? rawField
    : (sourceModel && rawField && !rawField.includes(".") ? `${sourceModel}.${rawField}` : rawField);
  return {
    field,
    op,
    values,
    logicGroup: base.ownerFilterGroup || undefined,
    scope: base.effectiveScope,
    pageKey: base.effectiveScope === "page" ? base.pageKey : undefined,
    sourceChartId: base.effectiveFilterTargetChartId,
  };
}
