"use client";

import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableHead, TableRow, TableCell } from "@tremor/react";

type Props<T> = {
  items: T[];
  renderHeader: React.ReactNode;
  renderRow: (item: T) => React.ReactNode;
  estimateRowHeight?: number;
  height: number;
  colSpan: number;
  className?: string;
  headerClassName?: string;
};

export function VirtualizedTable<T>({
  items,
  renderHeader,
  renderRow,
  estimateRowHeight = 44,
  height,
  colSpan,
  className,
  headerClassName,
}: Props<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const topPad = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const bottomPad = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div ref={parentRef} className={className} style={{ height, overflowY: "auto" }}>
      <Table>
        <TableHead className={headerClassName}>{renderHeader}</TableHead>
        <TableBody>
          {topPad > 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} style={{ height: topPad, padding: 0 }} />
            </TableRow>
          )}

          {virtualItems.map((vi) => {
            const item = items[vi.index];
            return <React.Fragment key={vi.key}>{renderRow(item)}</React.Fragment>;
          })}

          {bottomPad > 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} style={{ height: bottomPad, padding: 0 }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
