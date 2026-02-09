"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import ComplexChart from "../../components/charts/ComplexChart";
import { ShimmerGlobe } from "../../components/ui";
import { cn } from "../../lib/utils";

type Props = {
  className?: string;
};

interface LiveEvent {
  event_id: string;
  event_name: string;
  user_id: string;
  timestamp: string;
  properties: any;
}

export default function PulseGlobe({ className }: Props) {
  const [ready, setReady] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const chartRef = useRef<any>(null);

  const hubs = useMemo(
    () => [
      { name: "Frankfurt", coord: [8.6821, 50.1109] as [number, number], value: 92 },
      { name: "London", coord: [-0.1276, 51.5072] as [number, number], value: 84 },
      { name: "New York", coord: [-74.006, 40.7128] as [number, number], value: 88 },
      { name: "São Paulo", coord: [-46.6333, -23.5505] as [number, number], value: 61 },
      { name: "Johannesburg", coord: [28.0473, -26.2041] as [number, number], value: 47 },
      { name: "Dubai", coord: [55.2708, 25.2048] as [number, number], value: 69 },
      { name: "Mumbai", coord: [72.8777, 19.076] as [number, number], value: 72 },
      { name: "Singapore", coord: [103.8198, 1.3521] as [number, number], value: 78 },
      { name: "Tokyo", coord: [139.6917, 35.6895] as [number, number], value: 86 },
      { name: "Sydney", coord: [151.2093, -33.8688] as [number, number], value: 54 },
    ],
    []
  );

  const server = useMemo(() => ({ name: "Core", coord: [37.6173, 55.7558] as [number, number] }), []);

  const buildOption = useMemo(() => {
    const landDots: Array<[number, number, number]> = [];
    const userDots: Array<[number, number, number]> = [];

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    for (const h of hubs) {
      const count = 18 + Math.floor(h.value * 0.35);
      for (let i = 0; i < count; i++) {
        const lon = h.coord[0] + rand(-6.5, 6.5);
        const lat = h.coord[1] + rand(-4.5, 4.5);
        userDots.push([lon, lat, rand(0.2, 1.0)]);
      }
    }

    const hubScatter = hubs.map((h) => ({
      name: h.name,
      value: [h.coord[0], h.coord[1], h.value],
    }));

    const serverScatter = [{ name: server.name, value: [server.coord[0], server.coord[1], 120] }];

    const linesToServer = hubs.map((h) => ({
      fromName: h.name,
      toName: server.name,
      coords: [h.coord, server.coord],
      value: h.value,
    }));

    const extraUserLines = userDots
      .slice(0, 60)
      .map((p) => ({ coords: [[p[0], p[1]] as [number, number], server.coord] }));

    const sortedLines = [...linesToServer].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const activeLines = sortedLines.slice(0, 8);
    const passiveLines = sortedLines.slice(8);

    return {
      backgroundColor: "rgba(0,0,0,0)",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(2, 6, 23, 0.72)",
        borderColor: "rgba(255,255,255,0.12)",
        extraCssText:
          "backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 12px; padding: 10px 12px;",
        textStyle: { color: "#e2e8f0" },
      },
      geo: {
        map: "world",
        roam: true,
        zoom: 1.1,
        silent: false,
        itemStyle: {
          areaColor: "transparent",
          borderColor: "#334155",
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            areaColor: "transparent",
            borderColor: "rgba(163, 230, 53, 0.35)",
            borderWidth: 1,
          },
        },
      },
      series: [
        {
          id: "land",
          name: "Land Density",
          type: "scatter",
          coordinateSystem: "geo",
          data: landDots,
          symbolSize: 1.8,
          itemStyle: {
            color: "rgba(148, 163, 184, 0.65)",
          },
          emphasis: { disabled: true },
          progressive: 1000,
          progressiveThreshold: 500,
          zlevel: 2,
        },
        {
          id: "devices",
          name: "Devices",
          type: "scatter",
          coordinateSystem: "geo",
          data: userDots,
          symbolSize: (v: any) => 1.4 + Math.min(2.8, (v?.[2] ?? 0.4) * 2.8),
          itemStyle: {
            color: "rgba(148, 163, 184, 0.50)",
          },
          emphasis: { disabled: true },
          progressive: 1000,
          progressiveThreshold: 500,
          zlevel: 3,
        },
        {
          id: "flow_active",
          name: "Flow (Active)",
          type: "lines",
          coordinateSystem: "geo",
          data: activeLines,
          polyline: false,
          effect: {
            show: true,
            period: 4.2,
            trailLength: 0.55,
            symbol: "circle",
            symbolSize: 2.4,
            color: "rgba(163, 230, 53, 0.95)",
          },
          lineStyle: {
            color: "rgba(163, 230, 53, 0.30)",
            width: 1,
            opacity: 0.55,
            shadowBlur: 5,
            shadowColor: "#a3e635",
            curveness: 0.2,
          },
          zlevel: 3,
        },
        {
          id: "flow_passive",
          name: "Flow (Passive)",
          type: "lines",
          coordinateSystem: "geo",
          data: [...passiveLines, ...extraUserLines],
          polyline: false,
          effect: {
            show: false,
          },
          lineStyle: {
            color: "rgba(163, 230, 53, 0.20)",
            width: 1,
            opacity: 0.35,
            shadowBlur: 0,
            curveness: 0.2,
          },
          zlevel: 3,
        },
        {
          id: "hubs",
          name: "Hubs",
          type: "effectScatter",
          coordinateSystem: "geo",
          data: hubScatter,
          rippleEffect: {
            period: 4,
            scale: 3.6,
            brushType: "stroke",
          },
          symbolSize: (v: any) => 4 + Math.sqrt(Math.max(1, v?.[2] ?? 1)) * 0.55,
          itemStyle: {
            color: "rgba(163, 230, 53, 0.95)",
            shadowBlur: 5,
            shadowColor: "#a3e635",
          },
          label: {
            show: false,
          },
          zlevel: 4,
        },
        {
          id: "core",
          name: "Core",
          type: "effectScatter",
          coordinateSystem: "geo",
          data: serverScatter,
          rippleEffect: {
            period: 4,
            scale: 4.8,
            brushType: "stroke",
          },
          symbolSize: 10,
          itemStyle: {
            color: "rgba(163, 230, 53, 1)",
            shadowBlur: 5,
            shadowColor: "#a3e635",
          },
          label: {
            show: true,
            formatter: "CORE",
            position: "right",
            color: "rgba(163, 230, 53, 0.95)",
            fontSize: 10,
          },
          zlevel: 6,
        },
      ],
      __internalLandDots: landDots,
    };
  }, [hubs, server]);

  // Trigger ripple effect at specific coordinates
  const triggerRipple = (lat: number, lon: number, eventName?: string) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    const rippleData = [{
      name: eventName || 'Event',
      value: [lon, lat, 100],
    }];

    // Add temporary ripple effect
    chart.setOption({
      series: [{
        id: 'live_ripple',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: rippleData,
        rippleEffect: {
          period: 2,
          scale: 5,
          brushType: 'stroke',
        },
        symbolSize: 8,
        itemStyle: {
          color: 'rgba(163, 230, 53, 1)',
          shadowBlur: 10,
          shadowColor: '#a3e635',
        },
        zlevel: 10,
      }],
    });

    // Remove ripple after animation
    setTimeout(() => {
      chart.setOption({
        series: [{ id: 'live_ripple', data: [] }],
      });
    }, 2000);
  };

  // Live Pulse: SSE connection for real-time events with mock fallback
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let mockInterval: NodeJS.Timeout | null = null;
    let sseConnected = false;

    const mockEventNames = [
      'page_view', 'button_click', 'form_submit', 'purchase', 
      'signup', 'login', 'search', 'video_play', 'download', 'share'
    ];

    const generateMockEvent = (): LiveEvent => {
      const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
      return {
        event_id: `mock_${Date.now()}_${Math.random()}`,
        event_name: mockEventNames[Math.floor(Math.random() * mockEventNames.length)],
        user_id: `user_${Math.floor(Math.random() * 10000)}`,
        timestamp: new Date().toISOString(),
        properties: {
          lat: randomHub.coord[1] + (Math.random() - 0.5) * 10,
          lon: randomHub.coord[0] + (Math.random() - 0.5) * 10,
        },
      };
    };

    const handleEvent = (event: LiveEvent) => {
      setLiveEvents((prev) => [event, ...prev.slice(0, 49)]);

      const lat = event.properties?.lat || event.properties?.latitude;
      const lon = event.properties?.lon || event.properties?.longitude;

      if (lat && lon) {
        triggerRipple(Number(lat), Number(lon), event.event_name);
      } else {
        const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
        triggerRipple(randomHub.coord[1], randomHub.coord[0], event.event_name);
      }
    };

    try {
      eventSource = new EventSource('/api/events/stream');

      eventSource.addEventListener('event', (e) => {
        try {
          sseConnected = true;
          const event: LiveEvent = JSON.parse(e.data);
          handleEvent(event);
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      });

      eventSource.addEventListener('ping', () => {
        sseConnected = true;
      });

      eventSource.onerror = () => {
        console.warn('SSE connection error, using mock events');
        sseConnected = false;
      };

      // Check if SSE connected after 2 seconds, if not use mock events
      setTimeout(() => {
        if (!sseConnected && !mockInterval) {
          console.log('SSE not available, starting mock event generator');
          mockInterval = setInterval(() => {
            const mockEvent = generateMockEvent();
            handleEvent(mockEvent);
          }, 2000 + Math.random() * 3000); // Random interval 2-5 seconds
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to establish SSE connection, using mock events:', err);
      // Start mock events immediately if SSE fails
      mockInterval = setInterval(() => {
        const mockEvent = generateMockEvent();
        handleEvent(mockEvent);
      }, 2000 + Math.random() * 3000);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (mockInterval) {
        clearInterval(mockInterval);
      }
    };
  }, [hubs]);

  const handleChartReady = async (chart: any, echarts: any) => {
    chartRef.current = chart;
    const landDots: Array<[number, number, number]> = [];

    const loadGeoJson = async () => {
      const sources = [
        "/maps/world.geo.json",
        "/api/geo/world",
        "https://geo.datav.aliyun.com/areas_v3/bound/World.json",
      ];

      let lastErr: unknown = null;
      for (const url of sources) {
        try {
          const res = await fetch(url, { cache: "force-cache" });
          if (!res.ok) throw new Error(`Failed to load geojson: ${url} (${res.status})`);
          return await res.json();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    };

    let geo: any;
    try {
      geo = await loadGeoJson();
    } catch {
      geo = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Fallback" },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-180, -90],
                  [180, -90],
                  [180, 90],
                  [-180, 90],
                  [-180, -90],
                ],
              ],
            },
          },
        ],
      };
    }

    echarts.registerMap("world", geo);

    const pushCoord = (lon: number, lat: number) => {
      if (Number.isFinite(lon) && Number.isFinite(lat)) landDots.push([lon, lat, 1]);
    };

    const walkRing = (ring: any[]) => {
      if (!Array.isArray(ring)) return;
      const step = Math.max(1, Math.floor(ring.length / 120));
      for (let i = 0; i < ring.length; i += step) {
        const p = ring[i];
        if (Array.isArray(p) && p.length >= 2) pushCoord(p[0], p[1]);
      }
    };

    for (const f of geo?.features ?? []) {
      const geom = f?.geometry;
      const coords = geom?.coordinates;
      if (!coords) continue;
      const t = geom?.type;

      if (t === "Polygon") {
        for (const ring of coords) walkRing(ring);
      } else if (t === "MultiPolygon") {
        for (const poly of coords) for (const ring of poly) walkRing(ring);
      }
    }

    const opt = { ...(buildOption as any) };
    const injected = opt?.__internalLandDots;
    if (Array.isArray(injected)) {
      injected.length = 0;
      for (const p of landDots.slice(0, 2200)) injected.push(p);
    }
    delete opt.__internalLandDots;

    chart.setOption(opt, { notMerge: true });
    setReady(true);
  };

  return (
    <div className={cn("relative w-full h-full", className)}>
      {!ready && <ShimmerGlobe />}
      <ComplexChart
        option={buildOption}
        className="w-full h-full"
        onReady={handleChartReady}
      />
    </div>
  );
}
