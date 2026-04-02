export type VisualInteractionMode = "filter" | "highlight" | "none";
export type VisualInteractionsMap = Record<string, Record<string, VisualInteractionMode>>;

const FILTER_TARGET_TOKENS = ["line", "scatter", "map"];

function normalizeChartType(input: string): string {
  return String(input ?? "").trim().toLowerCase();
}

function defaultModeByTargetChartType(targetChartType: string): VisualInteractionMode {
  const normalized = normalizeChartType(targetChartType);
  return FILTER_TARGET_TOKENS.some((token) => normalized.includes(token)) ? "filter" : "highlight";
}

function normalizeModeForTarget(targetChartType: string, requested: VisualInteractionMode): VisualInteractionMode {
  const normalized = normalizeChartType(targetChartType);
  const filterOnly = FILTER_TARGET_TOKENS.some((token) => normalized.includes(token));
  if (filterOnly && requested === "highlight") return "filter";
  return requested;
}

export function resolveVisualInteractionMode(input: {
  sourceChartId: string;
  targetChartId: string;
  targetChartType: string;
  map?: VisualInteractionsMap | null;
}): VisualInteractionMode {
  const sourceChartId = String(input.sourceChartId ?? "").trim();
  const targetChartId = String(input.targetChartId ?? "").trim();
  if (!sourceChartId || !targetChartId || sourceChartId === targetChartId) return "none";

  const map = input.map && typeof input.map === "object" ? input.map : null;
  const explicit = map
    ? String((map as any)?.[sourceChartId]?.[targetChartId] ?? "").trim().toLowerCase()
    : "";
  if (explicit === "filter" || explicit === "highlight" || explicit === "none") {
    return normalizeModeForTarget(input.targetChartType, explicit as VisualInteractionMode);
  }
  return defaultModeByTargetChartType(input.targetChartType);
}
