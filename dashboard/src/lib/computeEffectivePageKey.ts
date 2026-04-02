export type PageScopeMode = "dashboard" | "tab";

export function computeEffectivePageKey(pageScopeMode: PageScopeMode, activeTabId?: string | null): string {
  if (pageScopeMode === "tab") {
    const tabId = String(activeTabId ?? "").trim();
    return tabId || "tab:unknown";
  }
  return "dashboard";
}
