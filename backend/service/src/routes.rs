use axum::{
    Router,
    routing::{get, post, delete},
    response::{IntoResponse, Response},
    http::{StatusCode, header},
    extract::{Path, Query, State, Multipart},
    Json,
};
use crate::models::{CreateSessionResponse, SessionMeta, SearchRequest, ConvertedMessage, FilterExpr};
use crate::storage::{SessionStorage, ingest_messages};
use crate::arrow_io::{get_arrow_schema, ArrowBuilder};
use arrow::ipc::writer::StreamWriter;
use serde::Deserialize;
use std::sync::Arc;
use std::io::Cursor;
use tracing::{info, debug, warn, error, instrument};

#[derive(Clone)]
pub struct AppState {
    pub storage: Arc<SessionStorage>,
}

pub fn create_routes() -> Router {
    let storage = SessionStorage::new("./data").expect("Failed to create storage");
    let state = AppState {
        storage: Arc::new(storage),
    };
    
    Router::new()
        .route("/health", get(health_check))
        .route("/sessions", post(create_session))
        .route("/sessions/:id/meta", get(get_meta))
        .route("/sessions/:id/messages.arrow", get(get_messages_arrow))
        .route("/sessions/:id/search", post(search_messages))
        .route("/sessions/:id/payload/:row_id", get(get_payload))
        .route("/sessions/:id", delete(delete_session))
        .with_state(state)
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

#[instrument(skip(state, multipart))]
async fn create_session(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<CreateSessionResponse>, (StatusCode, String)> {
    info!("Received file upload request");

    // Get the uploaded file
    let mut file_data = Vec::new();
    let mut filename = String::new();

    while let Some(field) = multipart.next_field().await
        .map_err(|e| {
            error!("Multipart error: {}", e);
            (StatusCode::BAD_REQUEST, format!("Multipart error: {}", e))
        })?
    {
        if field.name() == Some("file") {
            filename = field.file_name().unwrap_or("unknown").to_string();
            info!("Receiving file: {}", filename);

            let data = field.bytes().await
                .map_err(|e| {
                    error!("Failed to read file data: {}", e);
                    (StatusCode::BAD_REQUEST, format!("Failed to read file: {}", e))
                })?;
            file_data = data.to_vec();
            info!("File data received: {} bytes", file_data.len());
        }
    }

    if file_data.is_empty() {
        error!("No file data provided in request");
        return Err((StatusCode::BAD_REQUEST, "No file provided".to_string()));
    }

    // Create session
    info!("Creating new session");
    let session_id = state.storage.create_session()
        .map_err(|e| {
            error!("Failed to create session: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create session: {}", e))
        })?;
    info!("Created session: {}", session_id);

    // Use parser registry to auto-detect format
    let cursor = Cursor::new(file_data);
    let registry = parser::ParserRegistry::new();

    info!("Starting parse with filename hint: {}", filename);
    let parsed = registry.parse_with_hint(Box::new(cursor), &filename)
        .map_err(|e| {
            error!("Parse error for file '{}': {}", filename, e);
            (StatusCode::BAD_REQUEST, format!("Parse error: {}", e))
        })?;

    info!("Successfully parsed {} messages", parsed.len());

    debug!("Converting parsed messages to internal format");
    let messages: Vec<ConvertedMessage> = parsed.into_iter()
        .enumerate()
        .map(|(idx, msg)| ConvertedMessage::from_parsed(msg, idx as u32))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            error!("Message conversion error: {}", e);
            (StatusCode::BAD_REQUEST, format!("Conversion error: {}", e))
        })?;

    info!("Converted {} messages, starting ingestion", messages.len());

    // Ingest messages
    ingest_messages(&state.storage, &session_id, messages.into_iter())
        .map_err(|e| {
            error!("Ingest failed for session {}: {}", session_id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Ingest failed: {}", e))
        })?;

    info!("Successfully ingested messages for session: {}", session_id);
    Ok(Json(CreateSessionResponse { session_id }))
}

