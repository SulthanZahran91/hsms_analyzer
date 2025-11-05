import { tableFromIPC, type Table } from 'apache-arrow';
import type { DataSource, SessionMeta, FilterExpr, HighlightExpr } from '../lib/types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export class RemoteDataSource implements DataSource {
  async createSession(file: File): Promise<string> {
    console.log(`[RemoteDataSource] Creating session for file: ${file.name} (${file.size} bytes)`);
    const formData = new FormData();
    formData.append('file', file);

    console.log(`[RemoteDataSource] Uploading to: ${API_BASE}/sessions`);
    const startTime = performance.now();

    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      body: formData,
    });

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`[RemoteDataSource] Upload response received in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RemoteDataSource] Failed to create session: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to create session: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[RemoteDataSource] Session created successfully: ${data.session_id}`);
    return data.session_id;
  }

  async getMeta(sessionId: string): Promise<SessionMeta> {
    console.log(`[RemoteDataSource] Fetching metadata for session: ${sessionId}`);
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/meta`);

    if (!response.ok) {
      console.error(`[RemoteDataSource] Failed to fetch metadata: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    const meta = await response.json();
    console.log(`[RemoteDataSource] Metadata received: ${meta.row_count} rows, time range: ${meta.time_range_ns?.from_ns} - ${meta.time_range_ns?.to_ns}`);
    return meta;
  }

  async fetchWindow(
    sessionId: string,
    query: { from_ns?: number; to_ns?: number; limit?: number; cursor?: number } = {}
  ): Promise<Table> {
    console.log(`[RemoteDataSource] Fetching window for session: ${sessionId}`, query);
    const params = new URLSearchParams();
    if (query.from_ns !== undefined) params.append('from_ns', query.from_ns.toString());
    if (query.to_ns !== undefined) params.append('to_ns', query.to_ns.toString());
    if (query.limit !== undefined) params.append('limit', query.limit.toString());
    if (query.cursor !== undefined) params.append('cursor', query.cursor.toString());

    const url = `${API_BASE}/sessions/${sessionId}/messages.arrow?${params}`;
    console.log(`[RemoteDataSource] Fetching from: ${url}`);

    const startTime = performance.now();
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.apache.arrow.stream',
      },
    });

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`[RemoteDataSource] Response received in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      console.error(`[RemoteDataSource] Failed to fetch messages: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    console.log(`[RemoteDataSource] Received ${buffer.byteLength} bytes of Arrow data`);

    const table = tableFromIPC(new Uint8Array(buffer));
    console.log(`[RemoteDataSource] Parsed Arrow table: ${table.numRows} rows, ${table.numCols} columns`);
    return table;
  }

  async search(
    sessionId: string,
    filter: FilterExpr,
    highlight?: HighlightExpr
  ): Promise<Table> {
    console.log(`[RemoteDataSource] Searching session: ${sessionId}`, { filter, highlight });
    const body: any = { ...filter };
    if (highlight) {
      body.highlight = highlight;
    }

    console.log(`[RemoteDataSource] Search request body:`, JSON.stringify(body, null, 2));
    const startTime = performance.now();

    const response = await fetch(`${API_BASE}/sessions/${sessionId}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.apache.arrow.stream',
      },
      body: JSON.stringify(body),
    });

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`[RemoteDataSource] Search response received in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RemoteDataSource] Search failed: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Search failed: ${response.statusText} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    console.log(`[RemoteDataSource] Received ${buffer.byteLength} bytes of search results`);

    const table = tableFromIPC(new Uint8Array(buffer));
    console.log(`[RemoteDataSource] Search complete: ${table.numRows} matching rows`);
    return table;
  }

  async getPayload(sessionId: string, rowId: number): Promise<any> {
    console.log(`[RemoteDataSource] Fetching payload for session: ${sessionId}, row: ${rowId}`);
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/payload/${rowId}`);

    if (!response.ok) {
      console.error(`[RemoteDataSource] Failed to fetch payload: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch payload: ${response.statusText}`);
    }

    const payload = await response.json();
    console.log(`[RemoteDataSource] Payload received for row ${rowId}`);
    return payload;
  }

  async deleteSession(sessionId: string): Promise<void> {
    console.log(`[RemoteDataSource] Deleting session: ${sessionId}`);
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      console.error(`[RemoteDataSource] Failed to delete session: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }

    console.log(`[RemoteDataSource] Session deleted: ${sessionId}`);
  }
}

