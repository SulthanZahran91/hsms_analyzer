use crate::{ParsedMessage, ParseError, base_parser::{Parser, FormatHint, detect_format}};
use crate::{CsvParser, NdjsonParser, JsonParser};
use std::io::{Read, Cursor};

/// ParserRegistry - manages available parsers and auto-detects format
pub struct ParserRegistry {
    parsers: Vec<Box<dyn Parser>>,
}

impl ParserRegistry {
    /// Create a new registry with all built-in parsers
    pub fn new() -> Self {
        Self {
            parsers: vec![
                Box::new(NdjsonParser),
                Box::new(CsvParser),
                Box::new(JsonParser),
            ],
        }
    }
    
    /// Register a custom parser
    pub fn register(&mut self, parser: Box<dyn Parser>) {
        self.parsers.push(parser);
    }
    
    /// Get parser by name
    pub fn get_parser(&self, name: &str) -> Option<&dyn Parser> {
        self.parsers.iter()
            .find(|p| p.name() == name)
            .map(|p| p.as_ref())
    }
    
    /// Get parser by file extension
    pub fn get_parser_by_extension(&self, extension: &str) -> Option<&dyn Parser> {
        self.parsers.iter()
            .find(|p| p.extensions().contains(&extension))
            .map(|p| p.as_ref())
    }
    
    /// Auto-detect and parse data
    pub fn parse_auto(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        // Read a sample to detect format
        let mut sample = vec![0u8; 512];
        let bytes_read = reader.read(&mut sample)?;
        sample.truncate(bytes_read);
        
        // Try to detect format
        let format = detect_format(&sample);
        
        // Try parsers in order based on hint
        let parser = match format {
            FormatHint::Csv => self.get_parser("csv"),
            FormatHint::Ndjson => self.get_parser("ndjson"),
            FormatHint::Json => self.get_parser("json"),
            FormatHint::Unknown => {
                // Try each parser's can_parse method
                self.parsers.iter()
                    .find(|p| p.can_parse(&sample))
                    .map(|p| p.as_ref())
            }
        };
        
        if let Some(parser) = parser {
            // Combine sample with rest of reader
            let combined = Box::new(CombinedReader::new(sample, reader));
            parser.parse(combined)
        } else {
            Err(ParseError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Unable to detect format"
            )))
        }
    }
    
    /// Parse with explicit format hint (filename extension)
    pub fn parse_with_hint(
        &self,
        reader: Box<dyn Read>,
        filename: &str,
    ) -> Result<Vec<ParsedMessage>, ParseError> {
        // Extract extension
        let extension = filename.rsplit('.').next().unwrap_or("");
        
        if let Some(parser) = self.get_parser_by_extension(extension) {
            parser.parse(reader)
        } else {
            // Fall back to auto-detection
            self.parse_auto(reader)
        }
    }
}

impl Default for ParserRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper to combine sample bytes with remaining reader
struct CombinedReader {
    sample: Cursor<Vec<u8>>,
    reader: Box<dyn Read>,
    reading_sample: bool,
}

impl CombinedReader {
    fn new(sample: Vec<u8>, reader: Box<dyn Read>) -> Self {
        Self {
            sample: Cursor::new(sample),
            reader,
            reading_sample: true,
        }
    }
}

impl Read for CombinedReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.reading_sample {
            let bytes_read = self.sample.read(buf)?;
            if bytes_read == 0 {
                // Sample exhausted, switch to underlying reader
                self.reading_sample = false;
                self.reader.read(buf)
            } else {
                Ok(bytes_read)
            }
        } else {
            self.reader.read(buf)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_registry_auto_detect_ndjson() {
        let registry = ParserRegistry::new();
        let data = r#"{"ts_iso":"2025-11-03T09:12:14.123Z","dir":"E->H","s":6,"f":11,"wbit":0,"sysbytes":12345,"ceid":201,"body_json":{"secs_tree":{"t":"L","items":[]}}}
{"ts_iso":"2025-11-03T09:12:15.456Z","dir":"H->E","s":1,"f":3,"wbit":1,"sysbytes":12346,"body_json":{"semantic":{"kind":"EventReport"}}}"#;
        
        let cursor = Cursor::new(data);
        let messages = registry.parse_auto(Box::new(cursor)).unwrap();
        
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].s, 6);
    }

    #[test]
    fn test_registry_parse_with_hint_csv() {
        let registry = ParserRegistry::new();
        let data = r#"ts_iso,dir,s,f,wbit,sysbytes,ceid,body_json
2025-11-03T09:12:14.123Z,E->H,6,11,0,12345,201,"{""secs_tree"":{""t"":""L"",""items"":[]}}"#;
        
        let cursor = Cursor::new(data);
        let messages = registry.parse_with_hint(Box::new(cursor), "test.csv").unwrap();
        
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].s, 6);
    }
}

