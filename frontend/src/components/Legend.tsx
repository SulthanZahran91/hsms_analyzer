import type { MessageRow } from '../lib/types';

interface LegendProps {
  rows: MessageRow[];
}

export function Legend({ rows }: LegendProps) {
  // Count by S and F
  const sCounts = new Map<number, number>();
  const fCounts = new Map<number, number>();

  rows.forEach((row) => {
    sCounts.set(row.s, (sCounts.get(row.s) || 0) + 1);
    fCounts.set(row.f, (fCounts.get(row.f) || 0) + 1);
  });

  const sEntries = Array.from(sCounts.entries()).sort((a, b) => a[0] - b[0]);
  const fEntries = Array.from(fCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5 F values

  return (
    <div className="legend">
      <div className="legend-section">
        <h4>Stream Counts</h4>
        <div className="legend-items">
          {sEntries.map(([s, count]) => (
            <div key={s} className="legend-item">
              <span className="legend-label">S{s}:</span>
              <span className="legend-count">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-section">
        <h4>Top Functions</h4>
        <div className="legend-items">
          {fEntries.map(([f, count]) => (
            <div key={f} className="legend-item">
              <span className="legend-label">F{f}:</span>
              <span className="legend-count">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-section">
        <h4>Total</h4>
        <div className="legend-total">{rows.length.toLocaleString()} messages</div>
      </div>
    </div>
  );
}

