use crate::{ParsedMessage, ParseError, base_parser::Parser};
use std::io::{BufRead, BufReader, Read};

/// NDJSON parser - handles newline-delimited JSON format
pub struct NdjsonParser;

impl Parser for NdjsonParser {
    fn name(&self) -> &'static str {
        "ndjson"
    }
    
    fn extensions(&self) -> &'static [&'static str] {
        &["ndjson", "jsonl"]
    }
    
    fn can_parse(&self, data: &[u8]) -> bool {
        let sample = std::str::from_utf8(data).unwrap_or("");
        let trimmed = sample.trim();
        
        // Check if it starts with { and has multiple lines
        if !trimmed.starts_with('{') {
            return false;
        }
        
        // Check if first line is valid JSON object
        if let Some(first_line) = trimmed.lines().next() {
            first_line.trim_end().ends_with('}') && 
            serde_json::from_str::<serde_json::Value>(first_line).is_ok()
        } else {
            false
        }
    }
    
    fn parse(&self, reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        let buf_reader = BufReader::new(reader);
        let mut messages = Vec::new();
        
        for line_result in buf_reader.lines() {
            let line = line_result?;
            let line = line.trim();
            
            if line.is_empty() {
                continue;
            }
            
            let msg: ParsedMessage = serde_json::from_str(&line)?;
            messages.push(msg);
        }
        
        Ok(messages)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_ndjson_can_parse() {
        let parser = NdjsonParser;
        
        let valid = r#"{"ts_iso":"2025-11-03T09:12:14.123Z","dir":"E->H","s":6,"f":11,"wbit":0,"sysbytes":12345}
{"ts_iso":"2025-11-03T09:12:15.456Z","dir":"H->E","s":1,"f":3,"wbit":1,"sysbytes":12346}"#;
        
        assert!(parser.can_parse(valid.as_bytes()));
        
        let invalid = "ts_iso,dir,s,f\n1,2,3,4";
        assert!(!parser.can_parse(invalid.as_bytes()));
    }

    #[test]
    fn test_ndjson_parse() {
        let parser = NdjsonParser;
        let data = r#"{"ts_iso":"2025-11-03T09:12:14.123Z","dir":"E->H","s":6,"f":11,"wbit":0,"sysbytes":12345,"ceid":201,"body_json":{"secs_tree":{"t":"L","items":[]}}}
{"ts_iso":"2025-11-03T09:12:15.456Z","dir":"H->E","s":1,"f":3,"wbit":1,"sysbytes":12346,"body_json":{"semantic":{"kind":"EventReport"}}}"#;
        
        let cursor = Cursor::new(data);
        let messages = parser.parse(Box::new(cursor)).unwrap();
        
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].s, 6);
        assert_eq!(messages[0].f, 11);
        assert_eq!(messages[0].dir, "E->H");
    }
}

