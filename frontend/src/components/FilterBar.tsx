import { useStore } from '../state/store';
import { useState, useEffect } from 'react';

export function FilterBar() {
  const { filter, meta, highlight, setFilter, setHighlight, timezone, setTimezone } = useStore();
  const [textInput, setTextInput] = useState(filter.text);
  const [sxfyInput, setSxfyInput] = useState('');

  const handleDirChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter({ dir: parseInt(e.target.value) });
  };

  const handleSChange = (s: number) => {
    const newS = filter.s.includes(s)
      ? filter.s.filter((v) => v !== s)
      : [...filter.s, s];
    setFilter({ s: newS });
  };

  const handleFChange = (f: number) => {
    const newF = filter.f.includes(f)
      ? filter.f.filter((v) => v !== f)
      : [...filter.f, f];
    setFilter({ f: newF });
  };

  const handleCeidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setFilter({ ceid: [] });
      return;
    }
    
    const ceids = value
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
    setFilter({ ceid: ceids });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput(e.target.value);
  };

  const handleSxfyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSxfyInput(value);
    
    if (value.trim() === '') {
      setHighlight({ sxfy: [] });
      return;
    }
    
    // Parse input like "1,3;6,11" or "1,3 6,11"
    const pairs = value.split(/[;\s]+/).filter(p => p.trim());
    const parsed = pairs
      .map(pair => {
        const [sStr, fStr] = pair.split(',').map(s => s.trim());
        const s = parseInt(sStr);
        const f = parseInt(fStr);
        if (!isNaN(s) && !isNaN(f)) {
          return { s, f };
        }
        return null;
      })
      .filter((p): p is { s: number; f: number } => p !== null);
    
    setHighlight({ sxfy: parsed });
  };

  const handleClearTimeRange = () => {
    setFilter({ time: { from_ns: 0, to_ns: 0 } });
  };

  // Debounce text search - only update filter after 500ms of no typing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilter({ text: textInput });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [textInput, setFilter]);

  const handleReset = () => {
    setFilter({
      time: { from_ns: 0, to_ns: 0 },
      dir: 0,
      s: [],
      f: [],
      ceid: [],
      text: '',
    });
    setHighlight({ sxfy: [], ceid: [] });
    setTextInput(''); // Also reset local text input state
    setSxfyInput(''); // Also reset SxFy input state
  };

  if (!meta) return null;

  // Format timestamp for display
  const formatTimeRange = (ns: number) => {
    const date = new Date(ns / 1_000_000);
    return date.toLocaleString('en-US', {
      timeZone: timezone === 'Asia/Jakarta' ? 'Asia/Jakarta' : 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const hasTimeRange = filter.time.from_ns > 0 || filter.time.to_ns > 0;

  return (
    <div className="filter-bar">
      {hasTimeRange && (
        <div className="filter-section" style={{ backgroundColor: '#f0f4ff', padding: '8px', borderRadius: '4px' }}>
          <label style={{ color: '#667eea', fontWeight: 'bold' }}>Time Range Filter:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <span style={{ fontSize: '12px' }}>
              {filter.time.from_ns > 0 ? formatTimeRange(filter.time.from_ns) : 'Start'} 
              {' → '} 
              {filter.time.to_ns > 0 ? formatTimeRange(filter.time.to_ns) : 'End'}
            </span>
            <button onClick={handleClearTimeRange} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}>
              Clear Range
            </button>
          </div>
        </div>
      )}
      
      <div className="filter-section">
        <label>Direction:</label>
        <select value={filter.dir} onChange={handleDirChange}>
          <option value="0">Both</option>
          <option value="1">H→E</option>
          <option value="-1">E→H</option>
        </select>
      </div>

      <div className="filter-section">
        <label>Stream (S):</label>
        <div className="checkbox-group">
          {meta.distinct_s.map((s) => (
            <label key={s} className="checkbox-label">
              <input
                type="checkbox"
                checked={filter.s.includes(s)}
                onChange={() => handleSChange(s)}
              />
              S{s}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <label>Function (F):</label>
        <div className="checkbox-group">
          {meta.distinct_f.slice(0, 10).map((f) => (
            <label key={f} className="checkbox-label">
              <input
                type="checkbox"
                checked={filter.f.includes(f)}
                onChange={() => handleFChange(f)}
              />
              F{f}
            </label>
          ))}
          {meta.distinct_f.length > 10 && (
            <span className="more-indicator">
              +{meta.distinct_f.length - 10} more
            </span>
          )}
        </div>
      </div>

      <div className="filter-section">
        <label>CEID (comma-separated):</label>
        <input
          type="text"
          value={filter.ceid.join(', ')}
          onChange={handleCeidChange}
          placeholder="e.g., 201, 202, 203"
        />
      </div>

      <div className="filter-section">
        <label>Text Search:</label>
        <input
          type="text"
          value={textInput}
          onChange={handleTextChange}
          placeholder="Search in payload..."
        />
      </div>

      <div className="filter-section">
        <label>Highlight S/F Patterns:</label>
        <input
          type="text"
          value={sxfyInput}
          onChange={handleSxfyChange}
          placeholder="e.g., 1,3;6,11 or 1,3 6,11"
        />
        {highlight.sxfy.length > 0 && (
          <div style={{ fontSize: '11px', color: '#667eea', marginTop: '4px' }}>
            Highlighting: {highlight.sxfy.map(p => `S${p.s}F${p.f}`).join(', ')}
          </div>
        )}
      </div>

      <div className="filter-section">
        <label>Timezone:</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value as 'Asia/Jakarta' | 'UTC')}
        >
          <option value="Asia/Jakarta">Asia/Jakarta</option>
          <option value="UTC">UTC</option>
        </select>
      </div>

      <div className="filter-actions">
        <button onClick={handleReset} className="btn-secondary">
          Reset Filters
        </button>
      </div>
    </div>
  );
}

