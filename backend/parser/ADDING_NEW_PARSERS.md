# Adding New Parsers - Quick Guide

This guide shows you how to add a new custom parser to the HSMS analyzer with **minimal changes** to existing code.

## Overview

With the new parser architecture, adding a parser requires changes to only **2 files**:

1. **Create your parser** (new file)
2. **Register it in `parsers.rs`** (1 line change)

That's it! No need to modify `base_parser.rs`, `registry_parser.rs`, or any other core files.

---

## Step-by-Step Instructions

### Step 1: Create Your Parser File

Create a new file in `backend/parser/src/` named after your parser (e.g., `xml_parser.rs`).

**Template:**

```rust
use crate::{ParsedMessage, ParseError, base_parser::Parser};
use std::io::Read;
use tracing::{info, debug, error};

/// Your custom parser - describe what format it handles
pub struct XmlParser;

impl Parser for XmlParser {
    fn name(&self) -> &'static str {
        "xml"  // Unique name for this parser
    }

    fn extensions(&self) -> &'static [&'static str] {
        &["xml"]  // File extensions this parser supports
    }

    fn can_parse_impl(&self, data: &[u8]) -> bool {
        // Check if this parser can handle the data
        let sample = std::str::from_utf8(data).unwrap_or("");
        sample.trim().starts_with("<?xml")
    }

    fn parse(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        info!("Starting XML parsing");

        // Your parsing logic here
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer)?;

        // Parse the data and convert to Vec<ParsedMessage>
        // ...

        info!("XML parsing complete");
        Ok(vec![])  // Return parsed messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_xml_can_parse() {
        let parser = XmlParser;
        let valid = r#"<?xml version="1.0"?><messages></messages>"#;
        assert!(parser.can_parse_impl(valid.as_bytes()));
    }
}
```

### Step 2: Export Your Parser in `lib.rs`

Add two lines to `backend/parser/src/lib.rs`:

```rust
// Individual parser implementations
pub mod csv_parser;
pub mod ndjson_parser;
pub mod json_parser;
pub mod xml_parser;        // <-- Add this line

// Re-export parsers
pub use csv_parser::CsvParser;
pub use ndjson_parser::NdjsonParser;
pub use json_parser::JsonParser;
pub use xml_parser::XmlParser;  // <-- And this line
```

### Step 3: Register Your Parser in `parsers.rs`

Open `backend/parser/src/parsers.rs` and add **one line** to the `all_parsers()` function:

```rust
pub fn all_parsers() -> Vec<Box<dyn Parser>> {
    vec![
        Box::new(NdjsonParser) as Box<dyn Parser>,
        Box::new(CsvParser) as Box<dyn Parser>,
        Box::new(JsonParser) as Box<dyn Parser>,
        Box::new(XmlParser) as Box<dyn Parser>,  // <-- Add this line
    ]
}
```

**That's it!** Your parser is now registered and will be used automatically.

---

## The `ParsedMessage` Structure

Your parser must return a `Vec<ParsedMessage>`. Here's the structure:

```rust
pub struct ParsedMessage {
    pub ts_iso: String,         // ISO 8601 timestamp (e.g., "2025-11-03T09:12:14.123Z")
    pub dir: String,            // Direction: "H->E" or "E->H"
    pub s: u8,                  // Stream number
    pub f: u8,                  // Function number
    pub wbit: u8,               // Wait bit (0 or 1)
    pub sysbytes: u32,          // System bytes
    pub ceid: u32,              // Collection Event ID (use 0 if not applicable)
    pub body_json: serde_json::Value,  // Message payload as JSON
}
```

---

## Error Handling

The `ParseError` enum provides common error types:

```rust
pub enum ParseError {
    Io(std::io::Error),           // File I/O errors
    Json(serde_json::Error),      // JSON parsing errors
    Csv(csv::Error),              // CSV parsing errors
    InvalidTimestamp(String),     // Timestamp format issues
    InvalidDirection(String),     // Direction format issues
    MissingBodyJson,              // Missing required body_json
}
```

Use `?` operator for automatic error conversion:

```rust
let data = reader.read_to_end(&mut buffer)?;  // Auto-converts to ParseError
let msg: ParsedMessage = serde_json::from_str(&line)?;  // Auto-converts
```

---

## Logging Best Practices

Use tracing for comprehensive logging:

```rust
use tracing::{info, debug, warn, error};

fn parse(&self, reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
    info!("Starting XML parsing");

    // Log progress
    debug!("Read {} bytes", buffer.len());

    // Log each parsed message
    for (idx, msg) in messages.iter().enumerate() {
        debug!("Parsed message {} (s={}, f={})", idx + 1, msg.s, msg.f);
    }

    // Log errors with context
    if let Err(e) = some_operation() {
        error!("Failed to parse element at line {}: {}", line_num, e);
        return Err(e.into());
    }

    info!("XML parsing complete: {} messages", messages.len());
    Ok(messages)
}
```

Logs will automatically appear in the backend console when running the service.

---

## Example: Complete Custom Parser

Here's a complete example for a hypothetical binary format:

