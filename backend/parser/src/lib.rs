// Parser crate for HSMS log files
// Refactored with base parser trait and registry pattern

pub mod types;
pub mod base_parser;
pub mod registry_parser;

// Individual parser implementations
pub mod csv_parser;
pub mod ndjson_parser;
pub mod json_parser;

// Legacy compatibility - keep old function names
pub mod ndjson {
    use crate::{ParsedMessage, ParseError, ndjson_parser::NdjsonParser, base_parser::Parser};
    use std::io::BufRead;
    
    /// Legacy function for backward compatibility
    pub fn parse_ndjson<R: BufRead + 'static>(reader: R) -> impl Iterator<Item = Result<ParsedMessage, ParseError>> {
        let parser = NdjsonParser;
        
        // Convert to Vec then into_iter for now (can optimize later)
        match parser.parse(Box::new(reader)) {
            Ok(messages) => {
                let results: Vec<Result<ParsedMessage, ParseError>> = 
                    messages.into_iter().map(Ok).collect();
                results.into_iter()
            }
            Err(e) => {
                vec![Err(e)].into_iter()
            }
        }
    }
}

// Re-export main types
pub use types::*;
pub use base_parser::{Parser, FormatHint};
pub use registry_parser::ParserRegistry;

// Re-export parsers
pub use csv_parser::CsvParser;
pub use ndjson_parser::NdjsonParser;
pub use json_parser::JsonParser;

