use crate::{ParsedMessage, ParseError, base_parser::{Parser, FormatHint, detect_format}};
use crate::parsers::all_parsers;
use std::io::{Read, Cursor};
use tracing::{debug, info, warn, error};

/// ParserRegistry - manages available parsers and auto-detects format
///
/// ## Adding a New Parser
///
/// To add a new parser, you only need to modify `parsers.rs`. No changes to this file are required!
/// See `parsers.rs` for instructions.
pub struct ParserRegistry {
    parsers: Vec<Box<dyn Parser>>,
}

impl ParserRegistry {
    /// Create a new registry with all parsers from the central registry
    ///
    /// Parsers are automatically loaded from `parsers::all_parsers()`.
    /// To add a new parser, modify `parsers.rs` instead of this file.
    pub fn new() -> Self {
        info!("Initializing ParserRegistry");
        let parsers = all_parsers();

        info!("Registered {} parsers: {}",
            parsers.len(),
            parsers.iter().map(|p| p.name()).collect::<Vec<_>>().join(", ")
        );

        Self { parsers }
    }
    
    /// Register a custom parser
    pub fn register(&mut self, parser: Box<dyn Parser>) {
        info!("Registering custom parser: {}", parser.name());
        debug!("Parser supports extensions: {:?}", parser.extensions());
        self.parsers.push(parser);
    }
    
    /// Get parser by name
    pub fn get_parser(&self, name: &str) -> Option<&dyn Parser> {
        debug!("Looking up parser by name: {}", name);
        let result = self.parsers.iter()
            .find(|p| p.name() == name)
            .map(|p| p.as_ref());

        if result.is_some() {
            debug!("Found parser: {}", name);
        } else {
            warn!("Parser not found: {}", name);
        }

        result
    }
    
    /// Get parser by file extension
    pub fn get_parser_by_extension(&self, extension: &str) -> Option<&dyn Parser> {
        debug!("Looking up parser by extension: {}", extension);
        let result = self.parsers.iter()
            .find(|p| p.extensions().contains(&extension))
            .map(|p| p.as_ref());

        if let Some(parser) = result {
            info!("Selected parser '{}' for extension '.{}'", parser.name(), extension);
        } else {
            warn!("No parser found for extension '.{}'", extension);
        }

        result
    }
    
    /// Auto-detect and parse data
    pub fn parse_auto(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        info!("Starting auto-detection of file format");

        // Read a sample to detect format
        let mut sample = vec![0u8; 512];
        let bytes_read = reader.read(&mut sample)?;
        sample.truncate(bytes_read);

        debug!("Read {} byte sample for format detection", bytes_read);

        // Try to detect format
        let format = detect_format(&sample);
        info!("Format hint from content analysis: {:?}", format);

        // Try parsers in order based on hint
        let parser = match format {
            FormatHint::Csv => {
                info!("Using CSV parser based on format hint");
                self.get_parser("csv")
            },
            FormatHint::Ndjson => {
                info!("Using NDJSON parser based on format hint");
                self.get_parser("ndjson")
            },
            FormatHint::Json => {
                info!("Using JSON parser based on format hint");
                self.get_parser("json")
            },
            FormatHint::Unknown => {
                warn!("Format unknown, trying parsers individually");
                // Try each parser's can_parse method
                self.parsers.iter()
                    .find(|p| {
                        let can_parse = p.can_parse(&sample);
                        debug!("Parser '{}' can_parse result: {}", p.name(), can_parse);
                        can_parse
                    })
                    .map(|p| p.as_ref())
            }
        };

        if let Some(parser) = parser {
            info!("Selected parser: {}", parser.name());
            // Combine sample with rest of reader
            let combined = Box::new(CombinedReader::new(sample, reader));
            parser.parse(combined)
        } else {
            error!("Unable to detect format - no suitable parser found");
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
        info!("Parsing file with hint: {}", filename);

        // Extract extension
        let extension = filename.rsplit('.').next().unwrap_or("");
        debug!("Extracted extension: '{}'", extension);

        if let Some(parser) = self.get_parser_by_extension(extension) {
            info!("Using parser '{}' for file '{}'", parser.name(), filename);
            parser.parse(reader)
        } else {
            warn!("No parser found for extension '{}', falling back to auto-detection", extension);
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

