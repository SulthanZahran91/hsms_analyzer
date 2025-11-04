# HSMS Log Visualizer — **Agent-First Sprint Doc (MVP, v1.2 – no Docker)**

> Build a working app where a user uploads HSMS/SECS logs and sees a **timeline plot** with **filters** (time/dir/S/F/CEID) and **highlights** (CEID, SxFy, unanswered).
> **Packaging:** no containers. **Frontend:** Bun/Node (Vite + React + TS). **Backend:** Rust (cargo crates).
> **Transport:** Apache **Arrow** for rows; **JSON** for meta/controls.
> **Timezone:** default **Asia/Jakarta**, toggle to UTC.
> **Performance target:** handle ~100 MB logs comfortably.

---

## 0) Ground Rules (for agents)

* Stick to the tech here. No Docker, no extra services.
* Stream/chunk everything; avoid whole-file RAM loads.
* Heavy work off the UI thread (Workers).
* FE/BE **contracts are SoT**: Arrow columns + FilterExpr + HighlightExpr.
* Use lockfiles for reproducibility: `bun.lockb` and `Cargo.lock`.
* Version pins:

  * **Rust**: `stable` (pin via `rust-toolchain.toml`).
  * **Bun**: `>=1.1` (or Node 20+ if Bun unavailable).
* “Done” = both apps run locally from source; smoke scripts pass.

---

## 1) Ingest Spec (v1.1) — Flexible Payload Compatible

Accept **NDJSON (preferred)** or **CSV** with a **flexible payload** column `body_json`.

### 1.1 NDJSON (preferred)

Each line is one message:

```json
{
  "ts_iso":"2025-11-03T09:12:14.123Z",
  "dir":"E->H",
  "s":6,"f":11,"wbit":0,"sysbytes":12345,"ceid":201,
  "body_json":{
    "secs_tree":{"t":"L","items":[{"t":"U4","v":201}]},
    "semantic":{"kind":"EventReport","ceid_name":"LotStart",
      "reports":[{"rptid":10,"vids":[{"vid":501,"name":"CassetteID","value":"A001"}]}]}
  },
  "equip_profile_id":"EQP-ABC-1",
  "schema_version":"v1.1"
}
```

### 1.2 CSV (RFC-4180) with JSON payload column

```
ts_iso,dir,s,f,wbit,sysbytes,ceid,body_json
2025-11-03T09:12:14.123Z,E->H,6,11,0,12345,201,"{""secs_tree"":{""t"":""L"",""items"":[{""t"":""U4"",""v"":201}]}}"
```

**Rules**

* `ts_iso`: ISO8601 (ms+). Server converts to `ts_ns` (i64).
* `dir`: `"H->E"` or `"E->H"` → map to `1`/`-1`.
* If `ceid` N/A: use `0` (CSV) or omit (NDJSON).
* `body_json` **must** have at least one of: `secs_tree`, `semantic`.

---

## 2) `body_json` Contract

### 2.1 `secs_tree` (always valid)

```json
{
  "secs_tree":{
    "t":"L",
    "items":[
      {"t":"U4","v":201},
      {"t":"L","items":[
        {"t":"L","items":[
          {"t":"U4","v":10},
          {"t":"L","items":[{"t":"U4","v":501},{"t":"A","v":"A001"}]}
        ]}
      ]}
    ]
  }
}
```

Types: `L, A, B, I1, U1, I2, U2, I4, U4, I8, U8, F4, F8, BOOL`.
`A` = UTF-8 string, `B` = base64; numerics as JSON numbers.

### 2.2 `semantic` (optional, schema-aware)

Examples:

```json
{"semantic":{"kind":"EventReport","ceid":201,"ceid_name":"LotStart",
  "reports":[{"rptid":10,"vids":[{"vid":501,"name":"CassetteID","value":"A001"}]}]}}
{"semantic":{"kind":"VariableRequest","vids":[501,502]}}
{"semantic":{"kind":"VariableResponse","values":[{"vid":501,"value":"A001"}]}}
{"semantic":{"kind":"RemoteCommand","rcmd":"START","params":[{"cpname":"LOTID","cpval":"A001"}]}}
```

### 2.3 JSON Schema (conformance snippet)

See full schema in prior message; agents can copy it to `schema/body_json.schema.json` and validate on ingest.

---

## 3) Canonical Data Model (Arrow) — Fast Path

**Arrow RecordBatch columns (hot path)**

