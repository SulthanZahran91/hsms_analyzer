use crate::{ParsedMessage, ParseError, base_parser::Parser};
use csv::Reader;
use serde::Deserialize;
use std::io::Read;

#[derive(Debug, Deserialize)]
struct CsvRecord {
    ts_iso: String,
    dir: String,
    s: u8,
    f: u8,
    wbit: u8,
    sysbytes: u32,
    #[serde(default)]
    ceid: u32,
    body_json: String,
}

/// CSV parser - handles CSV format with body_json as JSON string column
pub struct CsvParser;

impl Parser for CsvParser {
    fn name(&self) -> &'static str {
        "csv"
    }
    
    fn extensions(&self) -> &'static [&'static str] {
        &["csv"]
    }
    
    fn can_parse(&self, data: &[u8]) -> bool {
        let sample = std::str::from_utf8(data).unwrap_or("");
        let trimmed = sample.trim();
        
        // Check for CSV header
        trimmed.starts_with("ts_iso,") || trimmed.contains(",dir,") || trimmed.contains(",s,f,")
    }
    
    fn parse(&self, reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        let mut csv_reader = Reader::from_reader(reader);
        let mut messages = Vec::new();
        
        for record_result in csv_reader.deserialize::<CsvRecord>() {
            let record = record_result?;
            
            // Parse the body_json string as JSON
            let body_json: serde_json::Value = serde_json::from_str(&record.body_json)?;
            
            messages.push(ParsedMessage {
                ts_iso: record.ts_iso,
                dir: record.dir,
                s: record.s,
                f: record.f,
                wbit: record.wbit,
                sysbytes: record.sysbytes,
                ceid: record.ceid,
                body_json,
            });
        }
        
        Ok(messages)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_parse_basic_csv() {
        let parser = CsvParser;
        let data = r#"ts_iso,dir,s,f,wbit,sysbytes,ceid,body_json
2025-11-03T09:12:14.123Z,E->H,6,11,0,12345,201,"{""secs_tree"":{""t"":""L"",""items"":[]}}"
2025-11-03T09:12:15.456Z,H->E,1,3,1,12346,0,"{""semantic"":{""kind"":""EventReport""}}"#;
        
        let cursor = Cursor::new(data);
        let messages = parser.parse(Box::new(cursor)).unwrap();
        
        assert_eq!(messages.len(), 2);
        
        let msg1 = &messages[0];
        assert_eq!(msg1.s, 6);
        assert_eq!(msg1.f, 11);
        assert_eq!(msg1.dir, "E->H");
    }
}
