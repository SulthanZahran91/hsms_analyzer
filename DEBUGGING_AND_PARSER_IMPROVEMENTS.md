# Debugging and Parser Architecture Improvements

This document summarizes the improvements made to enhance debugging verbosity and simplify parser registration.

## Changes Overview

### 1. Enhanced Debugging and Logging

Comprehensive logging has been added throughout the entire application stack:

#### Backend Parser Layer
- **base_parser.rs**: Added logging to format detection and parser validation
- **All parsers (csv_parser.rs, json_parser.rs, ndjson_parser.rs)**:
  - Logs start/end of parsing operations
  - Logs each row/line being parsed with details (s, f values)
  - Detailed error messages with context (line numbers, problematic content)
  - Performance tracking for parsing operations

#### Backend Service Layer
- **routes.rs**: Enhanced logging for all API endpoints:
  - File upload tracking (filename, size, upload time)
  - Session creation and management
  - Parse operation start/completion with message counts
  - Search operations with filter details
  - Detailed error logging with full error context

#### Frontend Layer
- **remoteArrow.ts**: Comprehensive logging for all API calls:
  - Request logging (URLs, parameters, body)
  - Response timing (performance metrics)
  - Response status and size tracking
  - Detailed error messages with server response text
  - Success confirmations with data sizes

### 2. Simplified Parser Registration

The parser registration system has been completely refactored to minimize code changes when adding new parsers.

#### Before (Old System)
To add a new parser, you had to:
1. Create parser file (e.g., `xml_parser.rs`)
2. Export in `lib.rs` (2 lines)
3. **Manually modify `registry_parser.rs`** (edit the `new()` function)
4. Remember the exact pattern for registration

#### After (New System)
To add a new parser, you only need to:
1. Create parser file (e.g., `xml_parser.rs`)
2. Export in `lib.rs` (2 lines)
3. **Add one line to `parsers.rs`** in the clearly marked location

#### Key Improvements

**New File: `parsers.rs`**
- Central location for all parser registration
- Clear documentation on how to add parsers
- Simple function-based registration
- Optional macro for even cleaner registration

**Modified Files:**
- `base_parser.rs`: Added default `can_parse()` with logging, parsers now override `can_parse_impl()`
- `registry_parser.rs`: Now loads parsers from `parsers::all_parsers()`, no manual editing needed
- `lib.rs`: Added export for `parsers` module

**Documentation:**
- `ADDING_NEW_PARSERS.md`: Comprehensive guide with examples and templates
- Inline documentation in all modified files
- Step-by-step instructions with code examples

## Log Output Examples

### Backend Logs (Console)
```
[INFO] Initializing ParserRegistry
[INFO] Registered 3 parsers: ndjson, csv, json
[INFO] Received file upload request
[INFO] Receiving file: test_data.ndjson
[INFO] File data received: 45678 bytes
[INFO] Creating new session
[INFO] Created session: a1b2c3d4
[INFO] Starting parse with filename hint: test_data.ndjson
[INFO] Selected parser 'ndjson' for extension '.ndjson'
[DEBUG] Parser 'ndjson' can_parse check
[INFO] Starting NDJSON parsing
[DEBUG] Parsed message 1 successfully (s=6, f=11)
[DEBUG] Parsed message 2 successfully (s=1, f=3)
[INFO] NDJSON parsing complete: 2 messages parsed
[INFO] Successfully parsed 2 messages
[INFO] Converted 2 messages, starting ingestion
[INFO] Successfully ingested messages for session: a1b2c3d4
```

### Frontend Logs (Browser Console)
```
[RemoteDataSource] Creating session for file: test_data.ndjson (45678 bytes)
[RemoteDataSource] Uploading to: http://localhost:8080/sessions
[RemoteDataSource] Upload response received in 234.56ms, status: 200
[RemoteDataSource] Session created successfully: a1b2c3d4
[RemoteDataSource] Fetching metadata for session: a1b2c3d4
[RemoteDataSource] Metadata received: 2 rows, time range: 1698912734123000000 - 1698912735456000000
[RemoteDataSource] Fetching window for session: a1b2c3d4
[RemoteDataSource] Response received in 12.34ms, status: 200
[RemoteDataSource] Received 1024 bytes of Arrow data
[RemoteDataSource] Parsed Arrow table: 2 rows, 8 columns
```

