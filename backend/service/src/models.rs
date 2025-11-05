use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    pub row_count: usize,
    pub t_min_ns: i64,
    pub t_max_ns: i64,
    pub distinct_s: Vec<u8>,
    pub distinct_f: Vec<u8>,
    pub distinct_ceid: Vec<u32>,
    pub distinct_vid: Vec<u32>,
    pub distinct_rptid: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterExpr {
    #[serde(default)]
    pub time: TimeFilter,
    #[serde(default)]
    pub dir: i8,  // 0=both, 1=H->E, -1=E->H
    #[serde(default)]
    pub s: Vec<u8>,
    #[serde(default)]
    pub f: Vec<u8>,
    #[serde(default)]
    pub ceid: Vec<u32>,
    #[serde(default)]
    pub vid: Vec<u32>,
    #[serde(default)]
    pub rptid: Vec<u32>,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TimeFilter {
    #[serde(default)]
    pub from_ns: i64,
    #[serde(default)]
    pub to_ns: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightExpr {
    #[serde(default)]
    pub ceid: Vec<u32>,
    #[serde(default)]
    pub vid: Vec<u32>,
    #[serde(default)]
    pub rptid: Vec<u32>,
    #[serde(default)]
    pub sxfy: Vec<SxFy>,
    #[serde(default)]
    pub unanswered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxFy {
    pub s: u8,
    pub f: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    #[serde(flatten)]
    pub filter: FilterExpr,
    #[serde(default)]
    pub highlight: Option<HighlightExpr>,
}

/// Converted message ready for Arrow storage
#[derive(Debug, Clone)]
pub struct ConvertedMessage {
    pub ts_ns: i64,
    pub dir: i8,
    pub s: u8,
    pub f: u8,
    pub wbit: u8,
    pub sysbytes: u32,
    pub ceid: u32,
    pub vid: u32,
    pub rptid: u32,
    pub row_id: u32,
    pub body_json: serde_json::Value,
}

impl ConvertedMessage {
    pub fn from_parsed(msg: parser::ParsedMessage, row_id: u32) -> Result<Self, String> {
        // Parse ISO timestamp to nanoseconds
        let ts_ns = parse_timestamp(&msg.ts_iso)?;
        
        // Convert direction string to int8
        let dir = match msg.dir.as_str() {
            "H->E" => 1,
            "E->H" => -1,
            _ => return Err(format!("Invalid direction: {}", msg.dir)),
        };
        
        Ok(ConvertedMessage {
            ts_ns,
            dir,
            s: msg.s,
            f: msg.f,
            wbit: msg.wbit,
            sysbytes: msg.sysbytes,
            ceid: msg.ceid,
            vid: msg.vid,
            rptid: msg.rptid,
            row_id,
            body_json: msg.body_json,
        })
    }
}

fn parse_timestamp(ts_iso: &str) -> Result<i64, String> {
    use chrono::{DateTime, Utc};
    
    let dt = DateTime::parse_from_rfc3339(ts_iso)
        .map_err(|e| format!("Invalid timestamp {}: {}", ts_iso, e))?;
    
    Ok(dt.with_timezone(&Utc).timestamp_nanos_opt()
        .ok_or_else(|| format!("Timestamp out of range: {}", ts_iso))?)
}
