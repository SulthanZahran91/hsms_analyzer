# HSMS Visualizer Backend

High-performance Rust backend for HSMS/SECS log processing using Arrow columnar format.

## Architecture

### Crates

- **parser** - NDJSON and CSV parsing with `body_json` support
- **service** - HTTP API server with Arrow IPC endpoints

### Data Flow

1. **Ingest**: NDJSON/CSV → Parse → Convert to Arrow
2. **Storage**: 
   - Hot path: Arrow RecordBatch (chunked at 50k rows)
   - Cold path: MsgPack payloads (per-message)
3. **Query**: Filter on Arrow columns → Return Arrow IPC stream

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Upload file (multipart), returns `{session_id}` |
| GET | `/sessions/{id}/meta` | Get session metadata |
| GET | `/sessions/{id}/messages.arrow` | Fetch Arrow data window |
| POST | `/sessions/{id}/search` | Search with filters, returns Arrow stream |
| GET | `/sessions/{id}/payload/{row_id}` | Get message payload (JSON) |
| DELETE | `/sessions/{id}` | Delete session |

### Query Parameters

**messages.arrow**:
- `limit`: Max rows to return (default: 50000)
- `from_ns`: Start timestamp (nanoseconds)
- `to_ns`: End timestamp (nanoseconds)
- `cursor`: Pagination cursor

**search** (POST body):
```json
{
  "time": {"from_ns": 0, "to_ns": 0},
  "dir": 0,  // 0=both, 1=H->E, -1=E->H
  "s": [],
  "f": [],
  "ceid": [],
  "text": "",
  "highlight": {  // optional
    "ceid": [],
    "sxfy": [{"s": 6, "f": 11}],
    "unanswered": false
  }
}
```

## Schema

### Arrow Columns

```
ts_ns:    Int64   // epoch nanoseconds
dir:      Int8    // 1=H->E, -1=E->H
s:        UInt8   // Stream
f:        UInt8   // Function
wbit:     UInt8   // Wait bit (0/1)
sysbytes: UInt32  // System bytes
ceid:     UInt32  // Collection Event ID (0 if N/A)
row_id:   UInt32  // Stable row identifier
```

### Metadata

```json
{
  "row_count": 15,
  "t_min_ns": 1762160400100000000,
  "t_max_ns": 1762160415500000000,
  "distinct_s": [6],
  "distinct_f": [11],
  "distinct_ceid": [201, 202, 203]
}
```

## Performance

- **Ingest**: ~100MB NDJSON/CSV in <5s
- **Storage**: Arrow chunks (~50k rows each)
- **Memory**: Streaming parser, no full-file loads
- **Compression**: MsgPack for payloads (~40% size reduction)

## Building

```bash
cargo build --release
cargo run --release  # Starts on :8080
```

## Testing

```bash
cargo test
cargo test --package parser -- --nocapture
```

