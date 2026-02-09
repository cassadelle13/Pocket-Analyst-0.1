"use client";

import { useState } from "react";
import type { ClassifiedColumn } from "../../lib/schema-intelligence";
import { X } from "lucide-react";

interface DropZoneProps {
  label: string;
  field: ClassifiedColumn | null;
  onDrop: (column: ClassifiedColumn) => void;
  onRemove: () => void;
  acceptTypes?: string[];
  multiple?: boolean;
}

export function DropZone({ 
  label, 
  field, 
  onDrop, 
  onRemove,
  acceptTypes = [],
  multiple = false
}: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      
      if (acceptTypes.length > 0 && !acceptTypes.includes(data.sourceType)) {
        return;
      }

      onDrop(data.column);
    } catch (err) {
      console.error("Failed to parse dropped data:", err);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative min-h-[80px] rounded-lg border-2 border-dashed p-4
        transition-all duration-200
        ${isDragOver 
          ? "border-blue-500 bg-blue-500/10" 
          : field 
            ? "border-slate-600 bg-slate-800/50"
            : "border-slate-700 bg-slate-900/50"
        }
      `}
    >
      <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
        {label}
      </div>

      {field ? (
        <div className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2 border border-slate-600">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {field.name}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {field.table}
            </div>
          </div>
          <button
            onClick={onRemove}
            className="ml-2 p-1 hover:bg-slate-700 rounded transition-colors"
            aria-label="Remove field"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ) : (
        <div className="text-center py-4 text-slate-500 text-sm">
          {isDragOver ? "Drop here" : "Drag field here"}
        </div>
      )}
    </div>
  );
}

interface MultiDropZoneProps {
  label: string;
  fields: ClassifiedColumn[];
  onAdd: (column: ClassifiedColumn) => void;
  onRemove: (index: number) => void;
  acceptTypes?: string[];
  maxFields?: number;
}

export function MultiDropZone({ 
  label, 
  fields, 
  onAdd, 
  onRemove,
  acceptTypes = [],
  maxFields = 5
}: MultiDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (fields.length >= maxFields) {
      return;
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      
      if (acceptTypes.length > 0 && !acceptTypes.includes(data.sourceType)) {
        return;
      }

      onAdd(data.column);
    } catch (err) {
      console.error("Failed to parse dropped data:", err);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative min-h-[80px] rounded-lg border-2 border-dashed p-4
        transition-all duration-200
        ${isDragOver 
          ? "border-blue-500 bg-blue-500/10" 
          : fields.length > 0
            ? "border-slate-600 bg-slate-800/50"
            : "border-slate-700 bg-slate-900/50"
        }
      `}
    >
      <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
        {label}
      </div>

      {fields.length > 0 ? (
        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div 
              key={`${field.table}.${field.name}.${idx}`}
              className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2 border border-slate-600"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {field.name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {field.table}
                </div>
              </div>
              <button
                onClick={() => onRemove(idx)}
                className="ml-2 p-1 hover:bg-slate-700 rounded transition-colors"
                aria-label="Remove field"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          ))}
          {fields.length < maxFields && (
            <div className="text-center py-2 text-slate-500 text-xs">
              {isDragOver ? "Drop to add" : `Add up to ${maxFields - fields.length} more`}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-slate-500 text-sm">
          {isDragOver ? "Drop here" : "Drag fields here"}
        </div>
      )}
    </div>
  );
}
