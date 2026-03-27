"use client";

import { useMemo, useState } from "react";
import { Card, Title, Text, Select, SelectItem, Button } from "@tremor/react";
import { CalendarDays, Users } from "lucide-react";
import type { RetentionCell } from "../../types/api";

type RetentionMatrixProps = {
  data?: RetentionCell[];
  loading?: boolean;
  days?: number;
  onDaysChange?: (days: number) => void;
};

const periods = [7, 14, 30, 60, 90] as const;

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function retentionCellStyle(rate: number) {
  const a = clamp01(rate);
  return {
    backgroundColor: `rgba(163, 230, 53, ${a})`,
    color: a >= 0.35 ? "rgba(2, 6, 23, 0.95)" : "rgba(226, 232, 240, 0.86)",
  };
}

function SkeletonMatrix() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`skeleton-row-${i}`} className="flex items-center gap-2">
          <div className="w-24 h-8 bg-slate-800 rounded animate-pulse" />
          {Array.from({ length: 7 }).map((_, j) => (
            <div key={`skeleton-cell-${i}-${j}`} className="flex-1 h-8 bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function RetentionMatrix({ data = [], loading, days = 30, onDaysChange }: RetentionMatrixProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<number>(days);

  const matrix = useMemo(() => {
    const cohorts = Array.from(new Set(data.map((d) => d.cohort))).sort();
    const maxDay = Math.max(...data.map((d) => d.day), 0);
    const rows = cohorts.map((cohort) => {
      const row: { cohort: string; cells: (RetentionCell | null)[] } = { cohort, cells: [] };
      for (let d = 0; d <= maxDay; d++) {
        const cell = data.find((c) => c.cohort === cohort && c.day === d);
        row.cells.push(cell ?? null);
      }
      return row;
    });
    return { rows, maxDay };
  }, [data]);

  const handlePeriodChange = (newDays: number) => {
    setSelectedPeriod(newDays);
    onDaysChange?.(newDays);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 shadow-xl">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-lime-400/20 rounded-lg">
              <Users className="w-5 h-5 text-lime-400" />
            </div>
            <div>
              <Title className="text-white">Retention Matrix</Title>
              <Text className="text-slate-400 text-sm mt-1">Cohort Pivot (N‑day)</Text>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(selectedPeriod)} onValueChange={(v) => handlePeriodChange(Number(v))}>
              {periods.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {p} days
                </SelectItem>
              ))}
            </Select>
            <Button size="sm" variant="secondary" icon={CalendarDays}>
              Export
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs">
          <span className="text-slate-400">Retention rate:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-lime-500 rounded" />
            <span className="text-slate-300">80%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-lime-600 rounded" />
            <span className="text-slate-300">60%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-lime-700 rounded" />
            <span className="text-slate-300">40%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-lime-800 rounded" />
            <span className="text-slate-300">20%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-lime-900 rounded" />
            <span className="text-slate-300">10%+</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-slate-800 rounded" />
            <span className="text-slate-400">&lt;10%</span>
          </div>
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonMatrix />
          ) : matrix.rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No cohort pivot data available
            </div>
          ) : (
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-24 text-xs text-slate-400 font-medium">Cohort</div>
                {Array.from({ length: matrix.maxDay + 1 }, (_, i) => (
                  <div key={`header-day-${i}`} className="flex-1 text-xs text-slate-400 font-medium text-center">
                    Day {i}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              <div className="space-y-2">
                {matrix.rows.map((row) => (
                  <div key={row.cohort} className="flex items-center gap-2">
                    <div className="w-24 text-xs text-slate-300 font-medium truncate">
                      {row.cohort}
                    </div>
                    {row.cells.map((cell, i) => (
                      <div
                        key={`${row.cohort}-cell-${i}`}
                        className="flex-1 h-8 rounded flex items-center justify-center text-xs font-semibold transition-all hover:scale-105"
                        style={cell ? retentionCellStyle(cell.retentionRate) : undefined}
                        title={
                          cell
                            ? `${Math.round(clamp01(cell.retentionRate) * 100)}% • ${cell.users} users`
                            : "No data"
                        }
                      >
                        {cell ? `${Math.round(clamp01(cell.retentionRate) * 100)}%` : ""}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        {!loading && matrix.rows.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <Text className="text-slate-400 text-xs">Total Cohorts</Text>
                <Title className="text-white text-lg mt-1">{matrix.rows.length}</Title>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <Text className="text-slate-400 text-xs">Avg Retention (Day {selectedPeriod})</Text>
                <Title className="text-white text-lg mt-1">
                  {Math.round(
                    (matrix.rows.reduce((sum, row) => {
                      const cell = row.cells[selectedPeriod];
                      return sum + (cell ? cell.retentionRate : 0);
                    }, 0) /
                      matrix.rows.filter((row) => row.cells[selectedPeriod]).length) *
                      100
                  )}%
                </Title>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <Text className="text-slate-400 text-xs">Best Cohort</Text>
                <Title className="text-white text-lg mt-1">
                  {matrix.rows.reduce((best, row) => {
                    const cell = row.cells[selectedPeriod];
                    if (!cell) return best;
                    const bestCell = best.cells[selectedPeriod];
                    if (!bestCell || cell.retentionRate > bestCell.retentionRate) return row;
                    return best;
                  }, matrix.rows[0])?.cohort ?? "—"}
                </Title>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
