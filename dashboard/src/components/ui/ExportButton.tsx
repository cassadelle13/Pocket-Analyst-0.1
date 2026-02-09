"use client";

import { useState } from "react";
import { Button } from "@tremor/react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

interface SimpleExportButtonProps {
  data: any[] | { data: any[]; filename?: string };
  title?: string;
  disabled?: boolean;
}

export function SimpleExportButton({ data, title = "Export", disabled = false }: SimpleExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const dataArray = Array.isArray(data) ? data : (data as any).data;
  const filename = Array.isArray(data) ? undefined : (data as any).filename;

  const exportToCSV = () => {
    if (!dataArray || dataArray.length === 0) return;

    setIsExporting(true);
    try {
      const headers = Object.keys(dataArray[0]);
      const csvRows = [
        headers.join(","),
        ...dataArray.map((row: any) =>
          headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
        ),
      ];
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename || "export"}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToJSON = () => {
    if (!dataArray || dataArray.length === 0) return;

    setIsExporting(true);
    try {
      const jsonContent = JSON.stringify(dataArray, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename || "export"}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative group">
      <Button
        size="sm"
        variant="secondary"
        icon={ArrowDownTrayIcon}
        disabled={disabled || isExporting || !dataArray || dataArray.length === 0}
        className="relative"
      >
        {isExporting ? "Exporting..." : title}
      </Button>

      {!disabled && dataArray && dataArray.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-10 hidden group-hover:block">
          <div className="bg-slate-800 border border-slate-700 shadow-xl rounded-lg p-2 min-w-40">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={exportToCSV}
                disabled={isExporting}
                className="w-full text-left px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 rounded disabled:opacity-50"
              >
                Export as CSV
              </button>
              <button
                type="button"
                onClick={exportToJSON}
                disabled={isExporting}
                className="w-full text-left px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 rounded disabled:opacity-50"
              >
                Export as JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
