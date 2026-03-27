export type AnyRecord = Record<string, any>;

export function applyChartConfigToEChartsOption(option: AnyRecord, chartConfig: AnyRecord): AnyRecord {
  if (!chartConfig || typeof chartConfig !== "object") return option;

  const out: AnyRecord = deepClone(option);

  const general = chartConfig.general ?? {};
  if (typeof general.backgroundColor === "string") {
    out.backgroundColor = general.backgroundColor;
  }

  if (general.grid && typeof general.grid === "object") {
    out.grid = mergeObjects(normalizeToObject(out.grid), {
      left: general.grid.left,
      right: general.grid.right,
      top: general.grid.top,
      bottom: general.grid.bottom,
      containLabel: general.grid.containLabel,
    });
  }

  const titleText = typeof general.title === "string" ? general.title : "";
  const subtitleText = typeof general.subtitle === "string" ? general.subtitle : "";
  if (titleText || subtitleText) {
    out.title = mergeObjects(normalizeToObject(out.title), {
      show: true,
      text: titleText,
      subtext: subtitleText,
    });
  } else if (out.title && typeof out.title === "object") {
    out.title = mergeObjects(normalizeToObject(out.title), { show: false });
  }

  const legend = chartConfig.legend ?? {};
  if (legend && typeof legend === "object") {
    out.legend = mergeObjects(normalizeToObject(out.legend), {
      show: legend.show,
      orient: legend.orientation === "vertical" ? "vertical" : legend.orientation === "horizontal" ? "horizontal" : undefined,
      top: legend.position === "top" ? 0 : undefined,
      bottom: legend.position === "bottom" ? 0 : undefined,
      left: legend.position === "left" ? 0 : undefined,
      right: legend.position === "right" ? 0 : undefined,
      textStyle: mergeObjects(normalizeToObject(out.legend?.textStyle), {
        fontSize: legend.fontSize,
        color: legend.fontColor,
        fontWeight: legend.fontWeight,
      }),
    });
  }

  const tooltip = chartConfig.tooltip ?? {};
  if (tooltip && typeof tooltip === "object") {
    out.tooltip = mergeObjects(normalizeToObject(out.tooltip), {
      show: tooltip.show,
      trigger: tooltip.trigger,
      backgroundColor: tooltip.backgroundColor,
      borderColor: tooltip.borderColor,
      borderWidth: tooltip.borderWidth,
      borderRadius: tooltip.borderRadius,
      padding: tooltip.padding,
      axisPointer: tooltip.axisPointer,
      textStyle: tooltip.textStyle,
    });
  }

  const axes = chartConfig.axes ?? {};
  if (axes && typeof axes === "object") {
    if (axes.xAxis) out.xAxis = applyAxis(out.xAxis, axes.xAxis);
    if (axes.yAxis) out.yAxis = applyAxis(out.yAxis, axes.yAxis);
  }

  const advanced = chartConfig.advanced ?? {};
  if (advanced && typeof advanced === "object") {
    if (advanced.animation && typeof advanced.animation === "object") {
      if (typeof advanced.animation.enabled === "boolean") out.animation = advanced.animation.enabled;
      if (typeof advanced.animation.duration === "number") out.animationDuration = advanced.animation.duration;
      if (typeof advanced.animation.easing === "string") out.animationEasing = advanced.animation.easing;
    }

    if (advanced.dataZoom && typeof advanced.dataZoom === "object") {
      const enabled = advanced.dataZoom.enabled === true;
      if (enabled) {
        const type = advanced.dataZoom.type ?? "inside";
        const makeInside = type === "inside" || type === "both";
        const makeSlider = type === "slider" || type === "both";

        const dz: AnyRecord[] = [];
        if (makeInside) {
          dz.push({
            type: "inside",
            start: advanced.dataZoom.start,
            end: advanced.dataZoom.end,
            zoomOnMouseWheel: advanced.dataZoom.zoomOnMouseWheel,
            moveOnMouseMove: advanced.dataZoom.moveOnMouseMove,
          });
        }
        if (makeSlider) {
          dz.push({
            type: "slider",
            start: advanced.dataZoom.start,
            end: advanced.dataZoom.end,
            height: advanced.dataZoom.height,
            backgroundColor: advanced.dataZoom.backgroundColor,
            fillerColor: advanced.dataZoom.fillerColor,
            handleStyle: advanced.dataZoom.handleStyle,
          });
        }
        out.dataZoom = dz;
      } else if (typeof out.dataZoom !== "undefined") {
        out.dataZoom = [];
      }
    }

    if (advanced.toolbox && typeof advanced.toolbox === "object") {
      const enabled = advanced.toolbox.enabled === true;
      if (!enabled) {
        out.toolbox = { show: false };
      } else {
        const existingToolbox = (out.toolbox && typeof out.toolbox === "object" && !Array.isArray(out.toolbox)) ? { ...(out.toolbox as AnyRecord) } : {};
        // Sanitize existing feature values: ECharts expects objects, not booleans
        if (existingToolbox.feature && typeof existingToolbox.feature === "object") {
          const sanitized: AnyRecord = {};
          for (const [k, v] of Object.entries(existingToolbox.feature as AnyRecord)) {
            sanitized[k] = (v && typeof v === "object") ? v : {};
          }
          existingToolbox.feature = sanitized;
        }
        const rawFeatures = (advanced.toolbox.features && typeof advanced.toolbox.features === "object") ? advanced.toolbox.features : undefined;
        // Sanitize config features: convert boolean values to empty objects for ECharts
        let sanitizedFeatures: AnyRecord | undefined;
        if (rawFeatures) {
          sanitizedFeatures = {};
          for (const [k, v] of Object.entries(rawFeatures as AnyRecord)) {
            if (v === true) sanitizedFeatures[k] = {};
            else if (v && typeof v === "object") sanitizedFeatures[k] = v;
            // skip false values (disabled features)
          }
        }
        out.toolbox = mergeObjects(existingToolbox, {
          show: true,
          ...(sanitizedFeatures ? { feature: sanitizedFeatures } : {}),
          ...(advanced.toolbox.iconStyle ? { iconStyle: advanced.toolbox.iconStyle } : {}),
        });
      }
    }

    if (typeof advanced.progressive === "number") out.progressive = advanced.progressive;
    if (typeof advanced.progressiveThreshold === "number") out.progressiveThreshold = advanced.progressiveThreshold;
  }

  const seriesCfg = Array.isArray(chartConfig.series) ? chartConfig.series : [];
  if (seriesCfg.length > 0 && Array.isArray(out.series)) {
    out.series = out.series.map((s: AnyRecord, i: number) => {
      const name = String(s?.name ?? "");
      const match = seriesCfg.find((c: AnyRecord) => String(c?.name ?? "") === name) ?? seriesCfg[i];
      if (!match) return s;
      const next = { ...s };

      if (typeof match.type === "string") next.type = match.type;
      if (typeof match.smooth === "boolean") next.smooth = match.smooth;
      if (typeof match.lineWidth === "number" || typeof match.lineStyle === "string") {
        next.lineStyle = mergeObjects(normalizeToObject(next.lineStyle), {
          width: match.lineWidth,
          type: match.lineStyle,
        });
      }

      if (typeof match.color === "string") {
        next.itemStyle = mergeObjects(normalizeToObject(next.itemStyle), { color: match.color });
        next.lineStyle = mergeObjects(normalizeToObject(next.lineStyle), { color: match.color });
      }

      if (typeof match.showMarkers === "boolean") {
        next.showSymbol = match.showMarkers;
      }
      if (typeof match.markerSize === "number") {
        next.symbolSize = match.markerSize;
      }

      if (typeof match.stack === "string") next.stack = match.stack;

      if (match.dataLabels && typeof match.dataLabels === "object") {
        next.label = mergeObjects(normalizeToObject(next.label), {
          show: match.dataLabels.show,
          position: match.dataLabels.position,
          fontSize: match.dataLabels.fontSize,
          color: match.dataLabels.color,
          formatter: match.dataLabels.formatter,
        });
      }

      if (typeof match.areaOpacity === "number") {
        next.areaStyle = mergeObjects(normalizeToObject(next.areaStyle), { opacity: match.areaOpacity });
      }

      return next;
    });
  }

  try {
    applyCreativeConfigToOption(out, chartConfig.creative);
  } catch {}

  return out;
}

