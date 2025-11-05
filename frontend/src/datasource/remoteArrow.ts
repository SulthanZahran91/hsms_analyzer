import { tableFromIPC, type Table } from 'apache-arrow';
import type { DataSource, SessionMeta, FilterExpr, HighlightExpr } from '../lib/types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export class RemoteDataSource implements DataSource {
  async createSession(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const data = await response.json();
    return data.session_id;
  }

  async getMeta(sessionId: string): Promise<SessionMeta> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/meta`);

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    return response.json();
  }

  async fetchWindow(
    sessionId: string,
    query: { from_ns?: number; to_ns?: number; limit?: number; cursor?: number } = {}
  ): Promise<Table> {
    const params = new URLSearchParams();
    if (query.from_ns !== undefined) params.append('from_ns', query.from_ns.toString());
    if (query.to_ns !== undefined) params.append('to_ns', query.to_ns.toString());
    if (query.limit !== undefined) params.append('limit', query.limit.toString());
    if (query.cursor !== undefined) params.append('cursor', query.cursor.toString());

    const url = `${API_BASE}/sessions/${sessionId}/messages.arrow?${params}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.apache.arrow.stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return tableFromIPC(new Uint8Array(buffer));
  }

  async search(
    sessionId: string,
    filter: FilterExpr,
    highlight?: HighlightExpr
  ): Promise<Table> {
    const body: any = { ...filter };
    if (highlight) {
      body.highlight = highlight;
    }

    const response = await fetch(`${API_BASE}/sessions/${sessionId}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.apache.arrow.stream',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return tableFromIPC(new Uint8Array(buffer));
  }

  async getPayload(sessionId: string, rowId: number): Promise<any> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/payload/${rowId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch payload: ${response.statusText}`);
    }

    return response.json();
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }
  }
}

