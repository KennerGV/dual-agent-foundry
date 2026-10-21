use std::sync::{Arc, Mutex};
use std::time::Instant;

pub const INITIAL_EVENTS: &[&str] = &[
    r#"{"event_id":"evt_9f8a7b6c","timestamp_utc":"2026-10-21T03:15:00Z","source_service":"payment-gateway-prod","host_id":"node-us-east-04","metrics":{"cpu_usage_pct":94.2,"memory_rss_mb":3840,"latency_p99_ms":1420.5,"error_rate_pct":18.4},"raw_log":"ERROR [conn_pool] timeout acquiring connection after 1000ms","compression":"lz4"}"#,
    r#"{"event_id":"evt_5e6f7g8h","timestamp_utc":"2026-10-21T03:14:30Z","source_service":"order-processor-prod","host_id":"node-us-west-02","metrics":{"cpu_usage_pct":78.5,"memory_rss_mb":2048,"latency_p99_ms":450.2,"error_rate_pct":2.1},"raw_log":"WARN [order_queue] queue depth exceeding soft threshold","compression":"lz4"}"#,
    r#"{"event_id":"evt_1a2b3c4d","timestamp_utc":"2026-10-21T03:14:00Z","source_service":"auth-service-prod","host_id":"node-us-east-01","metrics":{"cpu_usage_pct":45.0,"memory_rss_mb":1024,"latency_p99_ms":120.0,"error_rate_pct":0.1},"raw_log":"INFO [auth] token verified successfully","compression":"lz4"}"#,
];

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

pub fn handle_http_request(
    srv: &TelemetryServer,
    events: &Arc<Mutex<Vec<String>>>,
    req: &str,
) -> String {
    let first_line = req.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let (method, path) = match parts.as_slice() {
        [m, p, ..] => (*m, *p),
        _ => ("GET", "/"),
    };

    let body_str = match req.find("\r\n\r\n") {
        Some(idx) => &req[idx + 4..],
        None => "",
    }
    .trim();

    let (status_line, response_body) = if method == "GET" && path.starts_with("/healthz") {
        let h = srv.handle_health();
        (
            "HTTP/1.1 200 OK",
            format!(
                r#"{{"status":"{}","service":"telemetry-ingestor","uptime_seconds":{}}}"#,
                h.status, h.uptime_seconds
            ),
        )
    } else if method == "GET" && path.starts_with("/v1/events") {
        let store = events.lock().unwrap();
        let joined = store.join(",");
        ("HTTP/1.1 200 OK", format!("[{}]", joined))
    } else if method == "POST" && path.starts_with("/v1/ingest") {
        match srv.handle_ingest(body_str.as_bytes()) {
            Ok(res) => {
                if body_str.starts_with('{') && body_str.ends_with('}') {
                    let mut store = events.lock().unwrap();
                    store.insert(0, body_str.to_string());
                    if store.len() > 50 {
                        store.truncate(50);
                    }
                }
                (
                    "HTTP/1.1 200 OK",
                    format!(
                        r#"{{"status":"{}","event_id":"{}"}}"#,
                        res.status, res.event_id
                    ),
                )
            }
            Err(_) => (
                "HTTP/1.1 400 Bad Request",
                r#"{"error":"invalid telemetry payload"}"#.to_string(),
            ),
        }
    } else {
        (
            "HTTP/1.1 200 OK",
            r#"{"service":"initiative-01-telemetry-ingestor","status":"ok"}"#.to_string(),
        )
    };

    format!(
        "{}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_line,
        response_body.len(),
        response_body
    )
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

    #[test]
    fn test_handle_http_request_healthz() {
        let server = TelemetryServer::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let req = "GET /healthz HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let resp = handle_http_request(&server, &events, req);
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""status":"ok""#));
        assert!(resp.contains(r#""service":"telemetry-ingestor""#));
    }

    #[test]
    fn test_handle_http_request_events() {
        let server = TelemetryServer::new();
        let events = Arc::new(Mutex::new(
            INITIAL_EVENTS.iter().map(|s| s.to_string()).collect(),
        ));
        let req = "GET /v1/events HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let resp = handle_http_request(&server, &events, req);
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains("evt_9f8a7b6c"));
    }

    #[test]
    fn test_handle_http_request_ingest_success() {
        let server = TelemetryServer::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let body = r#"{"event_id":"evt_test123","source_service":"unit-test"}"#;
        let req = format!(
            "POST /v1/ingest HTTP/1.1\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let resp = handle_http_request(&server, &events, &req);
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""event_id":"evt_test123""#));
        assert_eq!(events.lock().unwrap().len(), 1);
    }

    #[test]
    fn test_handle_http_request_ingest_error() {
        let server = TelemetryServer::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let req = "POST /v1/ingest HTTP/1.1\r\nContent-Length: 0\r\n\r\n";
        let resp = handle_http_request(&server, &events, req);
        assert!(resp.starts_with("HTTP/1.1 400 Bad Request"));
        assert!(resp.contains(r#""error":"invalid telemetry payload""#));
    }

    #[test]
    fn test_handle_http_request_fallback() {
        let server = TelemetryServer::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let req = "GET /something_else HTTP/1.1\r\n\r\n";
        let resp = handle_http_request(&server, &events, req);
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains(r#""service":"initiative-01-telemetry-ingestor""#));
    }
}