function applyCreativeConfigToOption(out: AnyRecord, creative: AnyRecord | undefined) {
  if (!creative || typeof creative !== "object") return;

  if (creative.glassmorphism && typeof creative.glassmorphism === "object" && creative.glassmorphism.enabled === true) {
    if (typeof creative.glassmorphism.tint === "string") {
      out.backgroundColor = creative.glassmorphism.tint;
    }
  }

  if (!Array.isArray(out.series)) return;

  const lineGlow = (creative.lineGlow && typeof creative.lineGlow === "object") ? creative.lineGlow : undefined;
  const areaGradient = (creative.areaGradient && typeof creative.areaGradient === "object") ? creative.areaGradient : undefined;
  const itemGlow = (creative.itemGlow && typeof creative.itemGlow === "object") ? creative.itemGlow : undefined;
  const pulseMarkers = (creative.pulseMarkers && typeof creative.pulseMarkers === "object") ? creative.pulseMarkers : undefined;

  const gradientSpec = areaGradient && areaGradient.enabled === true ? makeGradient(areaGradient) : undefined;

  out.series = out.series.map((s: AnyRecord) => {
    const next = { ...s };
    const type = String(next.type ?? "");

    if (lineGlow && lineGlow.enabled === true) {
      const lc = typeof lineGlow.color === "string" ? lineGlow.color : undefined;
      const blur = typeof lineGlow.intensity === "number" ? lineGlow.intensity : undefined;
      const offY = typeof lineGlow.spread === "number" ? lineGlow.spread : undefined;
      next.lineStyle = mergeObjects(normalizeToObject(next.lineStyle), {
        shadowColor: lc,
        shadowBlur: blur,
        shadowOffsetY: offY,
      });
    }

    if (gradientSpec) {
      if (type === "bar") {
        next.itemStyle = mergeObjects(normalizeToObject(next.itemStyle), {
          color: gradientSpec,
        });
      } else {
        next.areaStyle = mergeObjects(normalizeToObject(next.areaStyle), {
          opacity: clamp01(typeof areaGradient.opacity === "number" ? areaGradient.opacity : 0.3),
          color: gradientSpec,
        });
      }
    }

    if (itemGlow && itemGlow.enabled === true) {
      const gc = typeof itemGlow.color === "string" ? itemGlow.color : undefined;
      const blur = typeof itemGlow.intensity === "number" ? itemGlow.intensity : undefined;
      next.itemStyle = mergeObjects(normalizeToObject(next.itemStyle), {
        shadowColor: gc,
        shadowBlur: blur,
        shadowOffsetY: 0,
      });
      if (itemGlow.innerGlow === true) {
        next.emphasis = mergeObjects(normalizeToObject(next.emphasis), {
          itemStyle: mergeObjects(normalizeToObject(next.emphasis?.itemStyle), {
            shadowColor: gc,
            shadowBlur: typeof blur === "number" ? Math.max(0, Math.floor(blur * 1.4)) : blur,
            shadowOffsetY: 0,
          }),
        });
      }
    }

    if (pulseMarkers && pulseMarkers.enabled === true) {
      const size = typeof pulseMarkers.size === "number" ? pulseMarkers.size : undefined;
      next.showSymbol = true;
      if (typeof size === "number") next.symbolSize = size;
      const pc = typeof pulseMarkers.color === "string" ? pulseMarkers.color : undefined;
      next.itemStyle = mergeObjects(normalizeToObject(next.itemStyle), {
        borderColor: pc,
        borderWidth: 1,
      });
      next.emphasis = mergeObjects(normalizeToObject(next.emphasis), {
        scale: true,
        itemStyle: mergeObjects(normalizeToObject(next.emphasis?.itemStyle), {
          shadowColor: pc,
          shadowBlur: 18,
          shadowOffsetY: 0,
        }),
      });
    }

    return next;
  });
}

