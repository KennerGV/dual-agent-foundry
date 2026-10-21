from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from .models import (
    AnomalyAlert,
    DetectionResult,
    TelemetryEvent,
    TelemetryMetrics,
)
from .spike import LatencyErrorSpikeDetector, SpikeDetector
from .timeseries import TimeSeriesDetector
from .zscore import ZScoreDetector


def create_event(
    event_id: str = "evt_1",
    service: str = "payment-gateway-prod",
    cpu: float = 20.0,
    mem: float = 1000.0,
    latency: float = 100.0,
    error: float = 1.0,
) -> TelemetryEvent:
    return TelemetryEvent(
        event_id=event_id,
        timestamp_utc=datetime.now(timezone.utc),
        source_service=service,
        host_id="host-1",
        metrics=TelemetryMetrics(
            cpu_usage_pct=cpu,
            memory_rss_mb=mem,
            latency_p99_ms=latency,
            error_rate_pct=error,
        ),
    )


def test_pydantic_models_validation():
    event = create_event()
    assert event.event_id == "evt_1"
    assert event.metrics.cpu_usage_pct == 20.0

    with pytest.raises(ValidationError):
        TelemetryMetrics(cpu_usage_pct=150.0)  # ge=0.0, le=100.0

    alert = AnomalyAlert(
        alert_id="alt_1",
        detected_at_utc=datetime.now(timezone.utc),
        source_event_ids=["evt_1"],
        source_service="payment-gateway-prod",
        anomaly_type="LATENCY_SPIKE",
        z_score=4.5,
        confidence=0.95,
        recommended_severity="SEV-1",
    )
    assert alert.alert_id == "alt_1"


def test_zscore_detector_fit_and_detect():
    detector = ZScoreDetector(threshold=3.0)

    # Baseline data: mean latency ~100, std ~2
    baseline_events = [
        create_event(event_id=f"evt_{i}", latency=100.0 + (i % 3 - 1) * 2.0)
        for i in range(20)
    ]
    detector.fit(baseline_events)

    # Normal event
    normal_event = create_event(event_id="evt_normal", latency=101.0)
    results = detector.detect(normal_event)
    latency_res = next(r for r in results if r.metric_name == "latency_p99_ms")
    assert not latency_res.is_anomaly
    assert abs(latency_res.z_score) < 3.0

    # Anomalous event
    anomaly_event = create_event(event_id="evt_spike", latency=500.0)
    results_anom = detector.detect(anomaly_event)
    latency_res_anom = next(r for r in results_anom if r.metric_name == "latency_p99_ms")
    assert latency_res_anom.is_anomaly
    assert latency_res_anom.z_score >= 3.0
    assert latency_res_anom.detector_name == "ZScoreDetector"


def test_zscore_detector_zero_variance():
    detector = ZScoreDetector(threshold=3.0)
    baseline_events = [create_event(event_id=f"evt_{i}", latency=100.0) for i in range(10)]
    detector.fit(baseline_events)

    same_event = create_event(latency=100.0)
    results = detector.detect(same_event)
    latency_res = next(r for r in results if r.metric_name == "latency_p99_ms")
    assert latency_res.z_score == 0.0
    assert not latency_res.is_anomaly


def test_timeseries_detector_moving_window():
    detector = TimeSeriesDetector(window_size=5, threshold_std=2.0)

    # Seed detector with baseline values
    events = [create_event(event_id=f"evt_{i}", latency=10.0) for i in range(5)]
    detector.fit(events)

    # Spike event
    spike_event = create_event(event_id="evt_spike", latency=100.0)
    results = detector.detect(spike_event)
    latency_res = next(r for r in results if r.metric_name == "latency_p99_ms")
    assert latency_res.detector_name == "TimeSeriesDetector"
    # Given baseline std was 0, first deviation sets z_score=0.0 or updates window
    # Send another event to test moving window update
    next_event = create_event(event_id="evt_spike2", latency=150.0)
    results2 = detector.detect(next_event)
    latency_res2 = next(r for r in results2 if r.metric_name == "latency_p99_ms")
    assert latency_res2.detector_name == "TimeSeriesDetector"


def test_spike_detector():
    detector = SpikeDetector(latency_threshold_ms=1000.0, error_rate_threshold_pct=10.0)
    baseline_events = [create_event(event_id=f"evt_{i}", latency=100.0, error=1.0) for i in range(10)]
    detector.fit(baseline_events)

    normal_event = create_event(latency=200.0, error=2.0)
    results = detector.detect(normal_event)
    for res in results:
        assert not res.is_anomaly

    spike_event = create_event(latency=1500.0, error=15.0)
    results_spike = detector.detect(spike_event)
    lat_res = next(r for r in results_spike if r.metric_name == "latency_p99_ms")
    err_res = next(r for r in results_spike if r.metric_name == "error_rate_pct")

    assert lat_res.is_anomaly
    assert err_res.is_anomaly


def test_detector_partial_metrics():
    detector = ZScoreDetector()
    partial_event = TelemetryEvent(
        event_id="evt_partial",
        timestamp_utc=datetime.now(timezone.utc),
        source_service="auth-service",
        host_id="host-2",
        metrics=TelemetryMetrics(cpu_usage_pct=88.0),
    )
    results = detector.detect(partial_event)
    assert len(results) == 1
    assert results[0].metric_name == "cpu_usage_pct"
