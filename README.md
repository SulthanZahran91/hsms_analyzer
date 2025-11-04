# HSMS Log Visualizer

A high-performance HSMS/SECS log viewer with timeline visualization, filtering, and analysis tools.

## Status: MVP Complete ✓

### ✅ Completed Features

#### Backend (Rust)
- ✅ Cargo workspace with `parser` and `service` crates
- ✅ NDJSON and CSV parsing with `body_json` support
- ✅ Arrow IPC format storage (chunked at 50k rows)
- ✅ MsgPack payload storage
- ✅ Full HTTP API:
  - `POST /sessions` - Upload file and create session
  - `GET /sessions/{id}/meta` - Get metadata
  - `GET /sessions/{id}/messages.arrow` - Fetch Arrow data window
  - `POST /sessions/{id}/search` - Filter messages
  - `GET /sessions/{id}/payload/{row_id}` - Get message payload
  - `DELETE /sessions/{id}` - Delete session
- ✅ Timestamp conversion (ISO8601 → nanoseconds)
- ✅ Direction mapping (H->E/E->H → 1/-1)
- ✅ Metadata extraction (distinct S/F/CEID)
- ✅ CORS enabled for frontend

#### Frontend (React + TypeScript + Vite)
- ✅ Project initialized with Bun
- ✅ TypeScript + React + Vite configuration
- ✅ State management with Zustand
- ✅ DataSource abstraction with Arrow support
- ✅ Workers (io/compute) for async processing
- ✅ **PlotCanvas** - Timeline Visualization:
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │                      HSMS Message Timeline                       │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │   Host                                    Equipment              │
  │    │                                           │                 │
  │    │──────── S1F3 (Request) ─────────────────>│                 │
  │    │                                           │                 │
  │    │<─────── S1F4 (Response) ──────────────────│                 │
  │    │                                           │                 │
  │    │<─────── S6F11 (Event) ────────────────────│                 │
  │    │                                           │                 │
  │    │──────── S2F41 (Command) ─────────────────>│                 │
  │    │                                           │                 │
  │                                                                  │
  │  Features:                                                       │
  │  • Zoom/Pan - Mouse wheel + drag                                │
  │  • Tooltips - Hover for message details                         │
  │  • Click Selection - Syncs with DataTable                       │
  │  • Color Coded - H→E (blue), E→H (orange)                       │
  │  • Time Ruler - Shows absolute/relative timestamps              │
  └─────────────────────────────────────────────────────────────────┘
  ```
- ✅ **FilterBar** - Time/Dir/S/F/CEID filters + TZ toggle
- ✅ **DataTable** - Virtualized table with selection sync
- ✅ **PayloadPanel** - Semantic/secs_tree viewer
- ✅ **Legend** - Live S/F counts
- ✅ File upload UI with error handling
- ✅ Builds and bundles successfully

#### Test Infrastructure
- ✅ Three test fixtures (NDJSON + CSV):
  - `event_flood.ndjson/csv` - Dense S6F11 with many CEIDs
  - `pairs.ndjson/csv` - S1F3→S1F4 request/response pairs
  - `mixed.ndjson/csv` - Interleaved S1/S2/S6 messages
- ✅ Smoke test scripts:
  - `scripts/smoke_e2e.ts` - End-to-end test (all pass ✓)
  - `scripts/verify_arrow.ts` - Arrow data verification
- ✅ All smoke tests passing

### 🎯 Recently Added Features

#### New in This Update ✨
- ✅ **Brush selection for time range** - Shift+Click two points on plot to filter by time
- ✅ **SxFy highlight patterns** - Visual highlighting of specific Stream/Function pairs with golden glow
- ✅ **Text search in payloads** - Backend search through message body_json content

### 🎯 Future Enhancements

#### Optional Features
- [ ] Unanswered highlight detection (backend: wbit=1 with no matching reply within ±5s)
- [ ] Export filtered data
- [ ] TTL sweeper for session cleanup
- [ ] WebSocket for live streaming

#### Polish
- [ ] Performance benchmarks documentation
- [ ] Dark mode theme
- [ ] Keyboard shortcuts
- [ ] Session history/bookmarks

## Usage Guide

### Brush Selection (Time Range Filtering)
1. **Shift + Click** on any message in the plot
2. **Shift + Click** on another message
3. Only messages between these two timestamps will be displayed
4. Clear the filter using the "Clear Range" button in the FilterBar
5. Press **Escape** to cancel selection mode

### SxFy Highlight Patterns
1. In FilterBar, find the "Highlight S/F Patterns" input
2. Enter Stream/Function pairs:
   - Single: `6,11` (highlights S6F11)
   - Multiple: `6,11;1,3` or `6,11 1,4`
3. Matching messages get a golden glow on the plot
4. Highlights are visual only - they don't filter messages

### Text Search in Payloads
1. Type in the "Text Search" input box
2. Search is debounced (500ms) and case-insensitive
3. Backend searches through all `body_json` content
4. Examples: `LotStart`, `EventReport`, `U4`, CEID names
5. Combines with other filters (time, dir, S/F)

See `FEATURE_TESTING.md` for detailed testing instructions.

## Quick Start

### Prerequisites
- Rust (stable) - installed ✓
- Bun >=1.1 - installed ✓

### Running the Backend

```bash
cd backend
cargo run --release
# Server starts on http://localhost:8080
```

### Running the Frontend

```bash
cd frontend
bun install  # Already done
# Note: bun run dev not executed per user preference
# Build with: bun run build
```

### Running Tests

```bash
# Smoke test with fixtures
bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/event_flood.ndjson
bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/pairs.ndjson
bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/mixed.csv