function makeGradient(areaGradient: AnyRecord): AnyRecord | undefined {
  const topColor = typeof areaGradient.topColor === "string" ? areaGradient.topColor : undefined;
  const bottomColor = typeof areaGradient.bottomColor === "string" ? areaGradient.bottomColor : undefined;
  if (!topColor || !bottomColor) return undefined;

  const dir = String(areaGradient.direction ?? "vertical");
  if (dir === "radial") {
    return {
      type: "radial",
      x: 0.5,
      y: 0.5,
      r: 0.9,
      colorStops: [
        { offset: 0, color: topColor },
        { offset: 1, color: bottomColor },
      ],
    };
  }

  return {
    type: "linear",
    x: 0,
    y: 0,
    x2: dir === "horizontal" ? 1 : 0,
    y2: dir === "horizontal" ? 0 : 1,
    colorStops: [
      { offset: 0, color: topColor },
      { offset: 1, color: bottomColor },
    ],
  };
}

// ---------------------------------------------------------------------------
// Creative → CSS container styles (used by ChartGlowWrapper)
// ---------------------------------------------------------------------------

export interface CreativeContainerStyles {
  /** Inline styles for the outermost wrapper div */
  wrapperStyle?: Record<string, string | number>;
  /** CSS background value for the radial-gradient overlay div */
  overlayGradient?: string;
  /** CSS box-shadow value for the glow/border overlay div */
  overlayBoxShadow?: string;
}

