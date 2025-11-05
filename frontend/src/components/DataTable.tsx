import { useEffect, useRef, useState } from 'react';
import type { MessageRow, Timezone } from '../lib/types';

interface DataTableProps {
  rows: MessageRow[];
  selectedRowId: number | null;
  timezone: Timezone;
  onRowSelect: (rowId: number) => void;
}

const ROW_HEIGHT = 32;
const VISIBLE_ROWS = 20;

export function DataTable({ rows, selectedRowId, timezone, onRowSelect }: DataTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Scroll to selected row
  useEffect(() => {
    if (selectedRowId !== null && containerRef.current) {
      const index = rows.findIndex((r) => r.row_id === selectedRowId);
      if (index >= 0) {
        const targetScroll = index * ROW_HEIGHT - ROW_HEIGHT * 5;
        containerRef.current.scrollTop = Math.max(0, targetScroll);
      }
    }
  }, [selectedRowId, rows]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // Virtual scrolling calculations
  const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
  const endIndex = Math.min(rows.length, startIndex + VISIBLE_ROWS + 5);
  const visibleRows = rows.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div className="data-table-container">
      <div className="table-header">
        <div className="table-cell" style={{ width: '180px' }}>
          Time
        </div>
        <div className="table-cell" style={{ width: '80px' }}>
          Dir
        </div>
        <div className="table-cell" style={{ width: '60px' }}>
          S
        </div>
        <div className="table-cell" style={{ width: '60px' }}>
          F
        </div>
        <div className="table-cell" style={{ width: '80px' }}>
          CEID
        </div>
        <div className="table-cell" style={{ width: '80px' }}>
          VID
        </div>
        <div className="table-cell" style={{ width: '80px' }}>
          RPTID
        </div>
        <div className="table-cell" style={{ width: '100px' }}>
          Sysbytes
        </div>
        <div className="table-cell" style={{ width: '60px' }}>
          Wbit
        </div>
      </div>

      <div
        ref={containerRef}
        className="table-body"
        style={{ height: VISIBLE_ROWS * ROW_HEIGHT, overflowY: 'auto' }}
        onScroll={handleScroll}
      >
        <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleRows.map((row) => (
              <div
                key={row.row_id}
                className={`table-row ${row.row_id === selectedRowId ? 'selected' : ''}`}
                style={{ height: ROW_HEIGHT }}
                onClick={() => onRowSelect(row.row_id)}
              >
                <div className="table-cell" style={{ width: '180px' }}>
                  {formatTime(row.ts_ns, timezone)}
                </div>
                <div className="table-cell" style={{ width: '80px' }}>
                  {row.dir === 1 ? 'H→E' : 'E→H'}
                </div>
                <div className="table-cell" style={{ width: '60px' }}>
                  {row.s}
                </div>
                <div className="table-cell" style={{ width: '60px' }}>
                  {row.f}
                </div>
                <div className="table-cell" style={{ width: '80px' }}>
                  {row.ceid || '-'}
                </div>
                <div className="table-cell" style={{ width: '80px' }}>
                  {row.vid || '-'}
                </div>
                <div className="table-cell" style={{ width: '80px' }}>
                  {row.rptid || '-'}
                </div>
                <div className="table-cell" style={{ width: '100px' }}>
                  {row.sysbytes}
                </div>
                <div className="table-cell" style={{ width: '60px' }}>
                  {row.wbit}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="table-footer">
        Showing {rows.length.toLocaleString()} messages
      </div>
    </div>
  );
}

function formatTime(ns: bigint, timezone: Timezone): string {
  const date = new Date(Number(ns) / 1_000_000);
  return date.toLocaleString('en-US', {
    timeZone: timezone === 'Asia/Jakarta' ? 'Asia/Jakarta' : 'UTC',
    hour12: false,
  });
}

