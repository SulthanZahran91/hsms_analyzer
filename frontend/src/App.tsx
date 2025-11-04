import { useState, useEffect } from 'react';
import { useStore } from './state/store';
import { RemoteDataSource } from './datasource';
import { PlotCanvas } from './components/PlotCanvas';
import { FilterBar } from './components/FilterBar';
import { DataTable } from './components/DataTable';
import { Legend } from './components/Legend';
import { PayloadPanel } from './components/PayloadPanel';
import type { MessageRow } from './lib/types';
import './styles.css';

const dataSource = new RemoteDataSource();

export default function App() {
  const {
    sessionId,
    meta,
    table,
    filter,
    highlight,
    timezone,
    selectedRowId,
    isLoading,
    error,
    setSessionId,
    setMeta,
    setTable,
    setFilter,
    setLoading,
    setError,
    setSelectedRowId,
    reset,
  } = useStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [extractedRows, setExtractedRows] = useState<MessageRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<MessageRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPastedText(''); // Clear pasted text when file is selected
    }
  };

  const handleTextPaste = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    setPastedText(text);
    if (text.trim()) {
      setSelectedFile(null); // Clear file when text is pasted
    }
  };

  const handleTextUpload = async () => {
    if (!pastedText.trim()) return;

    try {
      // Detect format from content (NDJSON if starts with {, otherwise CSV)
      const isNDJSON = pastedText.trim().startsWith('{');
      const filename = isNDJSON ? 'pasted.ndjson' : 'pasted.csv';
      const mimeType = isNDJSON ? 'application/x-ndjson' : 'text/csv';
      
      // Create a File from pasted text
      const blob = new Blob([pastedText], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });
      
      setSelectedFile(file);
      await handleUpload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Text upload error:', err);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setLoading(true);
      setError(null);

      // Create session
      const sid = await dataSource.createSession(selectedFile);
      setSessionId(sid);

      // Fetch metadata
      const meta = await dataSource.getMeta(sid);
      setMeta(meta);

      // Fetch initial data window
      const table = await dataSource.fetchWindow(sid, { limit: 50000 });
      setTable(table);

      console.log('Session created:', sid, 'Rows:', meta.row_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Extract rows from Arrow table
  useEffect(() => {
    if (!table) {
      setExtractedRows([]);
      return;
    }

    const rows: MessageRow[] = [];
    const tsCol = table.getChild('ts_ns');
    const dirCol = table.getChild('dir');
    const sCol = table.getChild('s');
    const fCol = table.getChild('f');
    const wbitCol = table.getChild('wbit');
    const sysbytesCol = table.getChild('sysbytes');
    const ceidCol = table.getChild('ceid');
    const rowIdCol = table.getChild('row_id');

    if (!tsCol || !dirCol || !sCol || !fCol) return;

    for (let i = 0; i < table.numRows; i++) {
      rows.push({
        ts_ns: tsCol.get(i) as bigint,
        dir: dirCol.get(i) as number,
        s: sCol.get(i) as number,
        f: fCol.get(i) as number,
        wbit: wbitCol?.get(i) as number || 0,
        sysbytes: sysbytesCol?.get(i) as number || 0,
        ceid: ceidCol?.get(i) as number || 0,
        row_id: rowIdCol?.get(i) as number || i,
      });
    }

    setExtractedRows(rows);
  }, [table]);

  // Backend search handler for text search
  const handleBackendSearch = async () => {
    if (!sessionId) return;

    try {
      setIsSearching(true);
      setError(null);

      // Call backend search endpoint
      const searchTable = await dataSource.search(sessionId, filter);
      
      // Update table with search results
      setTable(searchTable);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Apply filters (client-side or backend search)
  useEffect(() => {
    if (extractedRows.length === 0) {
      setFilteredRows([]);
      return;
    }

    // If text search is active, use backend search
    if (filter.text.trim()) {
      handleBackendSearch();
      return;
    }

    // Otherwise, apply client-side filters
    const filtered = extractedRows.filter((row) => {
      if (filter.dir !== 0 && filter.dir !== row.dir) return false;
      if (filter.s.length > 0 && !filter.s.includes(row.s)) return false;
      if (filter.f.length > 0 && !filter.f.includes(row.f)) return false;
      if (filter.ceid.length > 0 && !filter.ceid.includes(row.ceid)) return false;
      
      const ns = Number(row.ts_ns);
      if (filter.time.from_ns > 0 && ns < filter.time.from_ns) return false;
      if (filter.time.to_ns > 0 && ns > filter.time.to_ns) return false;

      return true;
    });

    setFilteredRows(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedRows, filter]);

  const handleReset = () => {
    reset();
    setSelectedFile(null);
    setPastedText('');
    setExtractedRows([]);
    setFilteredRows([]);
  };

  const handleRowSelect = (rowId: number) => {
    setSelectedRowId(rowId);
  };

  const handleTimeRangeChange = (fromNs: number, toNs: number) => {
    // Update filter with selected time range
    setFilter({ time: { from_ns: fromNs, to_ns: toNs } });
  };

  return (
    <div className="app">
      <header className="header">
        <h1>HSMS Log Visualizer</h1>
        {sessionId && (
          <button onClick={handleReset} className="btn-secondary">
            Reset
          </button>
        )}
      </header>

      <main className="main">
        {!sessionId ? (
          <div className="upload-container">
            <h2>Upload HSMS/SECS Log File</h2>
            <p>Select a file or paste your log data</p>

            <div className="file-input-group">
              <input
                type="file"
                accept=".ndjson,.json,.csv"
                onChange={handleFileSelect}
                disabled={isLoading}
              />
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isLoading}
                className="btn-primary"
              >
                {isLoading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>

            <div className="divider">
              <span>OR</span>
            </div>

            <div className="paste-section">
              <textarea
                className="paste-textarea"
                placeholder="Paste your NDJSON or CSV log data here..."
                value={pastedText}
                onChange={handleTextPaste}
                disabled={isLoading}
                rows={10}
              />
              <button
                onClick={handleTextUpload}
                disabled={!pastedText.trim() || isLoading}
                className="btn-primary"
              >
                {isLoading ? 'Processing...' : 'Upload Pasted Data'}
              </button>
            </div>

            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <div className="viewer-container">
            {meta && (
              <div className="meta-bar">
                <div className="meta-item">
                  <strong>Total:</strong> {meta.row_count.toLocaleString()}
                </div>
                <div className="meta-item">
                  <strong>Filtered:</strong> {filteredRows.length.toLocaleString()}
                </div>
                <div className="meta-item">
                  <strong>Session:</strong> {sessionId.substring(0, 8)}...
                </div>
                {isSearching && (
                  <div className="meta-item" style={{ color: '#667eea' }}>
                    <strong>⏳ Searching...</strong>
                  </div>
                )}
              </div>
            )}

            <FilterBar />

            <div className="viz-container">
              <div className="viz-main">
                <PlotCanvas
                  rows={filteredRows}
                  width={1000}
                  height={500}
                  timezone={timezone}
                  selectedRowId={selectedRowId}
                  highlight={highlight}
                  onRowSelect={handleRowSelect}
                  onTimeRangeChange={handleTimeRangeChange}
                />

                <div className="split-view">
                  <div className="table-section">
                    <DataTable
                      rows={filteredRows}
                      selectedRowId={selectedRowId}
                      timezone={timezone}
                      onRowSelect={handleRowSelect}
                    />
                  </div>
                  <div className="payload-section">
                    <PayloadPanel />
                  </div>
                </div>
              </div>

              <div className="viz-sidebar">
                <Legend rows={filteredRows} />
              </div>
            </div>

            {error && <div className="error">{error}</div>}
          </div>
        )}
      </main>
    </div>
  );
}