export function extractCreativeContainerStyles(
  creative: AnyRecord | undefined,
): CreativeContainerStyles | null {
  if (!creative || typeof creative !== "object") return null;

  const glass =
    creative.glassmorphism &&
    typeof creative.glassmorphism === "object" &&
    creative.glassmorphism.enabled === true
      ? creative.glassmorphism
      : undefined;

  const lineGlow =
    creative.lineGlow &&
    typeof creative.lineGlow === "object" &&
    creative.lineGlow.enabled === true
      ? creative.lineGlow
      : undefined;

  const itemGlow =
    creative.itemGlow &&
    typeof creative.itemGlow === "object" &&
    creative.itemGlow.enabled === true
      ? creative.itemGlow
      : undefined;

  // Nothing enabled → zero overhead
  if (!glass && !lineGlow && !itemGlow) return null;

  const result: CreativeContainerStyles = {};

  // --- wrapper inline styles (backdrop-filter, background tint) ---
  if (glass) {
    const blur = typeof glass.blur === "number" ? glass.blur : 0;
    const tint = typeof glass.tint === "string" ? glass.tint : undefined;
    const ws: Record<string, string | number> = {};
    if (blur > 0) ws.backdropFilter = `blur(${blur}px)`;
    if (tint && tint !== "transparent") ws.backgroundColor = tint;
    if (Object.keys(ws).length > 0) result.wrapperStyle = ws;
  }

  // --- overlay gradient (radial glow spots like UPlotTrendModule) ---
  const spots: string[] = [];
  if (lineGlow) {
    const c = typeof lineGlow.color === "string" ? lineGlow.color : "rgba(16,185,129,0.18)";
    spots.push(`radial-gradient(1200px 280px at 30% 10%, ${c}, transparent 60%)`);
  }
  if (itemGlow) {
    const c = typeof itemGlow.color === "string" ? itemGlow.color : "rgba(59,130,246,0.14)";
    spots.push(`radial-gradient(900px 240px at 70% 40%, ${c}, transparent 55%)`);
  }
  if (spots.length > 0) result.overlayGradient = spots.join(", ");

  // --- overlay box-shadow (inset border + outer glow) ---
  const shadows: string[] = [];
  if (glass) {
    const borderGlow =
      typeof glass.borderGlow === "string" ? glass.borderGlow : undefined;
    shadows.push("inset 0 0 0 1px rgba(255,255,255,0.06)");
    if (borderGlow) {
      shadows.push(`0 0 18px ${borderGlow}`);
      shadows.push(`0 0 28px ${borderGlow}`);
    }
  } else {
    // Even without glass, add subtle inset border when glow is active
    if (lineGlow || itemGlow) {
      shadows.push("inset 0 0 0 1px rgba(255,255,255,0.06)");
    }
    if (lineGlow) {
      const c = typeof lineGlow.color === "string" ? lineGlow.color : "rgba(16,185,129,0.12)";
      shadows.push(`0 0 18px ${c}`);
    }
    if (itemGlow) {
      const c = typeof itemGlow.color === "string" ? itemGlow.color : "rgba(59,130,246,0.08)";
      shadows.push(`0 0 28px ${c}`);
    }
  }
  if (shadows.length > 0) result.overlayBoxShadow = shadows.join(", ");

  // If nothing was produced, return null
  if (!result.wrapperStyle && !result.overlayGradient && !result.overlayBoxShadow) return null;

  return result;
}

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function applyAxis(current: any, axisCfg: AnyRecord): any {
  // ECharts axes can be arrays — apply config to first element and keep array form
  if (Array.isArray(current)) {
    if (current.length === 0) return [applyAxisSingle({}, axisCfg)];
    return current.map((item, i) => (i === 0 ? applyAxisSingle(item, axisCfg) : item));
  }
  return applyAxisSingle(current, axisCfg);
}