### Error Logs Example
```
Backend:
[ERROR] Failed to parse JSON on line 5: expected value at line 1 column 1
[WARN] Problematic line content: {"ts_iso":"invalid-timestamp"...

Frontend:
[RemoteDataSource] Failed to create session: 400 Bad Request
Parse error: JSON parse error: expected value at line 1 column 1
```

## Adding a New Parser - Quick Reference

### 1. Create Parser File
```rust
// backend/parser/src/xml_parser.rs
use crate::{ParsedMessage, ParseError, base_parser::Parser};
use std::io::Read;
use tracing::{info, debug, error};

pub struct XmlParser;

impl Parser for XmlParser {
    fn name(&self) -> &'static str { "xml" }
    fn extensions(&self) -> &'static [&'static str] { &["xml"] }
    fn can_parse_impl(&self, data: &[u8]) -> bool {
        std::str::from_utf8(data).unwrap_or("").trim().starts_with("<?xml")
    }
    fn parse(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        info!("Starting XML parsing");
        // ... your parsing logic ...
        Ok(vec![])
    }
}
```

### 2. Export in lib.rs
```rust
pub mod xml_parser;
pub use xml_parser::XmlParser;
```

### 3. Register in parsers.rs
```rust
pub fn all_parsers() -> Vec<Box<dyn Parser>> {
    vec![
        Box::new(NdjsonParser) as Box<dyn Parser>,
        Box::new(CsvParser) as Box<dyn Parser>,
        Box::new(JsonParser) as Box<dyn Parser>,
        Box::new(XmlParser) as Box<dyn Parser>,  // <-- Just add this line!
    ]
}
```

**That's it!** No changes to `base_parser.rs`, `registry_parser.rs`, or any other files needed.

## Files Modified

### Backend Parser Crate
- ✅ `base_parser.rs` - Added logging, changed `can_parse()` to have default impl
- ✅ `registry_parser.rs` - Now uses `parsers::all_parsers()`
- ✅ `csv_parser.rs` - Added comprehensive logging
- ✅ `json_parser.rs` - Added comprehensive logging
- ✅ `ndjson_parser.rs` - Added comprehensive logging
- ✅ `lib.rs` - Added `parsers` module export
- ✅ `Cargo.toml` - Added `tracing` dependency
- ✨ `parsers.rs` - **NEW**: Central parser registration
- ✨ `ADDING_NEW_PARSERS.md` - **NEW**: Comprehensive guide

### Backend Service Crate
- ✅ `routes.rs` - Added logging to all endpoints with `#[instrument]` and detailed logs

### Frontend
- ✅ `datasource/remoteArrow.ts` - Added comprehensive logging for all API methods

### Documentation
- ✨ `DEBUGGING_AND_PARSER_IMPROVEMENTS.md` - **NEW**: This file

## Benefits

### Debugging Improvements
1. **Visibility**: Every operation is logged with context
2. **Performance**: Timing information for all operations
3. **Error Context**: Detailed error messages with line numbers and problematic content
4. **Troubleshooting**: Easy to trace issues through the entire stack

### Parser Architecture Improvements
1. **Simplicity**: Only 2 files to modify when adding a parser
2. **Clarity**: Clear, documented location for parser registration
3. **Maintainability**: No need to modify core files (`registry_parser.rs`, `base_parser.rs`)
4. **Documentation**: Comprehensive guide with examples and templates
5. **Safety**: Centralized registration reduces chance of errors

## Testing

### Verify Logging
1. Start backend: `cd backend/service && cargo run`
2. Upload a file through the web UI
3. Check console for detailed logs
4. Check browser console for frontend logs

### Verify Parser Registration
1. Add a test parser following `ADDING_NEW_PARSERS.md`
2. Run: `cargo test`
3. Verify parser appears in logs: `"Registered X parsers: ndjson, csv, json, yourparser"`

## Migration Notes

Existing parsers have been updated to use `can_parse_impl()` instead of `can_parse()`. The base `can_parse()` now provides automatic logging.

If you have custom parsers, rename `can_parse()` to `can_parse_impl()` in your implementation.

## Future Enhancements

Possible future improvements:
- [ ] Add log filtering by session ID
- [ ] Add metrics collection (parse times, file sizes)
- [ ] Create parser benchmark suite
- [ ] Add parser auto-discovery from directory
