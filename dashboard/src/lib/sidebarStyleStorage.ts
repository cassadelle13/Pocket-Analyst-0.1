export const SIDEBAR_STYLE_CHANGED_EVENT = "sidebar-style:changed";

const SIDEBAR_DARKEN_KEY = "pa.sidebar.darken";

export function getSidebarDarken(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_DARKEN_KEY);
    if (raw === null) return 0;
    const v = Number(raw);
    return Math.max(0, Math.min(1, v));
  } catch {
    return 0;
  }
}

export function setSidebarDarken(darken: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.min(1, darken));
  try {
    window.localStorage.setItem(SIDEBAR_DARKEN_KEY, String(clamped));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(SIDEBAR_STYLE_CHANGED_EVENT));
}
