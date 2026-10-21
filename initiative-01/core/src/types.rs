use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Metrics {
    pub cpu_usage_pct: f64,
    pub memory_rss_mb: f64,
    pub latency_p99_ms: f64,
    pub error_rate_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TelemetryEvent<'a> {
    pub event_id: &'a str,
    pub timestamp_utc: &'a str,
    pub source_service: &'a str,
    pub host_id: &'a str,
    pub metrics: Metrics,
    pub raw_log: &'a str,
    pub compression: &'a str,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OwnedTelemetryEvent {
    pub event_id: String,
    pub timestamp_utc: String,
    pub source_service: String,
    pub host_id: String,
    pub metrics: Metrics,
    pub raw_log: String,
    pub compression: String,
}

impl<'a> TelemetryEvent<'a> {
    pub fn to_owned_event(&self) -> OwnedTelemetryEvent {
        OwnedTelemetryEvent {
            event_id: self.event_id.to_string(),
            timestamp_utc: self.timestamp_utc.to_string(),
            source_service: self.source_service.to_string(),
            host_id: self.host_id.to_string(),
            metrics: self.metrics.clone(),
            raw_log: self.raw_log.to_string(),
            compression: self.compression.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum CoreError {
    ParseError(String),
    ValidationError(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::ParseError(msg) => write!(f, "Parse Error: {}", msg),
            CoreError::ValidationError(msg) => write!(f, "Validation Error: {}", msg),
        }
    }
}

impl std::error::Error for CoreError {}
