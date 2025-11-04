use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMessage {
    pub ts_iso: String,
    pub dir: String,
    pub s: u8,
    pub f: u8,
    pub wbit: u8,
    pub sysbytes: u32,
    #[serde(default)]
    pub ceid: u32,
    pub body_json: serde_json::Value,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("CSV parse error: {0}")]
    Csv(#[from] csv::Error),
    #[error("Invalid timestamp: {0}")]
    InvalidTimestamp(String),
    #[error("Invalid direction: {0}")]
    InvalidDirection(String),
    #[error("Missing body_json")]
    MissingBodyJson,
}

