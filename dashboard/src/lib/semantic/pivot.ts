export type PivotMode = "auto" | "client" | "sql";

export type PivotSpec = {
  rowKeys: string[];
  colKey: string;
  valueKey: string;
};

export type PivotResult = {
  columns: string[];
  rows: unknown[][];
};

export function pivotClientSide(params: {
  data: Array<Record<string, unknown>>;
  spec: PivotSpec;
  rowLimit?: number;
}): PivotResult {
  const rowKeys = Array.isArray(params.spec.rowKeys) ? params.spec.rowKeys : [];
  const colKey = String(params.spec.colKey ?? "").trim();
  const valueKey = String(params.spec.valueKey ?? "").trim();
  if (!rowKeys.length || !colKey || !valueKey) {
    throw new Error("Invalid pivot spec");
  }

  const rowLimit = Math.max(1, Math.min(200_000, Number(params.rowLimit ?? 50_000)));

  const colVals: string[] = [];
  const colSet = new Set<string>();

  const rowMap = new Map<string, { rowKeyVals: string[]; values: Map<string, number> }>();

  let processed = 0;
  for (const r of params.data) {
    processed++;
    if (processed > rowLimit) break;

    const rowKeyVals = rowKeys.map((k) => String((r as any)?.[k] ?? ""));
    const rowId = rowKeyVals.join("\u0001");

    const c = String((r as any)?.[colKey] ?? "");
    if (!colSet.has(c)) {
      colSet.add(c);
      colVals.push(c);
    }

    const vRaw = (r as any)?.[valueKey];
    const v = Number(vRaw);
    const n = Number.isFinite(v) ? v : 0;

    const existing = rowMap.get(rowId);
    if (!existing) {
      const m = new Map<string, number>();
      m.set(c, n);
      rowMap.set(rowId, { rowKeyVals, values: m });
    } else {
      existing.values.set(c, (existing.values.get(c) ?? 0) + n);
    }
  }

  const outCols = [...rowKeys, ...colVals];
  const outRows: unknown[][] = [];
  for (const entry of rowMap.values()) {
    const row: unknown[] = [...entry.rowKeyVals];
    for (const c of colVals) {
      row.push(entry.values.get(c) ?? 0);
    }
    outRows.push(row);
  }

  return { columns: outCols, rows: outRows };
}

export function pickPivotMode(params: {
  mode?: PivotMode;
  rowCount?: number | null;
  threshold?: number;
}): PivotMode {
  const requested = params.mode;
  if (requested === "client" || requested === "sql") return requested;
  const threshold = Math.max(1, Math.min(500_000, Number(params.threshold ?? 50_000)));
  const rc = params.rowCount;
  if (typeof rc === "number" && Number.isFinite(rc)) {
    return rc < threshold ? "client" : "sql";
  }
  return "client";
}