async fn get_meta(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<SessionMeta>, (StatusCode, String)> {
    let meta = state.storage.read_meta(&session_id)
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Session not found: {}", e)))?;
    
    Ok(Json(meta))
}

#[derive(Debug, Deserialize)]
struct MessagesQuery {
    #[serde(default)]
    from_ns: i64,
    #[serde(default)]
    to_ns: i64,
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    cursor: usize,
}

fn default_limit() -> usize {
    50_000
}

#[instrument(skip(state))]
async fn get_messages_arrow(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Query(query): Query<MessagesQuery>,
) -> Result<Response, (StatusCode, String)> {
    info!("Fetching messages for session: {}", session_id);
    debug!("Query params: from_ns={}, to_ns={}, limit={}, cursor={}",
        query.from_ns, query.to_ns, query.limit, query.cursor);

    // Read all chunks and concatenate
    let chunks = state.storage.list_chunks(&session_id)
        .map_err(|e| {
            error!("Session not found or error listing chunks: {}", e);
            (StatusCode::NOT_FOUND, format!("Session not found: {}", e))
        })?;

    info!("Found {} chunks for session {}", chunks.len(), session_id);
    
    let mut all_batches = Vec::new();
    
    for chunk_path in chunks {
        let file = std::fs::File::open(chunk_path)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read chunk: {}", e)))?;
        
        let reader = arrow::ipc::reader::StreamReader::try_new(file, None)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read Arrow: {}", e)))?;
        
        for batch_result in reader {
            let batch = batch_result
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read batch: {}", e)))?;
            all_batches.push(batch);
        }
    }
    
    // Apply filters and limits
    // For now, just concatenate and return (filtering will be added in search endpoint)
    let schema = get_arrow_schema();
    let mut buffer = Vec::new();
    {
        let mut writer = StreamWriter::try_new(&mut buffer, &schema)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create writer: {}", e)))?;
        
        let mut count = 0;
        for batch in all_batches {
            if count >= query.limit {
                break;
            }
            writer.write(&batch)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write batch: {}", e)))?;
            count += batch.num_rows();
        }
        
        writer.finish()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to finish writer: {}", e)))?;
    }
    
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/vnd.apache.arrow.stream")
        .body(axum::body::Body::from(buffer))
        .unwrap())
}

#[instrument(skip(state, search_req), fields(session_id = %session_id))]
async fn search_messages(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(search_req): Json<SearchRequest>,
) -> Result<Response, (StatusCode, String)> {
    info!("Search request for session: {}", session_id);
    debug!("Search filter: dir={}, s={:?}, f={:?}, text='{}'",
        search_req.filter.dir, search_req.filter.s, search_req.filter.f, search_req.filter.text);

    // Read all chunks
    let chunks = state.storage.list_chunks(&session_id)
        .map_err(|e| {
            error!("Session not found or error listing chunks: {}", e);
            (StatusCode::NOT_FOUND, format!("Session not found: {}", e))
        })?;

    debug!("Processing {} chunks for search", chunks.len());
    
    let mut builder = ArrowBuilder::new();
    
    for chunk_path in chunks {
        let file = std::fs::File::open(chunk_path)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read chunk: {}", e)))?;
        
        let reader = arrow::ipc::reader::StreamReader::try_new(file, None)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read Arrow: {}", e)))?;
        
        for batch_result in reader {
            let batch = batch_result
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read batch: {}", e)))?;
            
            // Apply filters with storage for text search
            let filtered = apply_filter(&batch, &search_req.filter, Some(&state.storage), Some(&session_id))
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Filter failed: {}", e)))?;
            
            for msg in filtered {
                builder.push(&msg);
            }
        }
    }
    
    // Build result batch
    let result_batch = builder.build_batch()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to build batch: {}", e)))?;
    
    // Serialize to Arrow IPC
    let schema = get_arrow_schema();
    let mut buffer = Vec::new();
    {
        let mut writer = StreamWriter::try_new(&mut buffer, &schema)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create writer: {}", e)))?;
        
        writer.write(&result_batch)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to write batch: {}", e)))?;
        
        writer.finish()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to finish writer: {}", e)))?;
    }
    
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/vnd.apache.arrow.stream")
        .body(axum::body::Body::from(buffer))
        .unwrap())
}

/// Helper function to load payload from MsgPack for text search
fn load_payload_for_search(
    storage: &SessionStorage,
    session_id: &str,
    row_id: u32,
) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    storage.read_payload(session_id, row_id)
}

