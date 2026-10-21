use std::time::Instant;

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

pub struct TelemetryServer {
    start_time: Instant,
}

impl TelemetryServer {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
        }
    }
}

impl Default for TelemetryServer {
    fn default() -> Self {
        Self::new()
    }
}

impl IngestServer for TelemetryServer {
    fn handle_ingest(&self, payload: &[u8]) -> Result<IngestResponse, ApiError> {
        if payload.is_empty() {
            return Err(ApiError::InvalidPayload("Payload cannot be empty".to_string()));
        }

        let payload_str = std::str::from_utf8(payload)
            .map_err(|e| ApiError::InvalidPayload(format!("Invalid UTF-8 encoding: {}", e)))?;

        let event_id = if let Some(idx) = payload_str.find("\"event_id\"") {
            let after = &payload_str[idx + "\"event_id\"".len()..];
            if let Some(colon_idx) = after.find(':') {
                let val_part = after[colon_idx + 1..].trim_start();
                if val_part.starts_with('"') {
                    let val_content = &val_part[1..];
                    if let Some(end_quote) = val_content.find('"') {
                        val_content[..end_quote].to_string()
                    } else {
                        "evt_unknown".to_string()
                    }
                } else {
                    "evt_unknown".to_string()
                }
            } else {
                "evt_unknown".to_string()
            }
        } else {
            "evt_default".to_string()
        };

        Ok(IngestResponse {
            status: "ok".to_string(),
            event_id,
        })
    }

    fn handle_health(&self) -> HealthStatus {
        HealthStatus {
            status: "ok".to_string(),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_ingest_valid_json() {
        let server = TelemetryServer::new();
        let payload = r#"{"event_id": "evt_9f8a7b6c", "source_service": "payment"}"#.as_bytes();
        let response = server.handle_ingest(payload).expect("Ingest failed");
        assert_eq!(response.status, "ok");
        assert_eq!(response.event_id, "evt_9f8a7b6c");
    }

    #[test]
    fn test_handle_ingest_empty_payload() {
        let server = TelemetryServer::new();
        let result = server.handle_ingest(&[]);
        assert!(matches!(result, Err(ApiError::InvalidPayload(_))));
    }

    #[test]
    fn test_handle_ingest_invalid_utf8() {
        let server = TelemetryServer::new();
        let invalid_utf8 = vec![0xff, 0xfe, 0xfd];
        let result = server.handle_ingest(&invalid_utf8);
        assert!(matches!(result, Err(ApiError::InvalidPayload(_))));
    }

    #[test]
    fn test_handle_health() {
        let server = TelemetryServer::new();
        let health = server.handle_health();
        assert_eq!(health.status, "ok");
    }
}
