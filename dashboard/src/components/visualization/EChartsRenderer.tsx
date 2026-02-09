"use client";

import { useEffect, useRef, useState } from "react";
import type { EChartsConfig, ActivityDataPoint } from "../../types/visualization";

// Dynamic import to avoid SSR issues
const loadECharts = async () => {
  const echarts = await import("echarts");
  return echarts;
};

const DARK_THEME: EChartsConfig["theme"] = {
  backgroundColor: "rgba(0,0,0,0)",
  gridColor: "rgba(34,197,94,0.1)",
  textColor: "rgba(229,231,235,0.9)",
  primaryColor: "#10b981", // Lime-400 with glow
  secondaryColor: "#3b82f6", // Blue-400
  glowColor: "rgba(16,185,129,0.6)",
};

interface EChartsRendererProps {
  data: ActivityDataPoint[];
  width?: number;
  height?: number;
  useWebGL?: boolean;
  onDataPointClick?: (point: ActivityDataPoint) => void;
}

export function EChartsRenderer({
  data,
  width = 800,
  height = 400,
  useWebGL = true,
  onDataPointClick,
}: EChartsRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let echarts: any;
    let chart: any;

    const initChart = async () => {
      try {
        echarts = await loadECharts();
        
        if (!containerRef.current) return;

        // Initialize chart with WebGL support
        chart = echarts.init(containerRef.current, null, {
          renderer: useWebGL ? "canvas" : "svg",
          devicePixelRatio: window.devicePixelRatio,
        });

        // Configure dark theme with glow effects
        const option = {
          backgroundColor: DARK_THEME.backgroundColor,
          grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
            borderColor: DARK_THEME.gridColor,
            borderWidth: 1,
          },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: data.map(d => d.bucket),
            axisLine: {
              lineStyle: {
                color: DARK_THEME.gridColor,
              },
            },
            axisLabel: {
              color: DARK_THEME.textColor,
              fontSize: 11,
            },
          },
          yAxis: [
            {
              type: "value",
              position: "left",
              axisLine: {
                lineStyle: {
                  color: DARK_THEME.gridColor,
                },
              },
              axisLabel: {
                color: DARK_THEME.textColor,
                fontSize: 11,
              },
              splitLine: {
                lineStyle: {
                  color: DARK_THEME.gridColor,
                },
              },
            },
            {
              type: "value",
              position: "right",
              axisLine: {
                lineStyle: {
                  color: DARK_THEME.gridColor,
                },
              },
              axisLabel: {
                color: DARK_THEME.textColor,
                fontSize: 11,
              },
            },
          ],
          series: [
            {
              name: "Events",
              type: "line",
              data: data.map(d => d.events),
              smooth: true,
              symbol: "none",
              lineStyle: {
                color: DARK_THEME.primaryColor,
                width: 2,
                shadowColor: DARK_THEME.glowColor,
                shadowBlur: 10,
                shadowOffsetY: 0,
              },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(16,185,129,0.3)" },
                    { offset: 1, color: "rgba(16,185,129,0.05)" },
                  ],
                },
              },
              progressive: 1000, // Incremental rendering for large datasets
              animation: true,
              animationDuration: 1500,
              animationEasing: "cubicOut",
            },
            {
              name: "Users",
              type: useWebGL ? "lineGL" : "line",
              data: data.map(d => d.users),
              smooth: true,
              symbol: "none",
              lineStyle: {
                color: DARK_THEME.secondaryColor,
                width: 2,
                shadowColor: "rgba(59,130,246,0.6)",
                shadowBlur: 8,
                shadowOffsetY: 0,
              },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(59,130,246,0.3)" },
                    { offset: 1, color: "rgba(59,130,246,0.05)" },
                  ],
                },
              },
              progressive: 1000,
              animation: true,
              animationDuration: 1500,
              animationEasing: "cubicOut",
            },
          ],
          tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(0,0,0,0.8)",
            borderColor: DARK_THEME.primaryColor,
            borderWidth: 1,
            textStyle: {
              color: DARK_THEME.textColor,
            },
            formatter: (params: any[]) => {
              const time = params[0].axisValue;
              return `
                <div style="padding: 8px;">
                  <div style="color: ${DARK_THEME.textColor}; margin-bottom: 4px;">${time}</div>
                  ${params.map(p => `
                    <div style="display: flex; align-items: center; margin: 2px 0;">
                      <span style="display: inline-block; width: 10px; height: 2px; background: ${p.color}; margin-right: 8px;"></span>
                      <span style="color: ${DARK_THEME.textColor};">${p.seriesName}: ${p.value.toLocaleString()}</span>
                    </div>
                  `).join('')}
                </div>
              `;
            },
          },
          animation: true,
          animationDuration: 1500,
          animationEasing: "cubicOut",
        };

        chart.setOption(option);

        // Handle click events for drill-down
        chart.on("click", (params: any) => {
          const point = data[params.dataIndex];
          if (point && onDataPointClick) {
            onDataPointClick(point);
          }
        });

        chartRef.current = chart;
        setIsReady(true);

        // Handle resize
        const handleResize = () => {
          chart?.resize();
        };
        window.addEventListener("resize", handleResize);

        return () => {
          window.removeEventListener("resize", handleResize);
          chart?.dispose();
        };
      } catch (error) {
        console.error("Failed to initialize ECharts:", error);
      }
    };

    initChart();

    return () => {
      if (chartRef.current) {
        chartRef.current.dispose();
      }
    };
  }, [data, useWebGL, onDataPointClick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        opacity: isReady ? 1 : 0,
        transition: "opacity 0.3s ease-in-out",
      }}
    />
  );
}