```
ts_ns:    int64   // epoch ns
dir:      int8    //  1 = H->E, -1 = E->H
s:        uint8
f:        uint8
wbit:     uint8   // 0/1
sysbytes: uint32
ceid:     uint32  // 0 if N/A
row_id:   uint32  // stable per session
```

**Payload storage (cold path)**

* Prefer external KV blobs (MsgPack/JSON) keyed by `row_id` in a session folder.
* Alternative: inline Arrow large-string `body_json` column (heavier scans).

---

## 4) Filter & Highlight Contracts

### 4.1 `FilterExpr` (JSON)

```json
{
  "time": { "from_ns": 0, "to_ns": 0 },
  "dir": 0,              // 0=both, 1=H->E, -1=E->H
  "s":   [],
  "f":   [],
  "ceid":[],
  "text": ""
}
```

### 4.2 `HighlightExpr` (JSON)

```json
{
  "ceid": [],
  "sxfy": [{"s":6,"f":11}],
  "unanswered": false
}
```

**Unanswered heuristic:** mark rows with `wbit=1` that have **no** reply `(s,f+1,sysbytes,-dir)` within ±5 s.

---

## 5) Repository Layout (no Docker)

```
hsms-visualizer/
  .editorconfig
  README.md
  rust-toolchain.toml          # pin rust stable
  frontend/
    bun.lockb                  # Bun lockfile
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      state/store.ts
      lib/types.ts
      datasource/index.ts
      datasource/remoteArrow.ts
      workers/io.worker.ts
      workers/compute.worker.ts
      components/PlotCanvas.tsx
      components/FilterBar.tsx
      components/DataTable.tsx
      components/Legend.tsx
      styles.css
    public/
      fixtures/                # example files
  backend/
    Cargo.lock
    Cargo.toml                 # workspace
    parser/
      Cargo.toml
      src/lib.rs
    service/
      Cargo.toml
      src/main.rs
      src/routes.rs
      src/storage.rs
      src/arrow_io.rs
      src/models.rs
      README.md
  fixtures/
    event_flood.ndjson
    pairs.ndjson
    mixed.ndjson
  scripts/
    smoke_e2e.ts               # Bun/Node e2e
    verify_arrow.ts            # Bun/Node Arrow check
```

---

## 6) Backend (Rust) — Tasks & Acceptance

### B0 — Workspace & Health

* Create cargo **workspace**: crates `parser`, `service`.
* `service` with axum + tokio; route `GET /health` → 200 `"ok"`.

**Run:** `cd backend && cargo run`
**AC:** curl `/health` returns 200.

### B1 — Ingest NDJSON/CSV → Arrow + payload KV

* Stream parse NDJSON **or** CSV (RFC-4180).
* Convert scalars to Arrow columns (`ts_ns`, `dir`, `s`, `f`, `wbit`, `sysbytes`, `ceid`, `row_id`).
* Write chunked Arrow files: `/data/<session>/chunks/000.arrow`, `001.arrow`, …
* Store `body_json` as **MsgPack** files: `/data/<session>/payloads/<row_id>.mp` (or inline Arrow string if you choose).
* Write `/data/<session>/meta.json`: `row_count, t_min_ns, t_max_ns, distinct_s, distinct_f, distinct_ceid`.

**Run:** `cargo run` then POST a fixture (see smoke script).
**AC:** ~100 MB ingests in < ~5 s on a dev machine; Arrow chunks loadable by FE.

### B2 — HTTP API

* `POST /sessions` (multipart `file`) → `{"session_id":"uuid"}`
* `GET /sessions/{id}/meta`
* `GET /sessions/{id}/messages.arrow?from_ns=&to_ns=&limit=&cursor=`
* `POST /sessions/{id}/search` (FilterExpr) → Arrow batch
* `GET /sessions/{id}/payload/{row_id}` → JSON (decode MsgPack)
* `DELETE /sessions/{id}` → 204
* CORS allowlist for FE origin; keep-alive on.

**AC:** requests succeed; content types correct.

### B3 — Unanswered mask (server)

* If request includes `"highlight":{"unanswered":true}`, include a boolean `unanswered` column in returned Arrow batch from `/search`.

**AC:** In `pairs.ndjson`, missing replies flagged.

### B4 — TTL sweeper (optional but recommended)

* Background tokio task deletes sessions older than `TTL_HOURS` (env).
  **AC:** Backdating a session triggers deletion (logged).

