export const GLOBAL_BACKGROUND_STORAGE_KEY = "pa:global-background";
export const GLOBAL_BACKGROUND_BLUR_KEY = "pa:global-background:blur";
export const GLOBAL_BACKGROUND_ANIM_ID_KEY = "pa:global-background:anim:id";
export const GLOBAL_BACKGROUND_ANIM_MIME_KEY = "pa:global-background:anim:mime";
export const GLOBAL_BACKGROUND_DARKEN_KEY = "pa:global-background:darken";
export const GLOBAL_BACKGROUND_CHANGED_EVENT = "global-background:changed";

export const getGlobalBackground = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(GLOBAL_BACKGROUND_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const getGlobalBackgroundAnimation = (): { id: string; mime: string } | null => {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(GLOBAL_BACKGROUND_ANIM_ID_KEY) ?? "";
    const mime = window.localStorage.getItem(GLOBAL_BACKGROUND_ANIM_MIME_KEY) ?? "";
    if (!id) return null;
    return { id, mime };
  } catch {
    return null;
  }
};

export const getGlobalBackgroundBlurEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(GLOBAL_BACKGROUND_BLUR_KEY);
    if (raw == null) return true;
    return raw === "1";
  } catch {
    return true;
  }
};

export const getGlobalBackgroundDarken = (): number => {
  if (typeof window === "undefined") return 0.35;
  try {
    const raw = window.localStorage.getItem(GLOBAL_BACKGROUND_DARKEN_KEY);
    if (raw == null) return 0.35;
    const v = Number(raw);
    if (Number.isNaN(v)) return 0.35;
    return Math.min(0.9, Math.max(0, v / 100));
  } catch {
    return 0.35;
  }
};

const emitChanged = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(GLOBAL_BACKGROUND_CHANGED_EVENT));
  } catch {}
};

export const setGlobalBackground = (dataUrl: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOBAL_BACKGROUND_STORAGE_KEY, dataUrl);
    emitChanged();
  } catch {}
};

export const setGlobalBackgroundAnimation = (id: string, mime: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOBAL_BACKGROUND_ANIM_ID_KEY, id);
    window.localStorage.setItem(GLOBAL_BACKGROUND_ANIM_MIME_KEY, mime);
    emitChanged();
  } catch {}
};

export const setGlobalBackgroundBlurEnabled = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOBAL_BACKGROUND_BLUR_KEY, enabled ? "1" : "0");
    emitChanged();
  } catch {}
};

export const setGlobalBackgroundDarken = (value01: number) => {
  if (typeof window === "undefined") return;
  try {
    const v = Math.min(0.9, Math.max(0, value01));
    window.localStorage.setItem(GLOBAL_BACKGROUND_DARKEN_KEY, String(Math.round(v * 100)));
    emitChanged();
  } catch {}
};

export const clearGlobalBackground = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GLOBAL_BACKGROUND_STORAGE_KEY);
    emitChanged();
  } catch {}
};

export const clearGlobalBackgroundAnimation = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GLOBAL_BACKGROUND_ANIM_ID_KEY);
    window.localStorage.removeItem(GLOBAL_BACKGROUND_ANIM_MIME_KEY);
    emitChanged();
  } catch {}
};

export const compressImageFileToJpegDataUrl = (file: File, maxW: number, maxH: number, quality: number) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const src = String(reader.result ?? "");
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / img.width, maxH / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.fillStyle = "#020617";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
};