function applyAxisSingle(current: any, axisCfg: AnyRecord): any {
  const next = { ...normalizeToObject(current) };

  if (typeof axisCfg.show === "boolean") next.show = axisCfg.show;
  if (typeof axisCfg.label === "string") next.name = axisCfg.label;
  if (typeof axisCfg.type === "string") next.type = axisCfg.type;
  if (typeof axisCfg.position === "string") next.position = axisCfg.position;

  if (typeof axisCfg.min !== "undefined") next.min = axisCfg.min === "auto" ? undefined : axisCfg.min;
  if (typeof axisCfg.max !== "undefined") next.max = axisCfg.max === "auto" ? undefined : axisCfg.max;

  if (axisCfg.gridLines && typeof axisCfg.gridLines === "object") {
    next.splitLine = mergeObjects(normalizeToObject(next.splitLine), {
      show: axisCfg.gridLines.show,
      lineStyle: {
        color: axisCfg.gridLines.color,
        width: axisCfg.gridLines.width,
        type: axisCfg.gridLines.style,
        opacity: axisCfg.gridLines.opacity,
      },
    });
  }

  if (axisCfg.axisLine && typeof axisCfg.axisLine === "object") {
    next.axisLine = mergeObjects(normalizeToObject(next.axisLine), {
      show: axisCfg.axisLine.show,
      lineStyle: {
        color: axisCfg.axisLine.color,
        width: axisCfg.axisLine.width,
      },
    });
  }

  if (axisCfg.labels && typeof axisCfg.labels === "object") {
    next.axisLabel = mergeObjects(normalizeToObject(next.axisLabel), {
      show: axisCfg.labels.show,
      fontSize: axisCfg.labels.fontSize,
      color: axisCfg.labels.fontColor,
      fontWeight: axisCfg.labels.fontWeight,
      rotate: axisCfg.labels.rotation,
      padding: axisCfg.labels.padding,
    });
  }

  if (axisCfg.ticks && typeof axisCfg.ticks === "object") {
    next.axisTick = mergeObjects(normalizeToObject(next.axisTick), {
      show: axisCfg.ticks.show,
      interval: axisCfg.ticks.interval === "auto" ? undefined : axisCfg.ticks.interval,
      length: axisCfg.ticks.length,
      lineStyle: axisCfg.ticks.color ? { color: axisCfg.ticks.color } : undefined,
    });
  }

  if (axisCfg.splitArea && typeof axisCfg.splitArea === "object") {
    next.splitArea = mergeObjects(normalizeToObject(next.splitArea), {
      show: axisCfg.splitArea.show,
      areaStyle: { color: axisCfg.splitArea.colors },
    });
  }

  return next;
}

function normalizeToObject(v: any): AnyRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as AnyRecord;
}

function mergeObjects(a: AnyRecord, b: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...a };
  for (const k of Object.keys(b || {})) {
    const bv = (b as AnyRecord)[k];
    if (typeof bv === "undefined") continue;
    const av = out[k];
    if (isPlainObject(av) && isPlainObject(bv)) out[k] = mergeObjects(av, bv);
    else out[k] = bv;
  }
  return out;
}

function isPlainObject(x: any): x is AnyRecord {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function deepClone<T>(x: T): T {
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return x;
  }
}
