use crate::{ParsedMessage, ParseError, base_parser::Parser};
use std::io::Read;
use tracing::{info, error};

/// JSON parser - handles regular JSON array format
/// Example: [{"ts_iso": "...", ...}, {"ts_iso": "...", ...}]
pub struct JsonParser;

impl Parser for JsonParser {
    fn name(&self) -> &'static str {
        "json"
    }

    fn extensions(&self) -> &'static [&'static str] {
        &["json"]
    }

    fn can_parse_impl(&self, data: &[u8]) -> bool {
        let sample = std::str::from_utf8(data).unwrap_or("");
        let trimmed = sample.trim();

        // Check if it's a JSON array
        trimmed.starts_with('[')
    }

    fn parse(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        info!("Starting JSON array parsing");
        let mut buffer = Vec::new();

        if let Err(e) = reader.read_to_end(&mut buffer) {
            error!("Failed to read JSON data: {}", e);
            return Err(e.into());
        }

        info!("Read {} bytes of JSON data", buffer.len());

        match serde_json::from_slice::<Vec<ParsedMessage>>(&buffer) {
            Ok(messages) => {
                info!("JSON parsing complete: {} messages parsed", messages.len());
                Ok(messages)
            }
            Err(e) => {
                error!("Failed to parse JSON array: {}", e);
                Err(e.into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_json_can_parse() {
        let parser = JsonParser;
        
        let valid = r#"[{"ts_iso":"2025-11-03T09:12:14.123Z","dir":"E->H"}]"#;
        assert!(parser.can_parse(valid.as_bytes()));
        
        let invalid = r#"{"ts_iso":"2025-11-03T09:12:14.123Z"}"#;
        assert!(!parser.can_parse(invalid.as_bytes()));
    }

    #[test]
    fn test_json_parse() {
        let parser = JsonParser;
        let data = r#"[
            {"ts_iso":"2025-11-03T09:12:14.123Z","dir":"E->H","s":6,"f":11,"wbit":0,"sysbytes":12345,"ceid":201,"body_json":{"secs_tree":{"t":"L","items":[]}}},
            {"ts_iso":"2025-11-03T09:12:15.456Z","dir":"H->E","s":1,"f":3,"wbit":1,"sysbytes":12346,"body_json":{"semantic":{"kind":"EventReport"}}}
        ]"#;
        
        let cursor = Cursor::new(data);
        let messages = parser.parse(Box::new(cursor)).unwrap();
        
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].s, 6);
        assert_eq!(messages[0].dir, "E->H");
    }
}

