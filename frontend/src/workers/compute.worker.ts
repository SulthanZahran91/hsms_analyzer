/// <reference lib="webworker" />

import type { Table } from 'apache-arrow';
import type { FilterExpr, HighlightExpr, MessageRow } from '../lib/types';

interface ComputeMessage {
  type: 'filter' | 'extract';
  table?: Table;
  filter?: FilterExpr;
  highlight?: HighlightExpr;
}

interface ComputeResult {
  type: 'filtered' | 'extracted';
  rows?: MessageRow[];
  indices?: number[];
  distinctS?: number[];
  distinctF?: number[];
  distinctCeid?: number[];
}

self.onmessage = (e: MessageEvent<ComputeMessage>) => {
  const { type, table, filter } = e.data;

  if (type === 'filter' && table && filter) {
    const result = applyFilter(table, filter);
    self.postMessage(result);
  } else if (type === 'extract' && table) {
    const result = extractRows(table);
    self.postMessage(result);
  }
};

function applyFilter(table: Table, filter: FilterExpr): ComputeResult {
  const rowCount = table.numRows;
  const indices: number[] = [];
  
  const tsCol = table.getChild('ts_ns')!;
  const dirCol = table.getChild('dir')!;
  const sCol = table.getChild('s')!;
  const fCol = table.getChild('f')!;
  const ceidCol = table.getChild('ceid')!;
  const vidCol = table.getChild('vid')!;
  const rptidCol = table.getChild('rptid')!;

  const distinctS = new Set<number>();
  const distinctF = new Set<number>();
  const distinctCeid = new Set<number>();

  for (let i = 0; i < rowCount; i++) {
    const ts_ns = tsCol.get(i) as bigint;
    const dir = dirCol.get(i) as number;
    const s = sCol.get(i) as number;
    const f = fCol.get(i) as number;
    const ceid = ceidCol.get(i) as number;
    const vid = vidCol.get(i) as number;
    const rptid = rptidCol.get(i) as number;

    // Apply filters
    if (filter.dir !== 0 && filter.dir !== dir) continue;
    if (filter.s.length > 0 && !filter.s.includes(s)) continue;
    if (filter.f.length > 0 && !filter.f.includes(f)) continue;
    if (filter.ceid.length > 0 && !filter.ceid.includes(ceid)) continue;
    if (filter.vid.length > 0 && !filter.vid.includes(vid)) continue;
    if (filter.rptid.length > 0 && !filter.rptid.includes(rptid)) continue;
    
    if (filter.time.from_ns > 0 && Number(ts_ns) < filter.time.from_ns) continue;
    if (filter.time.to_ns > 0 && Number(ts_ns) > filter.time.to_ns) continue;

    indices.push(i);
    distinctS.add(s);
    distinctF.add(f);
    if (ceid > 0) distinctCeid.add(ceid);
  }

  return {
    type: 'filtered',
    indices,
    distinctS: Array.from(distinctS).sort((a, b) => a - b),
    distinctF: Array.from(distinctF).sort((a, b) => a - b),
    distinctCeid: Array.from(distinctCeid).sort((a, b) => a - b),
  };
}

function extractRows(table: Table): ComputeResult {
  const rowCount = table.numRows;
  const rows: MessageRow[] = [];

  const tsCol = table.getChild('ts_ns')!;
  const dirCol = table.getChild('dir')!;
  const sCol = table.getChild('s')!;
  const fCol = table.getChild('f')!;
  const wbitCol = table.getChild('wbit')!;
  const sysbytesCol = table.getChild('sysbytes')!;
  const ceidCol = table.getChild('ceid')!;
  const vidCol = table.getChild('vid')!;
  const rptidCol = table.getChild('rptid')!;
  const rowIdCol = table.getChild('row_id')!;

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      ts_ns: tsCol.get(i) as bigint,
      dir: dirCol.get(i) as number,
      s: sCol.get(i) as number,
      f: fCol.get(i) as number,
      wbit: wbitCol.get(i) as number,
      sysbytes: sysbytesCol.get(i) as number,
      ceid: ceidCol.get(i) as number,
      vid: vidCol.get(i) as number,
      rptid: rptidCol.get(i) as number,
      row_id: rowIdCol.get(i) as number,
    });
  }

  return {
    type: 'extracted',
    rows,
  };
}

export {};