---

## 7) Frontend (Bun/Node + Vite + React + TS) — Tasks & Acceptance

### F0 — Init & Scripts

* Use **Bun** (preferred) or Node 20+.
* `package.json` scripts:

  * `"dev": "vite"`
  * `"build": "vite build"`
  * `"preview": "vite preview --port 5173"`
  * `"smoke:e2e": "bun run ../scripts/smoke_e2e.ts"`
  * `"verify:arrow": "bun run ../scripts/verify_arrow.ts"`
* `.env` or `VITE_API_BASE` for backend URL.

**Run:** `cd frontend && bun install && bun run dev`
**AC:** App shell renders.

### F1 — DataSource + Remote adapter

* `DataSource`:

  * `createSession(file): Promise<string>`
  * `getMeta(sessionId): Promise<Meta>`
  * `fetchWindow(sessionId,q): Promise<ArrowTable>`
  * `search(sessionId,FilterExpr): Promise<ArrowTable>`
  * `getPayload(sessionId,row_id): Promise<any>`
* Implement `remoteArrow.ts` with fetch; decode Arrow using `apache-arrow` JS.

**AC:** meta + first Arrow window fetched.

### F2 — Workers (I/O + Compute)

* `io.worker.ts`: fetch Arrow windows; transfer buffers to main.
* `compute.worker.ts`:

  * Hold typed column arrays.
  * Apply `FilterExpr` → `indices: Uint32Array`, distincts.
  * Highlights:

    * CEID/SxFy locally.
    * `unanswered`: call `/search` variant; map returned boolean column → bitmask.

**AC:** ~100k rows filter in ≤150 ms; UI responsive.

### F3 — Timeline Plot (Canvas2D)

* Two lanes by `dir`.
* Draw ticks at `ts`; color by `s`, shade by `f`.
* Brush to set time range; dim non-matches; emphasize highlights.
* Tooltip: `time | SxFy | dir | CEID`.

**AC:** first paint <2 s; pan/zoom smooth up to ~50k visible ticks.

### F4 — Filter Bar + Legend

* Controls: Time (bound to brush), Dir, S/F/CEID, Text.
* Legend: per-S/F counts in current filter.

**AC:** controls update plot & table via compute worker.

### F5 — Data Table (virtualized) + Sync + Payload peek

* Columns: `Time, Dir, S, F, CEID`.
* Click row ⇄ center plot; click tick ⇄ select row.
* On selection, lazy fetch payload (`getPayload`); show `semantic` if present, else pretty `secs_tree` snippet.

**AC:** stable bi-directional selection; non-blocking payload peek.

### F6 — Error/Empty/TZ

* Network/Arrow failure → toast + retry.
* Empty state with “Reset filters”.
* TZ toggle (Asia/Jakarta ↔ UTC) for labels/tooltips.

**AC:** states are visible and actionable.

---

## 8) API Quick Reference

**BaseURL:** `http://localhost:8080`

* **POST** `/sessions` (multipart `file`) → `{"session_id":"uuid"}`
* **GET** `/sessions/{id}/meta` →
  `{"row_count":0,"t_min_ns":0,"t_max_ns":0,"distinct_s":[],"distinct_f":[],"distinct_ceid":[]}`
* **GET** `/sessions/{id}/messages.arrow?from_ns=&to_ns=&limit=&cursor=` → Arrow stream
* **POST** `/sessions/{id}/search` → Arrow batch (may include `unanswered: bool` column when requested)
* **GET** `/sessions/{id}/payload/{row_id}` → JSON (decoded `body_json`)
* **DELETE** `/sessions/{id}` → 204

---

## 9) Fixtures (create)

Under `fixtures/`:

1. `event_flood.ndjson` — dense `S6F11` with many CEIDs.
2. `pairs.ndjson` — `S1F3→S1F4`, some responses missing.
3. `mixed.ndjson` — interleaved S1/S2/S6 both directions.

Also provide `.csv` equivalents with quoted `body_json`.

---

## 10) Smoke Scripts (Bun/Node)

### 10.1 `scripts/verify_arrow.ts`

Reads an Arrow response and prints row count/columns.

