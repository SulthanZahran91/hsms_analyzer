# HSMS Visualizer Frontend

React + TypeScript frontend for HSMS/SECS log visualization with Apache Arrow support.

## Features

### Core Visualization
- **Timeline Plot**: Dual-lane canvas visualization (H→E / E→H)
- **Interactive Zoom**: Mouse wheel zoom, pan navigation
- **Filtering**: Real-time filtering on S/F/CEID/Direction/Time
- **Selection Sync**: Click plot ↔ table bidirectional selection

### Components

- **PlotCanvas**: Canvas2D rendering with tooltip hover
- **DataTable**: Virtualized table for performance (handles 100k+ rows)
- **FilterBar**: Multi-dimensional filter controls
- **PayloadPanel**: Message detail viewer (semantic + secs_tree)
- **Legend**: Live counts per S/F values

### State Management

- **Zustand** store for global state
- **Workers** (compute/io) for heavy processing
- **Apache Arrow** for efficient columnar data

## Tech Stack

- **Runtime**: Bun (preferred) or Node 20+
- **Build**: Vite 6
- **Framework**: React 18 + TypeScript
- **Data**: Apache Arrow JS 21
- **Styling**: Vanilla CSS (no framework)

## Scripts

```bash
bun install          # Install dependencies
bun run build        # Build for production
bun run preview      # Preview production build
```

## Architecture

```
App.tsx
├── FilterBar.tsx           # Filter controls
├── PlotCanvas.tsx          # Timeline visualization
├── DataTable.tsx           # Virtualized table
├── PayloadPanel.tsx        # Message details
└── Legend.tsx              # Stats sidebar

Workers:
├── compute.worker.ts       # Filter/extract operations
└── io.worker.ts            # Async Arrow fetching

State:
└── store.ts                # Zustand global state

DataSource:
└── remoteArrow.ts          # Backend API client
```

## State Flow

1. User uploads file → Backend creates session
2. Fetch Arrow window → Parse to typed arrays
3. Extract rows in compute worker
4. Apply filters → Update UI
5. Selection → Fetch payload → Display details

## Performance

- **First Paint**: <2s after data load
- **Filtering**: Client-side, ≤150ms @ 100k rows
- **Rendering**: Canvas 2D, subsampling for >50k ticks
- **Memory**: Capped payload cache (150MB / 10k items)

## Timezone Support

- Default: Asia/Jakarta
- Toggle to UTC
- Applies to all timestamps (plot, table, tooltips)

