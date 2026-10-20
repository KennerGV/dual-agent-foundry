#[derive(Debug, Clone, PartialEq)]
pub enum ApiError {
    InvalidPayload(String),
    StorageFailure(String),
    InternalError(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct IngestResponse {
    pub status: String,
    pub event_id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HealthStatus {
    pub status: String,
    pub uptime_seconds: u64,
}

pub trait IngestServer {
    fn handle_ingest(&self, payload: &[u8]) -> Result<IngestResponse, ApiError>;
    fn handle_health(&self) -> HealthStatus;
}