```ts
// run: bun run scripts/verify_arrow.ts http://localhost:8080 <session_id>
import { tableFromIPC } from "apache-arrow";
const [, , base, sid] = process.argv;
const url = `${base}/sessions/${sid}/messages.arrow?limit=50000`;
const resp = await fetch(url, { headers: { Accept: "application/vnd.apache.arrow.stream" } });
const buf = new Uint8Array(await resp.arrayBuffer());
const table = tableFromIPC(buf);
console.log("rows", table.numRows, "cols", table.schema.fields.map(f => f.name));
```

### 10.2 `scripts/smoke_e2e.ts`

End-to-end: upload → meta → window → search.

```ts
// run: bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/event_flood.ndjson
const [, , base, filePath] = process.argv;
const fd = new FormData(); fd.append("file", new Blob([await Bun.file(filePath).arrayBuffer()]), "event.ndjson");
let r = await fetch(`${base}/sessions`, { method:"POST", body: fd });
const { session_id } = await r.json();
console.log("session", session_id);
r = await fetch(`${base}/sessions/${session_id}/meta`); console.log("meta", await r.json());
r = await fetch(`${base}/sessions/${session_id}/messages.arrow?limit=50000`,
  { headers:{Accept:"application/vnd.apache.arrow.stream"}});
console.log("window bytes", (await r.arrayBuffer()).byteLength);
r = await fetch(`${base}/sessions/${session_id}/search`, {
  method:"POST", headers:{ "Content-Type":"application/json" },
  body: JSON.stringify({ s:[6], f:[11], dir:0, ceid:[] })
});
console.log("search bytes", (await r.arrayBuffer()).byteLength);
```

---

## 11) Performance Targets & Guardrails

* **Ingest (BE):** ~100 MB NDJSON/CSV → Arrow chunks < **5 s**.
* **First paint (FE):** < **2 s** after first window.
* **Filter apply (FE):** ≤ **150 ms** @ ~100k rows.
* **Pan/zoom:** 60 FPS up to ~50k visible ticks (subsample drawing only).
* **FE memory guard:** warn if heap > **500 MB**; cap payload cache ~**150 MB** or **10k** items.
* **Chunk size:** ~**50k** rows/batch; queue depth ~8.

---

## 12) Milestones & Definition of Done

**Milestones**

* M0: Repos + health + FE shell
* M1: Ingest to Arrow + meta
* M2: FE first paint from BE window
* M3: Filters wired (time/dir/S/F/CEID) + legend
* M4: Highlights (CEID, SxFy, unanswered)
* M5: Table sync + payload peek
* M6: Error/empty/TZ + perf sanity
* M7: READMEs + lockfiles + smoke scripts

**DoD**

* Upload → meta → first paint → filters → highlights → selection sync → payload peek works on all fixtures.
* FE runs via `bun run dev`; BE via `cargo run`.
* Smoke scripts succeed (Bun).
* Contracts match FE/BE; no blocking UI; no crashes on ~100 MB ingest.

---

## 13) Issue Backlog (import-ready titles)

**Backend**

* B0: Init Rust workspace and `/health`
* B1: Implement NDJSON/CSV → Arrow chunked ingest (+ payload KV)
* B2: Build and serve `meta.json`
* B3: Implement `/sessions`, `/meta`, `/messages.arrow`, `/search`, `/payload/{row_id}`, `DELETE`
* B4: Add unanswered highlight column in `/search` (optional flag)
* B5: TTL sweeper + env config (no Docker)

**Frontend**

* F0: Init Vite React TS project + Bun scripts
* F1: DataSource abstraction + remoteArrow adapter
* F2: I/O worker (Arrow fetch) + compute worker (filters/highlights)
* F3: Timeline Plot (Canvas2D) with brush/zoom
* F4: Filter Bar + Legend (time/dir/S/F/CEID/text)
* F5: Highlight controls (CEID/SxFy/unanswered)
* F6: Virtualized Data Table + selection sync + payload peek
* F7: Error/empty states + TZ toggle
* F8: Build + README + config notes (no Docker)

---

## 14) Runbook (local, no containers)

**Backend**

```bash
rustup show                      # ensure stable
cd backend
cargo run                        # runs axum service on :8080 (configure if needed)
```

**Frontend (Bun)**

```bash
cd frontend
bun install
echo 'VITE_API_BASE=http://localhost:8080' > .env.local
bun run dev                      # http://localhost:5173
```

**Smoke**

```bash
bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/event_flood.ndjson
# copy session_id and verify Arrow:
bun run scripts/verify_arrow.ts http://localhost:8080 <session_id>
```

---

