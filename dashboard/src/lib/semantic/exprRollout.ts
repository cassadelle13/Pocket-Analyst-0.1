export type ExprEngineRolloutMode = "off" | "on";

export function getExprEngineRolloutMode(): ExprEngineRolloutMode {
  const raw = String(process.env.NEXT_PUBLIC_EXPR_ENGINE ?? "off").trim().toLowerCase();
  return raw === "on" ? "on" : "off";
}
