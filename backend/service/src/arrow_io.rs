use crate::models::{ConvertedMessage, SessionMeta};
use arrow::array::{
    ArrayRef, Int64Array, Int8Array, UInt8Array, UInt32Array,
};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::ipc::writer::StreamWriter;
use arrow::record_batch::RecordBatch;
use std::collections::HashSet;
use std::fs::File;
use std::path::Path;
use std::sync::Arc;

pub const CHUNK_SIZE: usize = 50_000;

pub struct ArrowBuilder {
    ts_ns: Vec<i64>,
    dir: Vec<i8>,
    s: Vec<u8>,
    f: Vec<u8>,
    wbit: Vec<u8>,
    sysbytes: Vec<u32>,
    ceid: Vec<u32>,
    vid: Vec<u32>,
    rptid: Vec<u32>,
    row_id: Vec<u32>,
}

impl ArrowBuilder {
    pub fn new() -> Self {
        Self {
            ts_ns: Vec::with_capacity(CHUNK_SIZE),
            dir: Vec::with_capacity(CHUNK_SIZE),
            s: Vec::with_capacity(CHUNK_SIZE),
            f: Vec::with_capacity(CHUNK_SIZE),
            wbit: Vec::with_capacity(CHUNK_SIZE),
            sysbytes: Vec::with_capacity(CHUNK_SIZE),
            ceid: Vec::with_capacity(CHUNK_SIZE),
            vid: Vec::with_capacity(CHUNK_SIZE),
            rptid: Vec::with_capacity(CHUNK_SIZE),
            row_id: Vec::with_capacity(CHUNK_SIZE),
        }
    }
    
    pub fn push(&mut self, msg: &ConvertedMessage) {
        self.ts_ns.push(msg.ts_ns);
        self.dir.push(msg.dir);
        self.s.push(msg.s);
        self.f.push(msg.f);
        self.wbit.push(msg.wbit);
        self.sysbytes.push(msg.sysbytes);
        self.ceid.push(msg.ceid);
        self.vid.push(msg.vid);
        self.rptid.push(msg.rptid);
        self.row_id.push(msg.row_id);
    }
    
    pub fn len(&self) -> usize {
        self.ts_ns.len()
    }
    
    pub fn is_empty(&self) -> bool {
        self.ts_ns.is_empty()
    }
    
    pub fn clear(&mut self) {
        self.ts_ns.clear();
        self.dir.clear();
        self.s.clear();
        self.f.clear();
        self.wbit.clear();
        self.sysbytes.clear();
        self.ceid.clear();
        self.vid.clear();
        self.rptid.clear();
        self.row_id.clear();
    }
    
    pub fn build_batch(&self) -> Result<RecordBatch, arrow::error::ArrowError> {
        let schema = get_arrow_schema();

        let columns: Vec<ArrayRef> = vec![
            Arc::new(Int64Array::from(self.ts_ns.clone())),
            Arc::new(Int8Array::from(self.dir.clone())),
            Arc::new(UInt8Array::from(self.s.clone())),
            Arc::new(UInt8Array::from(self.f.clone())),
            Arc::new(UInt8Array::from(self.wbit.clone())),
            Arc::new(UInt32Array::from(self.sysbytes.clone())),
            Arc::new(UInt32Array::from(self.ceid.clone())),
            Arc::new(UInt32Array::from(self.vid.clone())),
            Arc::new(UInt32Array::from(self.rptid.clone())),
            Arc::new(UInt32Array::from(self.row_id.clone())),
        ];

        RecordBatch::try_new(schema, columns)
    }
}

pub fn get_arrow_schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("ts_ns", DataType::Int64, false),
        Field::new("dir", DataType::Int8, false),
        Field::new("s", DataType::UInt8, false),
        Field::new("f", DataType::UInt8, false),
        Field::new("wbit", DataType::UInt8, false),
        Field::new("sysbytes", DataType::UInt32, false),
        Field::new("ceid", DataType::UInt32, false),
        Field::new("vid", DataType::UInt32, false),
        Field::new("rptid", DataType::UInt32, false),
        Field::new("row_id", DataType::UInt32, false),
    ]))
}

pub fn write_arrow_chunk(
    batch: &RecordBatch,
    path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let mut writer = StreamWriter::try_new(file, &batch.schema())?;
    writer.write(batch)?;
    writer.finish()?;
    Ok(())
}

pub struct MetaCollector {
    pub row_count: usize,
    pub t_min_ns: i64,
    pub t_max_ns: i64,
    pub distinct_s: HashSet<u8>,
    pub distinct_f: HashSet<u8>,
    pub distinct_ceid: HashSet<u32>,
    pub distinct_vid: HashSet<u32>,
    pub distinct_rptid: HashSet<u32>,
}

impl MetaCollector {
    pub fn new() -> Self {
        Self {
            row_count: 0,
            t_min_ns: i64::MAX,
            t_max_ns: i64::MIN,
            distinct_s: HashSet::new(),
            distinct_f: HashSet::new(),
            distinct_ceid: HashSet::new(),
            distinct_vid: HashSet::new(),
            distinct_rptid: HashSet::new(),
        }
    }
    
    pub fn update(&mut self, msg: &ConvertedMessage) {
        self.row_count += 1;
        self.t_min_ns = self.t_min_ns.min(msg.ts_ns);
        self.t_max_ns = self.t_max_ns.max(msg.ts_ns);
        self.distinct_s.insert(msg.s);
        self.distinct_f.insert(msg.f);
        if msg.ceid > 0 {
            self.distinct_ceid.insert(msg.ceid);
        }
        if msg.vid > 0 {
            self.distinct_vid.insert(msg.vid);
        }
        if msg.rptid > 0 {
            self.distinct_rptid.insert(msg.rptid);
        }
    }
    
    pub fn into_meta(self) -> SessionMeta {
        let mut s_vec: Vec<u8> = self.distinct_s.into_iter().collect();
        s_vec.sort_unstable();

        let mut f_vec: Vec<u8> = self.distinct_f.into_iter().collect();
        f_vec.sort_unstable();

        let mut ceid_vec: Vec<u32> = self.distinct_ceid.into_iter().collect();
        ceid_vec.sort_unstable();

        let mut vid_vec: Vec<u32> = self.distinct_vid.into_iter().collect();
        vid_vec.sort_unstable();

        let mut rptid_vec: Vec<u32> = self.distinct_rptid.into_iter().collect();
        rptid_vec.sort_unstable();

        SessionMeta {
            row_count: self.row_count,
            t_min_ns: if self.row_count > 0 { self.t_min_ns } else { 0 },
            t_max_ns: if self.row_count > 0 { self.t_max_ns } else { 0 },
            distinct_s: s_vec,
            distinct_f: f_vec,
            distinct_ceid: ceid_vec,
            distinct_vid: vid_vec,
            distinct_rptid: rptid_vec,
        }
    }
}
