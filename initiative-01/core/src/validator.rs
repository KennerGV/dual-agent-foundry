use crate::types::{CoreError, TelemetryEvent};

pub trait EventValidator {
    fn validate(&self, event: &TelemetryEvent) -> Result<(), CoreError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct DefaultEventValidator;

impl DefaultEventValidator {
    pub fn new() -> Self {
        Self
    }
}

impl EventValidator for DefaultEventValidator {
    fn validate(&self, event: &TelemetryEvent) -> Result<(), CoreError> {
        if event.event_id.trim().is_empty() {
            return Err(CoreError::ValidationError("event_id must not be empty".into()));
        }
        if event.timestamp_utc.trim().is_empty() {
            return Err(CoreError::ValidationError("timestamp_utc must not be empty".into()));
        }
        if event.source_service.trim().is_empty() {
            return Err(CoreError::ValidationError("source_service must not be empty".into()));
        }
        if event.host_id.trim().is_empty() {
            return Err(CoreError::ValidationError("host_id must not be empty".into()));
        }
        if event.compression.trim().is_empty() {
            return Err(CoreError::ValidationError("compression must not be empty".into()));
        }

        let m = &event.metrics;
        if !(0.0..=100.0).contains(&m.cpu_usage_pct) || m.cpu_usage_pct.is_nan() {
            return Err(CoreError::ValidationError(format!(
                "cpu_usage_pct out of range [0.0, 100.0]: {}",
                m.cpu_usage_pct
            )));
        }
        if m.memory_rss_mb < 0.0 || m.memory_rss_mb.is_nan() {
            return Err(CoreError::ValidationError(format!(
                "memory_rss_mb must be non-negative: {}",
                m.memory_rss_mb
            )));
        }
        if m.latency_p99_ms < 0.0 || m.latency_p99_ms.is_nan() {
            return Err(CoreError::ValidationError(format!(
                "latency_p99_ms must be non-negative: {}",
                m.latency_p99_ms
            )));
        }
        if !(0.0..=100.0).contains(&m.error_rate_pct) || m.error_rate_pct.is_nan() {
            return Err(CoreError::ValidationError(format!(
                "error_rate_pct out of range [0.0, 100.0]: {}",
                m.error_rate_pct
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Metrics;

    fn sample_event<'a>() -> TelemetryEvent<'a> {
        TelemetryEvent {
            event_id: "evt_123",
            timestamp_utc: "2026-10-20T18:00:00Z",
            source_service: "auth-service",
            host_id: "host-1",
            metrics: Metrics {
                cpu_usage_pct: 50.0,
                memory_rss_mb: 1024.0,
                latency_p99_ms: 250.0,
                error_rate_pct: 1.0,
            },
            raw_log: "info log",
            compression: "lz4",
        }
    }

    #[test]
    fn test_validate_valid_event() {
        let validator = DefaultEventValidator::new();
        let event = sample_event();
        assert!(validator.validate(&event).is_ok());
    }

    #[test]
    fn test_validate_empty_string_fields() {
        let validator = DefaultEventValidator::new();

        let mut event = sample_event();
        event.event_id = "   ";
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.timestamp_utc = "";
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.source_service = "";
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.host_id = "";
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.compression = "";
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));
    }

    #[test]
    fn test_validate_invalid_metrics() {
        let validator = DefaultEventValidator::new();

        let mut event = sample_event();
        event.metrics.cpu_usage_pct = 100.5;
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.metrics.cpu_usage_pct = -0.1;
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.metrics.memory_rss_mb = -1.0;
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.metrics.latency_p99_ms = -50.0;
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));

        let mut event = sample_event();
        event.metrics.error_rate_pct = 101.0;
        assert!(matches!(validator.validate(&event), Err(CoreError::ValidationError(_))));
    }
}
