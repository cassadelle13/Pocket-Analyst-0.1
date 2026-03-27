"use client";

import { useEffect, useState } from "react";
import {
  getGlobalBackground,
  getGlobalBackgroundAnimation,
  getGlobalBackgroundBlurEnabled,
  getGlobalBackgroundDarken,
  GLOBAL_BACKGROUND_CHANGED_EVENT,
} from "../../lib/globalBackgroundStorage";
import { loadBackgroundMedia } from "../../lib/backgroundMediaStorage";

export function GlobalBackgroundLayer() {
  const [bg, setBg] = useState<string>("");
  const [blurEnabled, setBlurEnabled] = useState<boolean>(true);
  const [darken, setDarken] = useState<number>(0.35);
  const [animMeta, setAnimMeta] = useState<{ id: string; mime: string } | null>(null);
  const [animUrl, setAnimUrl] = useState<string>("");

  useEffect(() => {
    setBg(getGlobalBackground());
    setBlurEnabled(getGlobalBackgroundBlurEnabled());
    setDarken(getGlobalBackgroundDarken());
    setAnimMeta(getGlobalBackgroundAnimation());
    const handler = () => {
      setBg(getGlobalBackground());
      setBlurEnabled(getGlobalBackgroundBlurEnabled());
      setDarken(getGlobalBackgroundDarken());
      setAnimMeta(getGlobalBackgroundAnimation());
    };
    window.addEventListener(GLOBAL_BACKGROUND_CHANGED_EVENT, handler);
    return () => window.removeEventListener(GLOBAL_BACKGROUND_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!animMeta?.id) {
        setAnimUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return "";
        });
        return;
      }
      try {
        const rec = await loadBackgroundMedia(animMeta.id);
        if (cancelled) return;
        if (!rec?.blob) return;
        const nextUrl = URL.createObjectURL(rec.blob);
        setAnimUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      } catch {
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [animMeta?.id]);

  if (!bg && !animUrl) return null;

  const filter = blurEnabled ? "blur(18px)" : "none";
  const isVideo = !!animUrl && (animMeta?.mime?.startsWith("video/") ?? false);

  return (
    <div className="absolute inset-0 pointer-events-none -z-10">
      {animUrl ? (
        isVideo ? (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={animUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{ filter, transform: "translateZ(0)" }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="absolute inset-0 w-full h-full object-cover"
            src={animUrl}
            alt="Global background animation"
            draggable={false}
            style={{ filter, transform: "translateZ(0)" }}
          />
        )
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${bg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: 1,
            transform: "translateZ(0)",
            filter,
          }}
        />
      )}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(2, 6, 23, ${darken})` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/30 to-slate-950/45" />
    </div>
  );
}
