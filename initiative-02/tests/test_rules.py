from datetime import datetime, timezone
import pytest

from rules.engine import (
    AnomalyDetectionRule,
    CriticalThresholdRule,
    RawLogSecurityRule,
    RuleEngine,
)
from rules.models import DetectionResult, TelemetryEvent, TelemetryMetrics


def make_event(raw_log: str = None, cpu: float = 20.0, err: float = 1.0, lat: float = 100.0, mem: float = 1000.0) -> TelemetryEvent:
    return TelemetryEvent(
        event_id="evt_r1",
        timestamp_utc=datetime.now(timezone.utc),
        source_service="payment-gateway",
        host_id="host-1",
        metrics=TelemetryMetrics(
            cpu_usage_pct=cpu,
            memory_rss_mb=mem,
            latency_p99_ms=lat,
            error_rate_pct=err,
        ),
        raw_log=raw_log,
    )


def test_raw_log_security_rule_severities():
    rule = RawLogSecurityRule()

    # SEV-1 pattern
    evt_sev1 = make_event(raw_log="ERROR: UNION SELECT * FROM users")
    res_sev1 = rule.evaluate(evt_sev1, [])
    assert res_sev1.triggered is True
    assert res_sev1.severity == "SEV-1"
    assert res_sev1.anomaly_type == "CRITICAL_SECURITY_EXPLOIT_ATTEMPT"

    # SEV-2 pattern
    evt_sev2 = make_event(raw_log="ATTEMPT: access to ../../etc/passwd")
    res_sev2 = rule.evaluate(evt_sev2, [])
    assert res_sev2.triggered is True
    assert res_sev2.severity == "SEV-2"
    assert res_sev2.anomaly_type == "SECURITY_THREAT_DETECTED"

    # SEV-3 pattern
    evt_sev3 = make_event(raw_log="Exception in thread main: java.lang.NullPointerException")
    res_sev3 = rule.evaluate(evt_sev3, [])
    assert res_sev3.triggered is True
    assert res_sev3.severity == "SEV-3"
    assert res_sev3.anomaly_type == "APPLICATION_ERROR_LOGGED"

    # SEV-4 pattern
    evt_sev4 = make_event(raw_log="WARNING: feature is deprecated")
    res_sev4 = rule.evaluate(evt_sev4, [])
    assert res_sev4.triggered is True
    assert res_sev4.severity == "SEV-4"
    assert res_sev4.anomaly_type == "LOG_WARNING"

    # No match
    evt_none = make_event(raw_log="Everything operating normally.")
    res_none = rule.evaluate(evt_none, [])
    assert res_none.triggered is False

    # Empty log
    evt_empty = make_event(raw_log=None)
    res_empty = rule.evaluate(evt_empty, [])
    assert res_empty.triggered is False


def test_critical_threshold_rule():
    rule = CriticalThresholdRule()

    # Normal event within limits
    norm_evt = make_event(cpu=50.0, err=2.0, lat=500.0, mem=2000.0)
    res_norm = rule.evaluate(norm_evt, [])
    assert res_norm.triggered is False

    # Single violation -> SEV-3
    single_viol = make_event(cpu=95.0, err=2.0, lat=500.0, mem=2000.0)
    res_single = rule.evaluate(single_viol, [])
    assert res_single.triggered is True
    assert res_single.severity == "SEV-3"

    # Two violations -> SEV-2
    two_viol = make_event(cpu=95.0, err=20.0, lat=500.0, mem=2000.0)
    res_two = rule.evaluate(two_viol, [])
    assert res_two.triggered is True
    assert res_two.severity == "SEV-2"

    # Three violations or extreme error rate -> SEV-1
    sev1_viol = make_event(cpu=95.0, err=55.0, lat=2500.0, mem=9000.0)
    res_sev1 = rule.evaluate(sev1_viol, [])
    assert res_sev1.triggered is True
    assert res_sev1.severity == "SEV-1"


def test_anomaly_detection_rule():
    rule = AnomalyDetectionRule()
    evt = make_event()

    # No anomalies
    res_clean = rule.evaluate(evt, [])
    assert res_clean.triggered is False

    # Single moderate anomaly
    det_single = [
        DetectionResult(
            metric_name="latency_p99_ms",
            is_anomaly=True,
            z_score=3.2,
            current_value=500.0,
            threshold=3.0,
            detector_name="ZScoreDetector",
        )
    ]
    res_single = rule.evaluate(evt, det_single)
    assert res_single.triggered is True
    assert res_single.severity == "SEV-3"

    # High Z-score anomaly -> SEV-1
    det_high = [
        DetectionResult(
            metric_name="latency_p99_ms",
            is_anomaly=True,
            z_score=5.5,
            current_value=1500.0,
            threshold=3.0,
            detector_name="ZScoreDetector",
        )
    ]
    res_high = rule.evaluate(evt, det_high)
    assert res_high.triggered is True
    assert res_high.severity == "SEV-1"


def test_rule_engine_execution():
    engine = RuleEngine()
    evt = make_event(raw_log="CRITICAL: DROP TABLE users", cpu=98.0, err=25.0, lat=2500.0, mem=9000.0)

    alerts = engine.evaluate_all(evt, [])
    assert len(alerts) >= 2  # RawLogSecurityRule and CriticalThresholdRule trigger

    sev1_alert = next(a for a in alerts if a.recommended_severity == "SEV-1")
    assert sev1_alert.source_service == "payment-gateway"
    assert "evt_r1" in sev1_alert.source_event_ids
