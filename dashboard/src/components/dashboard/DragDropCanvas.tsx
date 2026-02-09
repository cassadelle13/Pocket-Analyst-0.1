"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { PlusIcon, TrashIcon, ZoomInIcon, ZoomOutIcon, Maximize2Icon, MoreVertical, Download, Upload, Sparkles, Settings2 } from "lucide-react";
import { ChartPreview } from "./ChartPreview";
import { ChartWindow } from "./ChartWindow";

interface CanvasNode {
  id: string;
  type: string;
  name: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: any;
}

export function DragDropCanvas() {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isResizingNode, setIsResizingNode] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [openNodeMenu, setOpenNodeMenu] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist nodes (layout, titles) per dashboard
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dashboard:nodes');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CanvasNode>[];
        if (Array.isArray(parsed)) {
          const normalized: CanvasNode[] = parsed.map((n, i) => ({
            id: String(n.id ?? `node-${Date.now()}-${i}`),
            type: String(n.type ?? n?.name ?? 'Unknown'),
            name: String(n.name ?? 'Untitled'),
            title: String((n as any).title ?? n.name ?? 'Untitled'),
            position: n.position ?? { x: 0, y: 0 },
            size: n.size ?? { width: 560, height: 360 },
            data: n.data ?? {},
          }));
          setNodes(normalized);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('dashboard:nodes', JSON.stringify(nodes));
    } catch {}
  }, [nodes]);

  // Привязка позиции к сетке (шаг 20px)
  const snapToGrid = useCallback((value: number) => {
    const gridSize = 20;
    return Math.round(value / gridSize) * gridSize;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const chartData = e.dataTransfer.getData("application/json");
    console.log('[Canvas] Drop event, data:', chartData);
    
    if (!chartData) {
      console.warn('[Canvas] No chart data in drop event');
      return;
    }

    try {
      const chart = JSON.parse(chartData);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = snapToGrid((e.clientX - rect.left - pan.x) / zoom);
      const y = snapToGrid((e.clientY - rect.top - pan.y) / zoom);

      // Определяем размер в зависимости от типа модуля
      const getNodeSize = () => {
        if (chart.name.includes("Total Users") || chart.name.includes("New Users") || 
            chart.name.includes("Active Users") || chart.name.includes("Churned Users") ||
            chart.name.includes("Total Events") || chart.name.includes("Active Now") ||
            chart.name.includes("Response Time") || chart.name.includes("Uptime")) {
          return { width: 280, height: 140 }; // Компактные метрики
        }
        return { width: 560, height: 360 }; // Стандартный размер для графиков
      };

      // Шаблоны Dashboard: добавляем набор окон с предраскладкой
      const templateNames = [
        "Executive overview",
        "Sales performance",
        "Product analytics",
        "Marketing funnel",
        "Operations monitoring",
        "Financial overview",
      ];

      if (templateNames.includes(chart.name)) {
        const baseX = x;
        const baseY = y;
        const createdAt = Date.now();

        const templateNodes: CanvasNode[] = [
          {
            id: `node-${createdAt}-kpi1`,
            type: "KPI card",
            name: "KPI card",
            title: "KPI 1",
            position: { x: baseX, y: baseY },
            size: { width: 280, height: 140 },
            data: { preset: "kpi" },
          },
          {
            id: `node-${createdAt}-kpi2`,
            type: "KPI with delta",
            name: "KPI with delta",
            title: "KPI Δ",
            position: { x: baseX + 300, y: baseY },
            size: { width: 280, height: 140 },
            data: { preset: "kpi-delta" },
          },
          {
            id: `node-${createdAt}-line`,
            type: "Line (time series)",
            name: "Line (time series)",
            title: "Line (time series)",
            position: { x: baseX, y: baseY + 160 },
            size: { width: 560, height: 360 },
            data: { preset: "trend" },
          },
          {
            id: `node-${createdAt}-bar`,
            type: "Bar (categorical)",
            name: "Bar (categorical)",
            title: "Bar (categorical)",
            position: { x: baseX + 580, y: baseY + 160 },
            size: { width: 560, height: 360 },
            data: { preset: "bar" },
          },
        ];

        console.log('[Canvas] Adding template nodes for', chart.name, templateNodes);
        setNodes((prev) => [...prev, ...templateNodes]);
      } else {
        const newNode: CanvasNode = {
          id: `node-${Date.now()}`,
          type: chart.name,
          name: chart.name,
          title: chart.name,
          position: { x, y },
          size: getNodeSize(),
          data: chart,
        };

        console.log('[Canvas] Adding node:', newNode);
        setNodes((prev) => [...prev, newNode]);
      }
    } catch (error) {
      console.error('[Canvas] Error parsing chart data:', error);
    }
  }, [zoom, pan]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Всегда предотвращаем прокрутку страницы при любом колесике на canvas
    e.preventDefault();
    e.stopPropagation();
    
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.min(Math.max(prev * delta, 0.1), 3));
    }
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Left mouse button on empty canvas for panning
    if (e.button === 0 && e.target === canvasRef.current) {
      e.preventDefault();
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleResizeStart = useCallback((e: React.MouseEvent, nodeId: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizingNode(true);
    setDraggedNode(nodeId);
    setResizeHandle(handle);
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: node.size.width,
        height: node.size.height,
      });
    }
  }, [nodes]);

  const handleResize = useCallback((e: React.MouseEvent) => {
    if (!isResizingNode || !draggedNode || !resizeHandle) return;

    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;

    setNodes(prev => prev.map(node => {
      if (node.id !== draggedNode) return node;

      let newWidth = node.size.width;
      let newHeight = node.size.height;

      switch (resizeHandle) {
        case 'se': // bottom-right
          newWidth = snapToGrid(resizeStart.width + deltaX);
          newHeight = snapToGrid(resizeStart.height + deltaY);
          break;
        case 'sw': // bottom-left
          newWidth = snapToGrid(resizeStart.width - deltaX);
          newHeight = snapToGrid(resizeStart.height + deltaY);
          break;
        case 'ne': // top-right
          newWidth = snapToGrid(resizeStart.width + deltaX);
          newHeight = snapToGrid(resizeStart.height - deltaY);
          break;
        case 'nw': // top-left
          newWidth = snapToGrid(resizeStart.width - deltaX);
          newHeight = snapToGrid(resizeStart.height - deltaY);
          break;
        case 'e': // right
          newWidth = snapToGrid(resizeStart.width + deltaX);
          break;
        case 'w': // left
          newWidth = snapToGrid(resizeStart.width - deltaX);
          break;
        case 's': // bottom
          newHeight = snapToGrid(resizeStart.height + deltaY);
          break;
        case 'n': // top
          newHeight = snapToGrid(resizeStart.height - deltaY);
          break;
      }

      // Минимальный размер
      newWidth = Math.max(newWidth, 280);
      newHeight = Math.max(newHeight, 160);

      return {
        ...node,
        size: { width: newWidth, height: newHeight }
      };
    }));
  }, [isResizingNode, draggedNode, resizeHandle, resizeStart]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      e.preventDefault();
      setPan({
        x: snapToGrid(e.clientX - dragStart.x),
        y: snapToGrid(e.clientY - dragStart.y),
      });
    } else if (isResizingNode) {
      e.preventDefault();
      handleResize(e);
    } else if (isDraggingNode && draggedNode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = snapToGrid((e.clientX - rect.left - pan.x) / zoom);
      const y = snapToGrid((e.clientY - rect.top - pan.y) / zoom);

      setNodes((prev) =>
        prev.map((node) =>
          node.id === draggedNode
            ? { ...node, position: { x: x - 100, y: y - 25 } }
            : node
        )
      );
    }
  }, [isPanning, isResizingNode, isDraggingNode, draggedNode, dragStart, pan, zoom, handleResize]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDraggingNode(false);
    setIsResizingNode(false);
    setDraggedNode(null);
    setResizeHandle(null);
  }, []);

  const handleNodeAction = (nodeId: string, action: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    console.log(`[Canvas] ${action} clicked for ${node.name}`);

    switch (action) {
      case 'export':
        // Экспорт конфигурации модуля
        const nodeData = {
          id: node.id,
          type: node.type,
          name: node.name,
          position: node.position,
          size: node.size,
          data: node.data,
        };
        const dataStr = JSON.stringify(nodeData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${node.name.replace(/\s+/g, '_').toLowerCase()}_config.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        break;
        
      case 'import':
        // Импорт конфигурации модуля
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const imported = JSON.parse(e.target?.result as string);
                console.log(`[Canvas] Imported config for ${node.name}:`, imported);
                // Здесь можно обновить конфигурацию модуля
              } catch (error) {
                console.error('[Canvas] Error importing config:', error);
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
        break;
        
      case 'ai-config':
        // AI настройка модуля
        console.log(`[Canvas] Opening AI config for ${node.name}`);
        // Здесь можно открыть модальное окно с AI настройками
        break;
        
      case 'manual-config':
        // Ручная настройка модуля
        console.log(`[Canvas] Opening manual config for ${node.name}`);
        // Здесь можно открыть модальное окно с ручными настройками
        break;
    }
    
    setOpenNodeMenu(null);
  };

  // Глобальный обработчик для предотвращения zoom на всем сайте
  const handleGlobalWheel = useCallback((e: WheelEvent) => {
    if ((e.ctrlKey || e.metaKey) && canvasRef.current && 
        !canvasRef.current.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [handleGlobalWheel]);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setIsDraggingNode(true);
    setDraggedNode(nodeId);
  }, []);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      style={{
        cursor: isPanning ? 'grabbing' : 'grab'
      }}
    >
      {/* Canvas */}
      <div
        ref={canvasRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onWheel={handleWheel}
        className="absolute inset-0 bg-slate-950"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(100, 116, 139, 0.15) 1px, transparent 1px)`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        
        {/* Nodes */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {nodes.map((node) => (
            <div
              key={node.id}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              className="absolute cursor-move"
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`,
              }}
            >
              <div className="relative group">
                {/* Control buttons */}
                <div className="absolute -top-2 -right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* More options button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenNodeMenu(openNodeMenu === node.id ? null : node.id);
                    }}
                    className="p-2 rounded-full bg-slate-700/80 hover:bg-slate-600 text-white shadow-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                    className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white shadow-lg transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Dropdown menu */}
                {openNodeMenu === node.id && (
                  <div className="absolute -top-2 right-12 mt-1 w-48 bg-slate-900/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl z-50">
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeAction(node.id, 'export');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Экспорт
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeAction(node.id, 'import');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        Загрузка
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeAction(node.id, 'ai-config');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        AI настройка
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNodeAction(node.id, 'manual-config');
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Settings2 className="w-3 h-3" />
                        Ручная настройка
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Chart content with dynamic size and resize areas */}
                <div 
                  style={{ width: `${node.size.width}px`, height: `${node.size.height}px` }}
                  className="relative group"
                >
                  <ChartWindow
                    id={node.id}
                    title={node.title}
                    onRename={(newTitle) => setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, title: newTitle } : n))}
                  >
                    <div className="w-full h-full">
                      <ChartPreview
                        chartName={node.name}
                        chartType={node.type}
                        width={node.size.width}
                        height={Math.max(120, node.size.height - 56)}
                        chartId={node.id}
                      />
                    </div>
                  </ChartWindow>

                  {/* Discrete resize handles to keep header/content interactive */}
                  {/* Corners */}
                  <div className="absolute w-3 h-3 top-0 left-0 cursor-nw-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'nw')} />
                  <div className="absolute w-3 h-3 top-0 right-0 cursor-ne-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'ne')} />
                  <div className="absolute w-3 h-3 bottom-0 left-0 cursor-sw-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'sw')} />
                  <div className="absolute w-3 h-3 bottom-0 right-0 cursor-se-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'se')} />
                  {/* Edges */}
                  <div className="absolute h-2 left-3 right-3 top-0 cursor-n-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'n')} />
                  <div className="absolute h-2 left-3 right-3 bottom-0 cursor-s-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 's')} />
                  <div className="absolute w-2 top-3 bottom-3 left-0 cursor-w-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'w')} />
                  <div className="absolute w-2 top-3 bottom-3 right-0 cursor-e-resize" onMouseDown={(e) => handleResizeStart(e, node.id, 'e')} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state - outside canvas */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/20 mb-4">
              <PlusIcon className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Drag charts here</h3>
            <p className="text-slate-400">Drag and drop charts from the library to get started</p>
          </div>
        </div>
      )}

      {/* Zoom Controls - outside canvas */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg bg-slate-800/90 border border-white/20 hover:bg-slate-700 transition-colors"
          title="Zoom In (Ctrl + Scroll)"
        >
          <ZoomInIcon className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg bg-slate-800/90 border border-white/20 hover:bg-slate-700 transition-colors"
          title="Zoom Out (Ctrl + Scroll)"
        >
          <ZoomOutIcon className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-2 rounded-lg bg-slate-800/90 border border-white/20 hover:bg-slate-700 transition-colors"
          title="Reset Zoom"
        >
          <Maximize2Icon className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
