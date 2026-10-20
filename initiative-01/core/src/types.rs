#[derive(Debug, Clone, PartialEq)]
pub struct Metrics {
    pub cpu_usage_pct: f64,
    pub memory_rss_mb: f64,
    pub latency_p99_ms: f64,
    pub error_rate_pct: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TelemetryEvent<'a> {
    pub event_id: &'a str,
    pub timestamp_utc: &'a str,
    pub source_service: &'a str,
    pub host_id: &'a str,
    pub metrics: Metrics,
    pub raw_log: &'a str,
    pub compression: &'a str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OwnedTelemetryEvent {
    pub event_id: String,
    pub timestamp_utc: String,
    pub source_service: String,
    pub host_id: String,
    pub metrics: Metrics,
    pub raw_log: String,
    pub compression: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CoreError {
    ParseError(String),
    ValidationError(String),
}
