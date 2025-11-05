mod routes;
mod storage;
mod models;
mod arrow_io;

use axum::{Router, extract::DefaultBodyLimit};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router with increased body limit for large file uploads
    // Set limit to 1 GB to handle large HSMS log files
    let app = Router::new()
        .merge(routes::create_routes())
        .layer(DefaultBodyLimit::max(1024 * 1024 * 1024)) // 1 GB limit
        .layer(cors);

    // Start server
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    tracing::info!("Starting HSMS service on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