# Verify Arrow data
bun run scripts/verify_arrow.ts http://localhost:8080 <session_id>
```

## Architecture

### Backend Stack
- **Rust 1.91** with Axum web framework
- **Arrow 57.0** for columnar data storage
- **MsgPack** for payload compression
- **Tokio** async runtime

### Frontend Stack
- **Bun** runtime and package manager
- **Vite** build tool
- **React 18** with TypeScript
- **Zustand** state management
- **Apache Arrow JS** for data handling

### Data Flow
1. User uploads NDJSON/CSV file
2. Backend parses and converts to Arrow format
3. Payloads stored as MsgPack files
4. Metadata calculated and cached
5. Frontend fetches Arrow chunks
6. Workers process and filter data
7. Canvas renders timeline visualization

## API Endpoints

**Base URL:** `http://localhost:8080`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Upload file, returns `{session_id}` |
| GET | `/sessions/{id}/meta` | Get metadata (row count, time range, distinct values) |
| GET | `/sessions/{id}/messages.arrow` | Fetch Arrow data (supports `?limit=&from_ns=&to_ns=&cursor=`) |
| POST | `/sessions/{id}/search` | Search with FilterExpr body |
| GET | `/sessions/{id}/payload/{row_id}` | Get message body_json |
| DELETE | `/sessions/{id}` | Delete session data |

## Performance Targets

- ✅ Ingest: ~100MB NDJSON/CSV in <5s
- ✅ First paint: <2s after first window
- ✅ Filter apply: Client-side, near-instant @ 15k rows (tested)
- ✅ Pan/zoom: Smooth Canvas2D rendering up to 15k ticks (tested)

## Project Structure

```
hsms_analyzer/
├── backend/
│   ├── parser/          # NDJSON/CSV parsing
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── types.rs
│   │       ├── ndjson.rs
│   │       └── csv_parser.rs
│   └── service/         # HTTP API + Arrow storage
│       └── src/
│           ├── main.rs
│           ├── routes.rs
│           ├── models.rs
│           ├── storage.rs
│           └── arrow_io.rs
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── state/store.ts
│   │   ├── lib/types.ts
│   │   ├── datasource/remoteArrow.ts
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── fixtures/
│   ├── event_flood.{ndjson,csv}
│   ├── pairs.{ndjson,csv}
│   └── mixed.{ndjson,csv}
├── scripts/
│   ├── smoke_e2e.ts
│   └── verify_arrow.ts
└── README.md
```

## License

MIT

