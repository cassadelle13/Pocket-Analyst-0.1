"use client";

import { useState } from "react";
import type { ClassifiedColumn } from "../../lib/schema-intelligence";
import { Database, Hash, Calendar } from "lucide-react";

interface FieldListProps {
  dimensions: ClassifiedColumn[];
  measures: ClassifiedColumn[];
  timeFields: ClassifiedColumn[];
}

export function FieldList({ dimensions, measures, timeFields }: FieldListProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const handleDragStart = (e: React.DragEvent, column: ClassifiedColumn, sourceType: string) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/json", JSON.stringify({ column, sourceType }));
  };

  const filterFields = (fields: ClassifiedColumn[]) => {
    if (!searchTerm) return fields;
    const term = searchTerm.toLowerCase();
    return fields.filter(f => 
      f.name.toLowerCase().includes(term) || 
      f.table.toLowerCase().includes(term)
    );
  };

  const filteredDimensions = filterFields(dimensions);
  const filteredMeasures = filterFields(measures);
  const filteredTimeFields = filterFields(timeFields);

  return (
    <div className="w-80 bg-slate-900 border-r border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-3">Fields</h2>
        <input
          type="text"
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredTimeFields.length > 0 && (
          <FieldSection
            title="Time Fields"
            icon={<Calendar className="w-4 h-4" />}
            fields={filteredTimeFields}
            color="text-purple-400"
            bgColor="bg-purple-500/10"
            borderColor="border-purple-500/30"
            onDragStart={(e, col) => handleDragStart(e, col, "timeField")}
          />
        )}

        {filteredDimensions.length > 0 && (
          <FieldSection
            title="Dimensions"
            icon={<Database className="w-4 h-4" />}
            fields={filteredDimensions}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
            borderColor="border-blue-500/30"
            onDragStart={(e, col) => handleDragStart(e, col, "dimension")}
          />
        )}

        {filteredMeasures.length > 0 && (
          <FieldSection
            title="Measures"
            icon={<Hash className="w-4 h-4" />}
            fields={filteredMeasures}
            color="text-green-400"
            bgColor="bg-green-500/10"
            borderColor="border-green-500/30"
            onDragStart={(e, col) => handleDragStart(e, col, "measure")}
          />
        )}

        {filteredDimensions.length === 0 && 
         filteredMeasures.length === 0 && 
         filteredTimeFields.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            No fields found
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldSectionProps {
  title: string;
  icon: React.ReactNode;
  fields: ClassifiedColumn[];
  color: string;
  bgColor: string;
  borderColor: string;
  onDragStart: (e: React.DragEvent, column: ClassifiedColumn) => void;
}

function FieldSection({ 
  title, 
  icon, 
  fields, 
  color, 
  bgColor, 
  borderColor,
  onDragStart 
}: FieldSectionProps) {
  return (
    <div>
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-slate-500">({fields.length})</span>
      </div>
      <div className="space-y-1">
        {fields.map((field, idx) => (
          <div
            key={`${field.table}.${field.name}.${idx}`}
            draggable
            onDragStart={(e) => onDragStart(e, field)}
            className={`
              px-3 py-2 rounded-lg border cursor-move
              ${bgColor} ${borderColor}
              hover:bg-opacity-20 transition-colors
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {field.name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {field.table}
                </div>
              </div>
              <div className="text-xs text-slate-500 ml-2 font-mono">
                {field.type.split('(')[0]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
