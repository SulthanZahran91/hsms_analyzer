use crate::arrow_io::{ArrowBuilder, MetaCollector, write_arrow_chunk, CHUNK_SIZE};
use crate::models::{ConvertedMessage, SessionMeta};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct SessionStorage {
    base_path: PathBuf,
}

impl SessionStorage {
    pub fn new(base_path: impl AsRef<Path>) -> std::io::Result<Self> {
        let base_path = base_path.as_ref().to_path_buf();
        fs::create_dir_all(&base_path)?;
        Ok(Self { base_path })
    }
    
    pub fn create_session(&self) -> std::io::Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session_path = self.session_path(&session_id);
        
        fs::create_dir_all(&session_path)?;
        fs::create_dir_all(session_path.join("chunks"))?;
        fs::create_dir_all(session_path.join("payloads"))?;
        
        Ok(session_id)
    }
    
    pub fn session_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(session_id)
    }
    
    pub fn delete_session(&self, session_id: &str) -> std::io::Result<()> {
        let session_path = self.session_path(session_id);
        if session_path.exists() {
            fs::remove_dir_all(session_path)?;
        }
        Ok(())
    }
    
    pub fn write_meta(&self, session_id: &str, meta: &SessionMeta) -> Result<(), Box<dyn std::error::Error>> {
        let meta_path = self.session_path(session_id).join("meta.json");
        let json = serde_json::to_string_pretty(meta)?;
        let mut file = fs::File::create(meta_path)?;
        file.write_all(json.as_bytes())?;
        Ok(())
    }
    
    pub fn read_meta(&self, session_id: &str) -> Result<SessionMeta, Box<dyn std::error::Error>> {
        let meta_path = self.session_path(session_id).join("meta.json");
        let json = fs::read_to_string(meta_path)?;
        let meta = serde_json::from_str(&json)?;
        Ok(meta)
    }
    
    pub fn write_payload(&self, session_id: &str, row_id: u32, body_json: &serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let payload_path = self.session_path(session_id)
            .join("payloads")
            .join(format!("{}.mp", row_id));
        
        let msgpack = rmp_serde::to_vec(body_json)?;
        fs::write(payload_path, msgpack)?;
        Ok(())
    }
    
    pub fn read_payload(&self, session_id: &str, row_id: u32) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let payload_path = self.session_path(session_id)
            .join("payloads")
            .join(format!("{}.mp", row_id));
        
        let msgpack = fs::read(payload_path)?;
        let body_json = rmp_serde::from_slice(&msgpack)?;
        Ok(body_json)
    }
    
    pub fn chunk_path(&self, session_id: &str, chunk_idx: usize) -> PathBuf {
        self.session_path(session_id)
            .join("chunks")
            .join(format!("{:03}.arrow", chunk_idx))
    }
    
    pub fn list_chunks(&self, session_id: &str) -> std::io::Result<Vec<PathBuf>> {
        let chunks_dir = self.session_path(session_id).join("chunks");
        let mut chunks = Vec::new();
        
        for entry in fs::read_dir(chunks_dir)? {
            let entry = entry?;
            if entry.path().extension().and_then(|s| s.to_str()) == Some("arrow") {
                chunks.push(entry.path());
            }
        }
        
        chunks.sort();
        Ok(chunks)
    }
}

/// Process messages and write to storage
pub fn ingest_messages(
    storage: &SessionStorage,
    session_id: &str,
    messages: impl Iterator<Item = ConvertedMessage>,
) -> Result<SessionMeta, Box<dyn std::error::Error>> {
    let mut builder = ArrowBuilder::new();
    let mut meta_collector = MetaCollector::new();
    let mut chunk_idx = 0;
    
    for msg in messages {
        // Update metadata
        meta_collector.update(&msg);
        
        // Write payload
        storage.write_payload(session_id, msg.row_id, &msg.body_json)?;
        
        // Add to Arrow builder
        builder.push(&msg);
        
        // Write chunk if full
        if builder.len() >= CHUNK_SIZE {
            let batch = builder.build_batch()?;
            let chunk_path = storage.chunk_path(session_id, chunk_idx);
            write_arrow_chunk(&batch, &chunk_path)?;
            
            builder.clear();
            chunk_idx += 1;
        }
    }
    
    // Write remaining messages
    if !builder.is_empty() {
        let batch = builder.build_batch()?;
        let chunk_path = storage.chunk_path(session_id, chunk_idx);
        write_arrow_chunk(&batch, &chunk_path)?;
    }
    
    // Write metadata
    let meta = meta_collector.into_meta();
    storage.write_meta(session_id, &meta)?;
    
    Ok(meta)
}
