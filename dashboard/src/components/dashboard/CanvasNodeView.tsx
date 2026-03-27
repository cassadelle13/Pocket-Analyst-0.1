"use client";

import React, { memo, useCallback } from "react";
import { ChartPreview } from "./ChartPreview";
import { ChartWindow } from "./ChartWindow";

interface CanvasNodeViewProps {
  id: string;
  type: string;
  name: string;
  title: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  data: any;
  isActive: boolean;
  isEditMode: boolean;
  activeNodeId: string | null;
  onRename: (nodeId: string, newTitle: string) => void;
  onDelete: (nodeId: string) => void;
  onActivate: (nodeId: string) => void;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onResizeStart: (e: React.MouseEvent, nodeId: string, handle: string) => void;
  onWheelCapture: (e: React.WheelEvent, nodeId: string) => void;
  onCellEdit: (nodeId: string, sourceChartId: string, col: number, rowIdx: number, value: string) => void;
}

const CanvasNodeView = memo(function CanvasNodeView({
  id,
  type,
  name,
  title,
  positionX,
  positionY,
  width,
  height,
  data,
  isActive,
  isEditMode,
  onRename,
  onDelete,
  onActivate,
  onMouseDown,
  onResizeStart,
  onWheelCapture,
  onCellEdit,
}: CanvasNodeViewProps) {
  const chartHeight = Math.max(120, height - 56);

  const handleRename = useCallback((newTitle: string) => {
    onRename(id, newTitle);
  }, [id, onRename]);

  const handleDelete = useCallback(() => {
    onDelete(id);
  }, [id, onDelete]);

  const handleHeaderClick = useCallback(() => {
    onActivate(id);
  }, [id, onActivate]);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    onMouseDown(e, id);
  }, [id, onMouseDown]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    onWheelCapture(e, id);
  }, [id, onWheelCapture]);

  const handleCellEdit = useCallback((col: number, rowIdx: number, value: string) => {
    const sourceChartId = data?.__sourceChartId;
    if (!sourceChartId) return;
    onCellEdit(id, sourceChartId, col, rowIdx, value);
  }, [id, data, onCellEdit]);

  return (
    <div
      data-canvas-node="true"
      data-node-id={id}
      className="absolute cursor-move"
      style={{
        left: `${positionX}px`,
        top: `${positionY}px`,
      }}
      onWheel={handleWheel}
    >
      <div className="relative group">
        <div
          style={{ width: `${width}px`, height: `${height}px` }}
          className="relative group"
        >
          <ChartWindow
            id={id}
            title={title}
            onRename={handleRename}
            onDelete={handleDelete}
            isActive={isActive}
            onHeaderClick={handleHeaderClick}
            onHeaderMouseDown={handleHeaderMouseDown}
            chartData={data}
            chartName={name}
            chartKind={type}
            isEditMode={isEditMode}
          >
            <div className="w-full h-full">
              <ChartPreview
                chartName={name}
                chartType={type}
                width={width}
                height={chartHeight}
                chartId={id}
                chartData={data}
                isEditMode={isEditMode}
                onCellEdit={handleCellEdit}
              />
            </div>
          </ChartWindow>

          {/* Discrete resize handles to keep header/content interactive */}
          {/* Corners */}
          <div data-node-resize-handle="true" className="absolute w-3 h-3 top-0 left-0 cursor-nw-resize" onMouseDown={(e) => onResizeStart(e, id, 'nw')} />
          <div data-node-resize-handle="true" className="absolute w-3 h-3 top-0 right-0 cursor-ne-resize" onMouseDown={(e) => onResizeStart(e, id, 'ne')} />
          <div data-node-resize-handle="true" className="absolute w-3 h-3 bottom-0 left-0 cursor-sw-resize" onMouseDown={(e) => onResizeStart(e, id, 'sw')} />
          <div data-node-resize-handle="true" className="absolute w-3 h-3 bottom-0 right-0 cursor-se-resize" onMouseDown={(e) => onResizeStart(e, id, 'se')} />
          {/* Edges */}
          <div data-node-resize-handle="true" className="absolute h-2 left-3 right-3 top-0 cursor-n-resize" onMouseDown={(e) => onResizeStart(e, id, 'n')} />
          <div data-node-resize-handle="true" className="absolute h-2 left-3 right-3 bottom-0 cursor-s-resize" onMouseDown={(e) => onResizeStart(e, id, 's')} />
          <div data-node-resize-handle="true" className="absolute w-2 top-3 bottom-3 left-0 cursor-w-resize" onMouseDown={(e) => onResizeStart(e, id, 'w')} />
          <div data-node-resize-handle="true" className="absolute w-2 top-3 bottom-3 right-0 cursor-e-resize" onMouseDown={(e) => onResizeStart(e, id, 'e')} />
        </div>
      </div>
    </div>
  );
});

export default CanvasNodeView;