```rust
// backend/parser/src/binary_parser.rs

use crate::{ParsedMessage, ParseError, base_parser::Parser};
use std::io::{Read, BufReader};
use tracing::{info, debug, error};

pub struct BinaryParser;

impl Parser for BinaryParser {
    fn name(&self) -> &'static str {
        "binary"
    }

    fn extensions(&self) -> &'static [&'static str] {
        &["bin", "dat"]
    }

    fn can_parse_impl(&self, data: &[u8]) -> bool {
        // Check for magic number (example: 0xDEADBEEF)
        data.len() >= 4 &&
        data[0] == 0xDE &&
        data[1] == 0xAD &&
        data[2] == 0xBE &&
        data[3] == 0xEF
    }

    fn parse(&self, mut reader: Box<dyn Read>) -> Result<Vec<ParsedMessage>, ParseError> {
        info!("Starting binary format parsing");

        let mut messages = Vec::new();
        let mut buffer = Vec::new();
        reader.read_to_end(&mut buffer)?;

        debug!("Read {} bytes of binary data", buffer.len());

        // Skip magic number
        let mut offset = 4;
        let mut msg_count = 0;

        while offset < buffer.len() {
            msg_count += 1;

            // Parse message (example structure)
            if offset + 20 > buffer.len() {
                warn!("Incomplete message at offset {}, stopping", offset);
                break;
            }

            // Extract fields from binary data
            let s = buffer[offset];
            let f = buffer[offset + 1];
            let wbit = buffer[offset + 2];
            // ... parse other fields ...

            debug!("Parsed binary message {} (s={}, f={})", msg_count, s, f);

            messages.push(ParsedMessage {
                ts_iso: "2025-11-05T00:00:00Z".to_string(),  // Extract from data
                dir: "H->E".to_string(),
                s,
                f,
                wbit,
                sysbytes: 0,
                ceid: 0,
                body_json: serde_json::json!({}),
            });

            offset += 20;  // Move to next message
        }

        info!("Binary parsing complete: {} messages parsed", messages.len());
        Ok(messages)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_can_parse_binary() {
        let parser = BinaryParser;
        let data = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02];
        assert!(parser.can_parse_impl(&data));

        let invalid = vec![0x00, 0x00, 0x00, 0x00];
        assert!(!parser.can_parse_impl(&invalid));
    }

    #[test]
    fn test_parse_binary() {
        let parser = BinaryParser;
        let data = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x06, 0x11, 0x00, /* ... */];
        let cursor = Cursor::new(data);
        let messages = parser.parse(Box::new(cursor)).unwrap();
        assert!(!messages.is_empty());
    }
}
```

Then just add it to `parsers.rs`:

```rust
pub use binary_parser::BinaryParser;  // in lib.rs

// in parsers.rs:
vec![
    Box::new(NdjsonParser) as Box<dyn Parser>,
    Box::new(CsvParser) as Box<dyn Parser>,
    Box::new(JsonParser) as Box<dyn Parser>,
    Box::new(BinaryParser) as Box<dyn Parser>,  // <-- Added!
]
```

---

## Testing Your Parser

1. **Unit tests**: Add tests to your parser file (see examples above)

2. **Run tests**:
   ```bash
   cd backend/parser
   cargo test
   ```

3. **Integration test**:
   ```bash
   cd backend/service
   cargo run
   # Upload a test file through the web UI
   ```

4. **Check logs**: The comprehensive logging will show you exactly what's happening:
   ```
   [INFO] Initializing ParserRegistry
   [INFO] Registered 4 parsers: ndjson, csv, json, xml
   [INFO] Parsing file with hint: test.xml
   [INFO] Selected parser 'xml' for extension '.xml'
   [INFO] Starting XML parsing
   [DEBUG] Parsed message 1 (s=6, f=11)
   [INFO] XML parsing complete: 10 messages
   ```

---

## Files You Modified (Summary)

✅ **Created:**
- `backend/parser/src/xml_parser.rs` (or your parser name)

✅ **Modified:**
- `backend/parser/src/lib.rs` (2 lines added)
- `backend/parser/src/parsers.rs` (1 line added)

❌ **No changes needed:**
- `base_parser.rs` ✓
- `registry_parser.rs` ✓
- `types.rs` ✓
- Any service files ✓

---

## Troubleshooting

**Parser not being called:**
- Check that it's added to `parsers.rs`
- Verify the file extension matches
- Check `can_parse_impl()` returns true for your test data
- Look at logs: `[DEBUG] Parser 'yourparser' can_parse result: false`

**Parsing errors:**
- Check the error logs for specific failure points
- Use debug logging liberally in your parse() function
- Test with the smallest possible valid input first

**Format detection issues:**
- The registry tries extension matching first, then format detection
- If your format is ambiguous, ensure `can_parse_impl()` is distinctive
- Check logs: `[INFO] Format hint from content analysis: Unknown`

---

## Advanced: Using the Macro (Optional)

For even cleaner registration, you can use the `register_parsers!` macro:

```rust
// In parsers.rs:
use crate::register_parsers;

pub fn all_parsers() -> Vec<Box<dyn Parser>> {
    register_parsers![
        NdjsonParser,
        CsvParser,
        JsonParser,
        XmlParser,       // <-- Just add parser name
    ]
}
```

This is functionally identical but slightly cleaner.

---

## Need Help?

- Check existing parsers: `csv_parser.rs`, `json_parser.rs`, `ndjson_parser.rs`
- See the main documentation: `PARSER_REFACTORING.md`
- Look at the comprehensive logging output when testing

Happy parsing! 🎉
