import type { Table } from 'apache-arrow';

export interface SessionMeta {
  row_count: number;
  t_min_ns: number;
  t_max_ns: number;
  distinct_s: number[];
  distinct_f: number[];
  distinct_ceid: number[];
}

export interface FilterExpr {
  time: {
    from_ns: number;
    to_ns: number;
  };
  dir: number; // 0=both, 1=H->E, -1=E->H
  s: number[];
  f: number[];
  ceid: number[];
  text: string;
}

export interface HighlightExpr {
  ceid: number[];
  sxfy: Array<{ s: number; f: number }>;
  unanswered: boolean;
}

export interface SearchRequest extends FilterExpr {
  highlight?: HighlightExpr;
}

export interface DataSource {
  createSession(file: File): Promise<string>;
  getMeta(sessionId: string): Promise<SessionMeta>;
  fetchWindow(
    sessionId: string,
    query: { from_ns?: number; to_ns?: number; limit?: number; cursor?: number }
  ): Promise<Table>;
  search(sessionId: string, filter: FilterExpr, highlight?: HighlightExpr): Promise<Table>;
  getPayload(sessionId: string, rowId: number): Promise<any>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface MessageRow {
  ts_ns: bigint;
  dir: number;
  s: number;
  f: number;
  wbit: number;
  sysbytes: number;
  ceid: number;
  row_id: number;
}

export type Timezone = 'Asia/Jakarta' | 'UTC';

