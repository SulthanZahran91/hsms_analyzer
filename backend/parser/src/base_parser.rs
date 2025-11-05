use crate::{ParsedMessage, ParseError};
use std::io::Read;

/// Base trait that all parsers must implement
/// Uses Box<dyn Read> to be object-safe (dyn compatible)
pub trait Parser: Send + Sync {
    /// Returns the name of this parser (e.g., "ndjson", "csv", "json")
    fn name(&self) -> &'static str;
    
    /// Returns the file extensions this parser supports (e.g., ["ndjson", "jsonl"])
    fn extensions(&self) -> &'static [&'static str];
    
    /// Checks if this parser can handle the given data by inspecting content
    fn can_parse(&self, data: &[u8]) -> bool;
    
    /// Parse the data from a reader
    /// Returns a Vec for simplicity (can be optimized to iterator later if needed)
    fn parse(&self, reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError>;
}

/// Helper to detect format from content
pub fn detect_format(data: &[u8]) -> FormatHint {
    let sample = std::str::from_utf8(data).unwrap_or("");
    let trimmed = sample.trim();
    
    // Check for CSV (starts with header or has comma-separated values)
    if trimmed.starts_with("ts_iso,") || trimmed.contains(",dir,") {
        return FormatHint::Csv;
    }
    
    // Check for NDJSON (lines starting with {)
    if trimmed.starts_with('{') && trimmed.lines().count() > 1 {
        let first_line = trimmed.lines().next().unwrap_or("");
        if first_line.trim_end().ends_with('}') {
            return FormatHint::Ndjson;
        }
    }
    
    // Check for JSON array
    if trimmed.starts_with('[') {
        return FormatHint::Json;
    }
    
    FormatHint::Unknown
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FormatHint {
    Csv,
    Ndjson,
    Json,
    Unknown,
}

