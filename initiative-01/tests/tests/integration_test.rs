use initiative_01_core::*;
use initiative_01_storage::*;
use initiative_01_api::*;

#[test]
fn test_workspace_integration_stubs() {
    let metrics = Metrics {
        cpu_usage_pct: 50.0,
        memory_rss_mb: 1024.0,
        latency_p99_ms: 100.0,
        error_rate_pct: 0.0,
    };
    assert_eq!(metrics.cpu_usage_pct, 50.0);

    let health = HealthStatus {
        status: "ok".to_string(),
        uptime_seconds: 10,
    };
    assert_eq!(health.status, "ok");

    let err = StorageError::BufferFull;
    assert_eq!(err, StorageError::BufferFull);
}
