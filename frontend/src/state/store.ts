import { create } from 'zustand';
import type { SessionMeta, FilterExpr, HighlightExpr, MessageRow, Timezone } from '../lib/types';
import type { Table } from 'apache-arrow';

interface AppState {
  // Session
  sessionId: string | null;
  meta: SessionMeta | null;
  
  // Data
  table: Table | null;
  filteredRows: MessageRow[];
  
  // Filters
  filter: FilterExpr;
  highlight: HighlightExpr;
  
  // UI
  selectedRowId: number | null;
  payload: any | null;
  timezone: Timezone;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setSessionId: (id: string | null) => void;
  setMeta: (meta: SessionMeta | null) => void;
  setTable: (table: Table | null) => void;
  setFilteredRows: (rows: MessageRow[]) => void;
  setFilter: (filter: Partial<FilterExpr>) => void;
  setHighlight: (highlight: Partial<HighlightExpr>) => void;
  setSelectedRowId: (id: number | null) => void;
  setPayload: (payload: any | null) => void;
  setTimezone: (tz: Timezone) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialFilter: FilterExpr = {
  time: { from_ns: 0, to_ns: 0 },
  dir: 0,
  s: [],
  f: [],
  ceid: [],
  text: '',
};

const initialHighlight: HighlightExpr = {
  ceid: [],
  sxfy: [],
  unanswered: false,
};

export const useStore = create<AppState>((set) => ({
  sessionId: null,
  meta: null,
  table: null,
  filteredRows: [],
  filter: initialFilter,
  highlight: initialHighlight,
  selectedRowId: null,
  payload: null,
  timezone: 'Asia/Jakarta',
  isLoading: false,
  error: null,

  setSessionId: (id) => set({ sessionId: id }),
  setMeta: (meta) => set({ meta }),
  setTable: (table) => set({ table }),
  setFilteredRows: (rows) => set({ filteredRows: rows }),
  setFilter: (partialFilter) =>
    set((state) => ({ filter: { ...state.filter, ...partialFilter } })),
  setHighlight: (partialHighlight) =>
    set((state) => ({ highlight: { ...state.highlight, ...partialHighlight } })),
  setSelectedRowId: (id) => set({ selectedRowId: id }),
  setPayload: (payload) => set({ payload }),
  setTimezone: (tz) => set({ timezone: tz }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      sessionId: null,
      meta: null,
      table: null,
      filteredRows: [],
      filter: initialFilter,
      highlight: initialHighlight,
      selectedRowId: null,
      payload: null,
      error: null,
    }),
}));

