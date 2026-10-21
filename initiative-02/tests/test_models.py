from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from api.models import (
    AnomalyAlert,
    DetectionResult,
    EvaluationBatchRequest,
    EvaluationBatchResponse,
    RuleEvaluationResult,
    TelemetryEvent,
    TelemetryMetrics,
)


def test_telemetry_metrics_valid():
    metrics = TelemetryMetrics(
        cpu_usage_pct=50.0,
        memory_rss_mb=1024.0,
        latency_p99_ms=150.0,
        error_rate_pct=1.5,
    )
    assert metrics.cpu_usage_pct == 50.0
    assert metrics.memory_rss_mb == 1024.0
    assert metrics.latency_p99_ms == 150.0
    assert metrics.error_rate_pct == 1.5


def test_telemetry_metrics_optional_fields():
    metrics = TelemetryMetrics()
    assert metrics.cpu_usage_pct is None
    assert metrics.memory_rss_mb is None
    assert metrics.latency_p99_ms is None
    assert metrics.error_rate_pct is None


def test_telemetry_metrics_validation_bounds():
    with pytest.raises(ValidationError):
        TelemetryMetrics(cpu_usage_pct=-1.0)

    with pytest.raises(ValidationError):
        TelemetryMetrics(cpu_usage_pct=100.1)

    with pytest.raises(ValidationError):
        TelemetryMetrics(error_rate_pct=-0.1)

    with pytest.raises(ValidationError):
        TelemetryMetrics(error_rate_pct=100.1)

    with pytest.raises(ValidationError):
        TelemetryMetrics(memory_rss_mb=-10.0)

    with pytest.raises(ValidationError):
        TelemetryMetrics(latency_p99_ms=-5.0)


def test_telemetry_event_valid():
    now = datetime.now(timezone.utc)
    event = TelemetryEvent(
        event_id="evt_100",
        timestamp_utc=now,
        source_service="billing-api",
        host_id="host-01",
        metrics=TelemetryMetrics(cpu_usage_pct=42.0),
        raw_log="User payment processed",
        compression="lz4",
    )
    assert event.event_id == "evt_100"
    assert event.source_service == "billing-api"
    assert event.compression == "lz4"
    assert event.metrics.cpu_usage_pct == 42.0


def test_telemetry_event_missing_required_fields():
    with pytest.raises(ValidationError):
        TelemetryEvent(
            timestamp_utc=datetime.now(timezone.utc),
            source_service="billing-api",
            host_id="host-01",
            metrics=TelemetryMetrics(),
        )


def test_anomaly_alert_validation():
    alert = AnomalyAlert(
        alert_id="alt_001",
        detected_at_utc=datetime.now(timezone.utc),
        source_event_ids=["evt_100"],
        source_service="billing-api",
        anomaly_type="HIGH_CPU_USAGE",
        z_score=4.2,
        confidence=0.9,
        recommended_severity="SEV-2",
    )
    assert alert.alert_id == "alt_001"
    assert alert.confidence == 0.9

    with pytest.raises(ValidationError):
        AnomalyAlert(
            alert_id="alt_002",
            detected_at_utc=datetime.now(timezone.utc),
            source_event_ids=["evt_100"],
            source_service="billing-api",
            anomaly_type="HIGH_CPU_USAGE",
            z_score=4.2,
            confidence=1.5,  # Invalid: must be <= 1.0
            recommended_severity="SEV-2",
        )


def test_detection_and_rule_results():
    det = DetectionResult(
        metric_name="cpu_usage_pct",
        is_anomaly=True,
        z_score=3.8,
        current_value=95.0,
        threshold=3.0,
        detector_name="ZScoreDetector",
    )
    assert det.is_anomaly is True
    assert det.z_score == 3.8

    rule_res = RuleEvaluationResult(
        rule_id="R001",
        rule_name="CPU Spike",
        triggered=True,
        anomaly_type="HIGH_CPU",
        severity="SEV-3",
        confidence=0.8,
        description="CPU reached 95%",
    )
    assert rule_res.triggered is True
    assert rule_res.severity == "SEV-3"


def test_evaluation_batch_models():
    now = datetime.now(timezone.utc)
    event = TelemetryEvent(
        event_id="evt_batch_1",
        timestamp_utc=now,
        source_service="auth-service",
        host_id="host-02",
        metrics=TelemetryMetrics(cpu_usage_pct=10.0),
    )
    batch_req = EvaluationBatchRequest(events=[event])
    assert len(batch_req.events) == 1

    alert = AnomalyAlert(
        alert_id="alt_b1",
        detected_at_utc=now,
        source_event_ids=["evt_batch_1"],
        source_service="auth-service",
        anomaly_type="NONE",
        z_score=0.0,
        confidence=0.0,
        recommended_severity="SEV-4",
    )
    batch_resp = EvaluationBatchResponse(processed_count=1, alerts=[alert])
    assert batch_resp.processed_count == 1
    assert len(batch_resp.alerts) == 1
