"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {Eye, EyeOff, Library, Plus, Search} from "lucide-react";
import {chartLibrary} from "@/config/library";
import {ChartPreview} from "./ChartPreview";
import type { VizType } from "@/types/viz";

type LibraryChart = {
  name: string;
  page: string;
  description: string;
  vizType: VizType;
  status: "available" | "coming_soon";
};

function LibraryPreview({ chart }: { chart: LibraryChart }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });

    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: Math.max(0, Math.floor(rect.width)), h: Math.max(0, Math.floor(rect.height)) });

    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full h-full">
      {size.w > 0 && size.h > 0 && (
        <ChartPreview
          chartName={chart.name}
          chartType={chart.name}
          width={size.w}
          height={size.h}
          chartId={`library:${chart.name}`}
          chartData={{ kind: "library-preview" }}
          isEditMode={false}
        />
      )}
    </div>
  );
}

export function ChartLibrarySlideIn({onClose}: {onClose: () => void}) {
  const [query, setQuery] = useState("");
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const acc: Record<string, boolean> = {};
    for (const cat of chartLibrary) acc[cat.category] = true;
    return acc;
  });

  const hiddenChartNames = useMemo(
    () =>
      new Set<string>([]),
    []
  );

  const visibleLibrary = useMemo(() => {
    return chartLibrary
      .map((cat) => ({
        ...cat,
        charts: cat.charts.filter((c) => !hiddenChartNames.has(String(c?.name ?? ""))),
      }))
      .filter((cat) => cat.charts.length > 0);
  }, [hiddenChartNames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleLibrary;
    return visibleLibrary
      .map((cat) => ({
        ...cat,
        charts: cat.charts.filter((c) => {
          const name = c.name.toLowerCase();
          const desc = c.description.toLowerCase();
          return name.includes(q) || desc.includes(q) || cat.category.toLowerCase().includes(q);
        }),
      }))
      .filter((cat) => cat.charts.length > 0);
  }, [query, visibleLibrary]);

  const toggleCategory = (category: string) => {
    setExpanded((prev) => ({...prev, [category]: !prev[category]}));
  };

  const handleCardKeyDown = (
    e: React.KeyboardEvent,
    chart: LibraryChart
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      addChart(chart);
    }
  };

  const addChart = (chart: LibraryChart) => {
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:add-chart", {
          detail: {
            chart: {
              ...chart,
              __forceVizType: chart.vizType,
            },
          },
        })
      );
    } catch {}
    onClose();
  };

  return (
    <div className="h-full w-[340px] sm:w-[380px] p-4">
      <div className="h-full bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/40 rounded-3xl overflow-hidden flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Library className="w-4 h-4 text-blue-400" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Component Library</div>
                <div className="text-xs text-slate-400 truncate">Drag or tap to add to canvas</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewEnabled((v) => !v)}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title={previewEnabled ? "Hide previews" : "Show previews"}
              >
                {previewEnabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Закрыть"
              >
                <Plus className="w-5 h-5" style={{transform: "rotate(45deg)"}} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search components..."
              className="w-full bg-transparent outline-none text-sm text-slate-200 placeholder:text-slate-500"
            />
          </div>
        </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 custom-scrollbar">
        {filtered.map((category) => (
          <div key={category.category} className="overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleCategory(category.category)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCategory(category.category);
                }
              }}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-white/5 transition-colors rounded-xl cursor-pointer"
            >
              <span className="text-sm font-medium text-slate-200">{category.category}</span>
              <span className="text-xs text-slate-400">{expanded[category.category] ? "−" : "+"}</span>
            </div>

            {expanded[category.category] && (
              <div className="px-2 pb-2">
                {previewEnabled ? (
                  <div className="space-y-4">
                    {category.charts.map((chart) => (
                      <div
                        key={chart.name}
                        role="button"
                        tabIndex={0}
                        draggable
                        onClick={() => addChart(chart)}
                        onKeyDown={(e) => handleCardKeyDown(e, chart)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/json", JSON.stringify(chart));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="w-full text-left rounded-2xl border border-white/10 bg-white/5 overflow-hidden hover:bg-white/10 hover:border-white/20 transition-colors cursor-grab active:cursor-grabbing"
                        title={chart.name}
                      >
                        <div className="px-4 pt-4 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-white truncate">{chart.name}</div>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                chart.status === "available"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {chart.status === "available" ? "Available" : "Coming soon"}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-snug mt-1">{chart.description}</div>
                        </div>
                        <div className="px-3 pb-3">
                          <div className="w-full">
                            <div className="w-full rounded-xl overflow-hidden border border-white/10 bg-slate-950/40">
                              <div className="w-full aspect-[16/9] pointer-events-none select-none">
                                <div className="w-full h-full">
                                  <LibraryPreview chart={chart} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="h-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {category.charts.map((chart) => (
                      <li key={chart.name}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable
                          onClick={() => addChart(chart)}
                          onKeyDown={(e) => handleCardKeyDown(e, chart)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/json", JSON.stringify(chart));
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="w-full px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2">
                            <div className="text-xs font-semibold text-white">{chart.name}</div>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                chart.status === "available"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {chart.status === "available" ? "Available" : "Coming soon"}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-snug">{chart.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-4 text-sm text-slate-400">Ничего не найдено</div>
        )}
      </div>
      </div>
    </div>
  );
}
