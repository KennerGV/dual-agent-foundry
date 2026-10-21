use crate::types::{CoreError, TelemetryEvent};

pub trait EventParser {
    fn parse<'a>(&self, raw: &'a [u8]) -> Result<TelemetryEvent<'a>, CoreError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct JsonEventParser;

impl JsonEventParser {
    pub fn new() -> Self {
        Self
    }
}

impl EventParser for JsonEventParser {
    fn parse<'a>(&self, raw: &'a [u8]) -> Result<TelemetryEvent<'a>, CoreError> {
        serde_json::from_slice::<TelemetryEvent<'a>>(raw)
            .map_err(|e| CoreError::ParseError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Metrics;

    #[test]
    fn test_parse_valid_event() {
        let json_data = br#"{
            "event_id": "evt_9f8a7b6c",
            "timestamp_utc": "2026-10-20T18:00:00Z",
            "source_service": "payment-gateway-prod",
            "host_id": "node-us-east-04",
            "metrics": {
                "cpu_usage_pct": 94.2,
                "memory_rss_mb": 3840.0,
                "latency_p99_ms": 1420.5,
                "error_rate_pct": 18.4
            },
            "raw_log": "ERROR [conn_pool] timeout acquiring connection after 1000ms",
            "compression": "lz4"
        }"#;

        let parser = JsonEventParser::new();
        let parsed = parser.parse(json_data).expect("Parsing valid JSON should succeed");

        assert_eq!(parsed.event_id, "evt_9f8a7b6c");
        assert_eq!(parsed.timestamp_utc, "2026-10-20T18:00:00Z");
        assert_eq!(parsed.source_service, "payment-gateway-prod");
        assert_eq!(parsed.host_id, "node-us-east-04");
        assert_eq!(
            parsed.metrics,
            Metrics {
                cpu_usage_pct: 94.2,
                memory_rss_mb: 3840.0,
                latency_p99_ms: 1420.5,
                error_rate_pct: 18.4,
            }
        );
        assert_eq!(
            parsed.raw_log,
            "ERROR [conn_pool] timeout acquiring connection after 1000ms"
        );
        assert_eq!(parsed.compression, "lz4");

        let owned = parsed.to_owned_event();
        assert_eq!(owned.event_id, "evt_9f8a7b6c");
    }

    #[test]
    fn test_parse_invalid_json() {
        let json_data = b"{ invalid_json: ";
        let parser = JsonEventParser::new();
        let result = parser.parse(json_data);

        assert!(matches!(result, Err(CoreError::ParseError(_))));
    }

    #[test]
    fn test_parse_missing_field() {
        let json_data = br#"{
            "event_id": "evt_9f8a7b6c",
            "source_service": "payment-gateway-prod"
        }"#;
        let parser = JsonEventParser::new();
        let result = parser.parse(json_data);

        assert!(matches!(result, Err(CoreError::ParseError(_))));
    }
}
