import { useEffect, useRef, useState } from 'react';
import type { MessageRow, Timezone, HighlightExpr } from '../lib/types';

interface PlotCanvasProps {
  rows: MessageRow[];
  width: number;
  height: number;
  timezone: Timezone;
  selectedRowId: number | null;
  highlight?: HighlightExpr;
  onRowSelect: (rowId: number) => void;
  onTimeRangeChange?: (fromNs: number, toNs: number) => void;
}

// Sequence diagram layout constants
const MESSAGE_SPACING = 60; // Base vertical spacing between messages
const MARGIN = { top: 40, right: 40, bottom: 20, left: 120 };
const LIFELINE_HOST_X = 0.25; // Host lifeline at 25% of plot width
const LIFELINE_EQUIP_X = 0.75; // Equipment lifeline at 75% of plot width
const ARROW_HEAD_SIZE = 8;

export function PlotCanvas({
  rows,
  width,
  height,
  timezone,
  selectedRowId,
  highlight,
  onRowSelect,
  onTimeRangeChange,
}: PlotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);
  const [verticalZoom, setVerticalZoom] = useState(1.0); // Zoom factor for vertical spacing
  const [scrollTop, setScrollTop] = useState(0);
  
  // Brush selection state
  const [brushFirstClick, setBrushFirstClick] = useState<{
    ts_ns: bigint;
    y: number;
  } | null>(null);

  // Calculate total canvas height based on message count and zoom
  const spacing = MESSAGE_SPACING * verticalZoom;
  const totalHeight = MARGIN.top + rows.length * spacing + MARGIN.bottom;

  // Escape key handler to cancel brush selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && brushFirstClick) {
        setBrushFirstClick(null);
        setTooltip(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [brushFirstClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas height to total content height
    canvas.height = totalHeight;

    // Clear canvas
    ctx.clearRect(0, 0, width, totalHeight);

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, totalHeight);

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const hostX = MARGIN.left + plotWidth * LIFELINE_HOST_X;
    const equipX = MARGIN.left + plotWidth * LIFELINE_EQUIP_X;

    // Color palette for S values
    const sColors: Record<number, string> = {
      1: '#4285f4', // Blue
      2: '#34a853', // Green
      6: '#fbbc04', // Yellow
      7: '#ea4335', // Red
    };

    // Draw lifelines (vertical dashed lines)
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    // Host lifeline
    ctx.beginPath();
    ctx.moveTo(hostX, MARGIN.top - 20);
    ctx.lineTo(hostX, totalHeight - MARGIN.bottom);
    ctx.stroke();
    
    // Equipment lifeline
    ctx.beginPath();
    ctx.moveTo(equipX, MARGIN.top - 20);
    ctx.lineTo(equipX, totalHeight - MARGIN.bottom);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset dash

    // Draw lifeline labels
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Host', hostX, MARGIN.top - 25);
    ctx.fillText('Equipment', equipX, MARGIN.top - 25);

    // Draw messages as horizontal arrows
    rows.forEach((row, index) => {
      const y = MARGIN.top + index * spacing;
      
      // Determine arrow direction
      const isHostToEquip = row.dir === 1;
      const startX = isHostToEquip ? hostX : equipX;
      const endX = isHostToEquip ? equipX : hostX;

      // Color by S value
      const color = sColors[row.s] || '#9e9e9e';
      const isSelected = row.row_id === selectedRowId;
      
      // Check if this row should be highlighted
      const isHighlighted = highlight ? (
        (row.ceid > 0 && highlight.ceid.includes(row.ceid)) ||
        highlight.sxfy.some(p => p.s === row.s && p.f === row.f)
      ) : false;
      
      // Apply highlight visual effects
      if (isHighlighted) {
        // Draw background rectangle
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)'; // Gold background
        ctx.fillRect(startX - 10, y - 15, Math.abs(endX - startX) + 20, 30);
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
      }
      
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isSelected ? 3 : (isHighlighted ? 3 : 2);
      ctx.globalAlpha = isSelected ? 1.0 : 0.8;

      // Draw arrow line
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      // Draw arrow head
      const headAngle = isHostToEquip ? 0 : Math.PI;
      const tipX = endX;
      const tipY = y;
      
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - ARROW_HEAD_SIZE * Math.cos(headAngle - Math.PI / 6),
        tipY - ARROW_HEAD_SIZE * Math.sin(headAngle - Math.PI / 6)
      );
      ctx.lineTo(
        tipX - ARROW_HEAD_SIZE * Math.cos(headAngle + Math.PI / 6),
        tipY - ARROW_HEAD_SIZE * Math.sin(headAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();

      // Reset shadow and alpha
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1.0;

      // Draw message label (S/F) on arrow
      const labelX = (startX + endX) / 2;
      const labelY = y - 5;
      ctx.fillStyle = '#fff';
      ctx.fillRect(labelX - 20, labelY - 10, 40, 14);
      ctx.fillStyle = color;
      ctx.font = isSelected ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`S${row.s}F${row.f}`, labelX, labelY);

      // Draw CEID indicator
      if (row.ceid > 0) {
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '9px sans-serif';
        ctx.fillText(`[${row.ceid}]`, labelX, labelY + 12);
      }

      // Draw timestamp on left margin
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      const timeStr = formatTime(Number(row.ts_ns), timezone);
      ctx.fillText(timeStr, MARGIN.left - 10, y + 3);
    });

    // Draw brush selection indicator
    if (brushFirstClick) {
      const firstClickIndex = rows.findIndex(r => r.ts_ns === brushFirstClick.ts_ns);
      if (firstClickIndex !== -1) {
        const indicatorY = MARGIN.top + firstClickIndex * spacing;
        
        // Draw vertical dashed line at first click
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(MARGIN.left - 5, indicatorY);
        ctx.lineTo(width - MARGIN.right, indicatorY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash
        
        // Draw label
        ctx.fillStyle = '#667eea';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Start', MARGIN.left - 15, indicatorY - 5);
      }
    }

    // Draw legend at top
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    let legendX = MARGIN.left;
    const legendY = 15;
    
    Object.entries(sColors).forEach(([s, color]) => {
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = '#333';
      ctx.fillText(`S${s}`, legendX + 15, legendY);
      legendX += 50;
    });

  }, [rows, width, totalHeight, verticalZoom, selectedRowId, timezone, brushFirstClick, highlight, spacing]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTop;

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const hostX = MARGIN.left + plotWidth * LIFELINE_HOST_X;
    const equipX = MARGIN.left + plotWidth * LIFELINE_EQUIP_X;

    // Check if hovering over an arrow
    const hoveredRow = rows.find((row, index) => {
      const arrowY = MARGIN.top + index * spacing;
      const isHostToEquip = row.dir === 1;
      const startX = isHostToEquip ? hostX : equipX;
      const endX = isHostToEquip ? equipX : hostX;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);

      // Check if mouse is near the arrow horizontally and vertically
      return Math.abs(y - arrowY) < 8 && x >= minX && x <= maxX;
    });

    if (hoveredRow) {
      const content = formatTooltip(hoveredRow, timezone);
      setTooltip({ x: e.clientX, y: e.clientY, content });
    } else {
      setTooltip(null);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTop;

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const hostX = MARGIN.left + plotWidth * LIFELINE_HOST_X;
    const equipX = MARGIN.left + plotWidth * LIFELINE_EQUIP_X;

    // Check if clicking on an arrow
    const clickedRow = rows.find((row, index) => {
      const arrowY = MARGIN.top + index * spacing;
      const isHostToEquip = row.dir === 1;
      const startX = isHostToEquip ? hostX : equipX;
      const endX = isHostToEquip ? equipX : hostX;
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);

      return Math.abs(y - arrowY) < 8 && x >= minX && x <= maxX;
    });

    if (clickedRow) {
      // Check if shift key is pressed for brush selection
      if (e.shiftKey && onTimeRangeChange) {
        if (!brushFirstClick) {
          // First click - start brush selection
          setBrushFirstClick({
            ts_ns: clickedRow.ts_ns,
            y,
          });
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            content: 'Shift+Click second point to select time range\nPress Escape to cancel',
          });
        } else {
          // Second click - complete brush selection
          const fromNs = Math.min(Number(brushFirstClick.ts_ns), Number(clickedRow.ts_ns));
          const toNs = Math.max(Number(brushFirstClick.ts_ns), Number(clickedRow.ts_ns));
          
          onTimeRangeChange(fromNs, toNs);
          setBrushFirstClick(null);
          setTooltip(null);
        }
      } else {
        // Normal click - select row
        onRowSelect(clickedRow.row_id);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Only zoom when Ctrl is pressed, otherwise allow normal scrolling
    if (!e.ctrlKey) return;
    
    e.preventDefault();
    const delta = e.deltaY;
    const factor = delta > 0 ? 0.9 : 1.1; // Zoom in/out on vertical spacing

    setVerticalZoom((prev) => {
      const newZoom = Math.max(0.3, Math.min(5.0, prev * factor));
      return newZoom;
    });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          overflowY: 'scroll',
          overflowX: 'hidden',
          border: '1px solid #ddd',
          borderRadius: '4px',
          backgroundColor: '#f9f9f9',
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={totalHeight}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          onClick={handleClick}
          onWheel={handleWheel}
          style={{ 
            cursor: 'crosshair',
            display: 'block',
          }}
        />
      </div>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'pre-line',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

function formatTime(ns: number, timezone: Timezone): string {
  const date = new Date(ns / 1_000_000);
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone === 'Asia/Jakarta' ? 'Asia/Jakarta' : 'UTC',
  };
  const timeStr = date.toLocaleTimeString('en-US', options);
  // Add milliseconds manually
  const ms = Math.floor((ns / 1_000_000) % 1000);
  return `${timeStr}.${ms.toString().padStart(3, '0')}`;
}

function formatTooltip(row: MessageRow, timezone: Timezone): string {
  const date = new Date(Number(row.ts_ns) / 1_000_000);
  const timeStr = date.toLocaleString('en-US', {
    timeZone: timezone === 'Asia/Jakarta' ? 'Asia/Jakarta' : 'UTC',
  });
  
  const dir = row.dir === 1 ? 'H→E' : 'E→H';
  const ceid = row.ceid > 0 ? `\nCEID: ${row.ceid}` : '';
  
  return `${timeStr}\nS${row.s}F${row.f} | ${dir}${ceid}`;
}