fn apply_filter(
    batch: &arrow::record_batch::RecordBatch,
    filter: &FilterExpr,
    storage: Option<&SessionStorage>,
    session_id: Option<&str>,
) -> Result<Vec<ConvertedMessage>, Box<dyn std::error::Error>> {
    use arrow::array::*;
    
    let ts_ns_arr = batch.column(0).as_any().downcast_ref::<Int64Array>().unwrap();
    let dir_arr = batch.column(1).as_any().downcast_ref::<Int8Array>().unwrap();
    let s_arr = batch.column(2).as_any().downcast_ref::<UInt8Array>().unwrap();
    let f_arr = batch.column(3).as_any().downcast_ref::<UInt8Array>().unwrap();
    let wbit_arr = batch.column(4).as_any().downcast_ref::<UInt8Array>().unwrap();
    let sysbytes_arr = batch.column(5).as_any().downcast_ref::<UInt32Array>().unwrap();
    let ceid_arr = batch.column(6).as_any().downcast_ref::<UInt32Array>().unwrap();
    let vid_arr = batch.column(7).as_any().downcast_ref::<UInt32Array>().unwrap();
    let rptid_arr = batch.column(8).as_any().downcast_ref::<UInt32Array>().unwrap();
    let row_id_arr = batch.column(9).as_any().downcast_ref::<UInt32Array>().unwrap();
    
    // Prepare text search (case-insensitive)
    let search_text = if !filter.text.is_empty() {
        Some(filter.text.to_lowercase())
    } else {
        None
    };
    
    let mut results = Vec::new();
    
    for i in 0..batch.num_rows() {
        let ts_ns = ts_ns_arr.value(i);
        let dir = dir_arr.value(i);
        let s = s_arr.value(i);
        let f = f_arr.value(i);
        let ceid = ceid_arr.value(i);
        let vid = vid_arr.value(i);
        let rptid = rptid_arr.value(i);
        let row_id = row_id_arr.value(i);

        // Apply filters
        if filter.dir != 0 && filter.dir != dir {
            continue;
        }

        if !filter.s.is_empty() && !filter.s.contains(&s) {
            continue;
        }

        if !filter.f.is_empty() && !filter.f.contains(&f) {
            continue;
        }

        if !filter.ceid.is_empty() && !filter.ceid.contains(&ceid) {
            continue;
        }

        if !filter.vid.is_empty() && !filter.vid.contains(&vid) {
            continue;
        }

        if !filter.rptid.is_empty() && !filter.rptid.contains(&rptid) {
            continue;
        }
        
        if filter.time.from_ns > 0 && ts_ns < filter.time.from_ns {
            continue;
        }
        
        if filter.time.to_ns > 0 && ts_ns > filter.time.to_ns {
            continue;
        }
        
        // Text search in payload
        if let Some(ref search_term) = search_text {
            if let (Some(storage), Some(session_id)) = (storage, session_id) {
                // Load payload and search
                match load_payload_for_search(storage, session_id, row_id) {
                    Ok(payload) => {
                        // Convert payload to searchable string
                        let payload_str = serde_json::to_string(&payload)
                            .unwrap_or_default()
                            .to_lowercase();
                        
                        // Check if payload contains search term
                        if !payload_str.contains(search_term) {
                            continue;
                        }
                    }
                    Err(_) => {
                        // If payload can't be loaded, skip this message
                        continue;
                    }
                }
            }
        }
        
        results.push(ConvertedMessage {
            ts_ns,
            dir,
            s,
            f,
            wbit: wbit_arr.value(i),
            sysbytes: sysbytes_arr.value(i),
            ceid,
            vid,
            rptid,
            row_id,
            body_json: serde_json::Value::Null, // Not needed for search
        });
    }
    
    Ok(results)
}

async fn get_payload(
    State(state): State<AppState>,
    Path((session_id, row_id)): Path<(String, u32)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let payload = state.storage.read_payload(&session_id, row_id)
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Payload not found: {}", e)))?;
    
    Ok(Json(payload))
}

async fn delete_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.storage.delete_session(&session_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete: {}", e)))?;
    
    Ok(StatusCode::NO_CONTENT)
}
