from datetime import datetime, timezone
import pytest

from api.models import EvaluationBatchRequest, TelemetryEvent, TelemetryMetrics
from api.service import EvaluationService


def test_integration_evaluation_service_flow():
    service = EvaluationService()

    # Normal event flow
    normal_event = TelemetryEvent(
        event_id="evt_integration_normal",
        timestamp_utc=datetime.now(timezone.utc),
        source_service="checkout-service",
        host_id="node-us-west-1",
        metrics=TelemetryMetrics(
            cpu_usage_pct=25.0,
            memory_rss_mb=1024.0,
            latency_p99_ms=120.0,
            error_rate_pct=0.1,
        ),
        raw_log="INFO Checkout process initiated and completed.",
    )

    alerts_norm = service.evaluate_event(normal_event)
    assert len(alerts_norm) == 0

    # Security exploit attempt event flow
    exploit_event = TelemetryEvent(
        event_id="evt_integration_exploit",
        timestamp_utc=datetime.now(timezone.utc),
        source_service="checkout-service",
        host_id="node-us-west-1",
        metrics=TelemetryMetrics(
            cpu_usage_pct=30.0,
            memory_rss_mb=1024.0,
            latency_p99_ms=120.0,
            error_rate_pct=0.1,
        ),
        raw_log="ERROR SQLi attack vector detected: UNION SELECT password FROM admin",
    )

    alerts_exploit = service.evaluate_event(exploit_event)
    assert len(alerts_exploit) >= 1
    exploit_alert = alerts_exploit[0]
    assert exploit_alert.source_service == "checkout-service"
    assert exploit_alert.recommended_severity in ("SEV-1", "SEV-2")

    # Batch evaluation flow
    batch_req = EvaluationBatchRequest(events=[normal_event])
    batch_resp = service.evaluate_batch(batch_req)
    assert batch_resp.processed_count == 1
    assert len(batch_resp.alerts) == 0
