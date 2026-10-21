from datetime import datetime, timezone
import pytest

from detectors.models import TelemetryEvent, TelemetryMetrics
from detectors.spike import LatencyErrorSpikeDetector, SpikeDetector
from detectors.timeseries import TimeSeriesDetector
from detectors.zscore import ZScoreDetector


def make_event(
    event_id: str = "evt_1",
    service: str = "payment-gateway",
    cpu: float = 30.0,
    mem: float = 1000.0,
    latency: float = 100.0,
    error: float = 0.5,
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


def test_zscore_detector_normal_and_anomalous():
    detector = ZScoreDetector(threshold=3.0)

    # Train baseline: latency ~100
    events = [make_event(event_id=f"e_{i}", latency=100.0 + (i % 5)) for i in range(25)]
    detector.fit(events)

    # Normal event evaluation
    normal_evt = make_event(event_id="e_norm", latency=102.0)
    results = detector.detect(normal_evt)
    lat_res = next(r for r in results if r.metric_name == "latency_p99_ms")
    assert not lat_res.is_anomaly
    assert abs(lat_res.z_score) < 3.0

    # Anomalous event evaluation
    anom_evt = make_event(event_id="e_anom", latency=500.0)
    results_anom = detector.detect(anom_evt)
    lat_res_anom = next(r for r in results_anom if r.metric_name == "latency_p99_ms")
    assert lat_res_anom.is_anomaly
    assert lat_res_anom.z_score >= 3.0
    assert lat_res_anom.detector_name == "ZScoreDetector"


def test_zscore_detector_zero_variance():
    detector = ZScoreDetector(threshold=3.0)
    events = [make_event(event_id=f"e_{i}", latency=100.0) for i in range(10)]
    detector.fit(events)

    same_evt = make_event(latency=100.0)
    results = detector.detect(same_evt)
    lat_res = next(r for r in results if r.metric_name == "latency_p99_ms")
    assert lat_res.z_score == 0.0
    assert not lat_res.is_anomaly


def test_zscore_detector_partial_metrics():
    detector = ZScoreDetector()
    partial_evt = TelemetryEvent(
        event_id="evt_partial",
        timestamp_utc=datetime.now(timezone.utc),
        source_service="auth-service",
        host_id="host-2",
        metrics=TelemetryMetrics(cpu_usage_pct=88.0),
    )
    results = detector.detect(partial_evt)
    assert len(results) == 1
    assert results[0].metric_name == "cpu_usage_pct"


def test_timeseries_detector_moving_window():
    detector = TimeSeriesDetector(window_size=5, threshold_std=2.0)

    # Fit window
    events = [make_event(event_id=f"e_{i}", latency=50.0) for i in range(5)]
    detector.fit(events)

    # Detect with new observation
    evt1 = make_event(event_id="e_ts1", latency=120.0)
    res1 = detector.detect(evt1)
    lat_res1 = next(r for r in res1 if r.metric_name == "latency_p99_ms")
    assert lat_res1.detector_name == "TimeSeriesDetector"

    # Subsequent observation evaluates updated window
    evt2 = make_event(event_id="e_ts2", latency=200.0)
    res2 = detector.detect(evt2)
    lat_res2 = next(r for r in res2 if r.metric_name == "latency_p99_ms")
    assert lat_res2.detector_name == "TimeSeriesDetector"


def test_spike_detector():
    detector = SpikeDetector(
        latency_threshold_ms=1000.0,
        error_rate_threshold_pct=10.0,
        cpu_threshold_pct=90.0,
        memory_threshold_mb=4096.0,
    )
    baseline_events = [make_event(event_id=f"e_{i}", latency=100.0, error=1.0) for i in range(10)]
    detector.fit(baseline_events)

    # Normal event
    norm_evt = make_event(latency=200.0, error=2.0, cpu=50.0, mem=2000.0)
    results_norm = detector.detect(norm_evt)
    for res in results_norm:
        assert not res.is_anomaly

    # Spike event
    spike_evt = make_event(latency=1500.0, error=15.0, cpu=95.0, mem=5000.0)
    results_spike = detector.detect(spike_evt)

    lat_res = next(r for r in results_spike if r.metric_name == "latency_p99_ms")
    err_res = next(r for r in results_spike if r.metric_name == "error_rate_pct")
    cpu_res = next(r for r in results_spike if r.metric_name == "cpu_usage_pct")
    mem_res = next(r for r in results_spike if r.metric_name == "memory_rss_mb")

    assert lat_res.is_anomaly
    assert err_res.is_anomaly
    assert cpu_res.is_anomaly
    assert mem_res.is_anomaly


def test_latency_error_spike_detector_alias():
    assert LatencyErrorSpikeDetector is SpikeDetector
