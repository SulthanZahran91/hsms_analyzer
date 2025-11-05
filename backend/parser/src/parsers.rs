/// Central parser registration module
///
/// This module provides a simple way to register all parsers in one place.
/// When adding a new parser, you only need to:
/// 1. Create your parser file (e.g., xml_parser.rs)
/// 2. Export it in lib.rs: `pub mod xml_parser; pub use xml_parser::XmlParser;`
/// 3. Add it to the `all_parsers()` function below
///
/// That's it! No need to modify base_parser.rs or registry_parser.rs.

use crate::base_parser::Parser;
use crate::{CsvParser, JsonParser, NdjsonParser};
use tracing::info;

/// Returns a vector of all available parsers.
///
/// ## Adding a New Parser
///
/// To add a new parser, simply add a new line in this function:
///
/// ```rust,ignore
/// Box::new(YourNewParser) as Box<dyn Parser>,
/// ```
///
/// Example:
/// ```rust,ignore
/// pub fn all_parsers() -> Vec<Box<dyn Parser>> {
///     vec![
///         Box::new(NdjsonParser) as Box<dyn Parser>,
///         Box::new(CsvParser) as Box<dyn Parser>,
///         Box::new(JsonParser) as Box<dyn Parser>,
///         Box::new(XmlParser) as Box<dyn Parser>,  // <-- Add your parser here
///     ]
/// }
/// ```
pub fn all_parsers() -> Vec<Box<dyn Parser>> {
    info!("Initializing parser collection");

    vec![
        Box::new(NdjsonParser) as Box<dyn Parser>,
        Box::new(CsvParser) as Box<dyn Parser>,
        Box::new(JsonParser) as Box<dyn Parser>,
        // Add new parsers here:
        // Box::new(XmlParser) as Box<dyn Parser>,
        // Box::new(CustomParser) as Box<dyn Parser>,
    ]
}

/// Macro to make parser registration even simpler
///
/// Usage:
/// ```rust,ignore
/// register_parsers![
///     NdjsonParser,
///     CsvParser,
///     JsonParser,
///     XmlParser,     // <-- Just add parser name here
/// ]
/// ```
#[macro_export]
macro_rules! register_parsers {
    ($($parser:expr),* $(,)?) => {
        vec![
            $(Box::new($parser) as Box<dyn $crate::base_parser::Parser>),*
        ]
    };
}
