from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from api.app import app, active_alerts

client = TestClient(app)


def test_healthz_endpoint():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "anomaly-sentinel"}


def test_list_alerts_all():
    response = client.get("/v1/alerts")
    assert response.status_code == 200
    alerts = response.json()
    assert isinstance(alerts, list)
    assert len(alerts) >= 2
    # Verify presence of initial seed alerts
    services = [a["source_service"] for a in alerts]
    assert "payment-gateway-prod" in services
    assert "order-processor-prod" in services


def test_list_alerts_filter_by_service():
    response = client.get("/v1/alerts?service=payment-gateway-prod")
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) >= 1
    for alert in alerts:
        assert alert["source_service"] == "payment-gateway-prod"

    # Test filtering with a non-existent service
    response_empty = client.get("/v1/alerts?service=nonexistent-service-12345")
    assert response_empty.status_code == 200
    assert response_empty.json() == []


def test_evaluate_single_normal_event():
    event_payload = {
        "event_id": "evt_norm_01",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "normal-test-service",
        "host_id": "host-1",
        "metrics": {
            "cpu_usage_pct": 20.0,
            "memory_rss_mb": 512.0,
            "latency_p99_ms": 100.0,
            "error_rate_pct": 0.1,
        },
        "raw_log": "Transaction completed successfully",
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_payload)
    assert response.status_code == 200
    assert response.json() == []


def test_evaluate_single_anomalous_event_and_retention():
    event_payload = {
        "event_id": "evt_retention_01",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "alert-retention-service",
        "host_id": "host-1",
        "metrics": {
            "cpu_usage_pct": 98.0,
            "memory_rss_mb": 512.0,
            "latency_p99_ms": 100.0,
            "error_rate_pct": 0.1,
        },
        "raw_log": "ERROR SQLi attack vector detected: UNION SELECT password FROM admin",
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_payload)
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) >= 1
    new_alert_id = alerts[0]["alert_id"]

    # Verify that the new alert was prepended and stored in active_alerts via GET /v1/alerts
    alerts_resp = client.get("/v1/alerts?service=alert-retention-service")
    assert alerts_resp.status_code == 200
    stored_alerts = alerts_resp.json()
    assert len(stored_alerts) >= 1
    assert stored_alerts[0]["alert_id"] == new_alert_id
    assert stored_alerts[0]["source_service"] == "alert-retention-service"


def test_evaluate_batch_endpoint_and_retention():
    batch_payload = {
        "events": [
            {
                "event_id": "evt_b1",
                "timestamp_utc": "2026-10-20T18:00:00Z",
                "source_service": "batch-alert-service",
                "host_id": "host-1",
                "metrics": {
                    "cpu_usage_pct": 95.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
            },
        ]
    }
    response = client.post("/v1/evaluate/batch", json=batch_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["processed_count"] == 1
    assert len(data["alerts"]) >= 1

    # Verify retention via GET /v1/alerts
    alerts_resp = client.get("/v1/alerts?service=batch-alert-service")
    assert alerts_resp.status_code == 200
    assert len(alerts_resp.json()) >= 1


def test_active_alerts_max_retention_limit():
    # Evaluate multiple anomalous events to push more than 50 alerts into active_alerts
    for i in range(60):
        event_payload = {
            "event_id": f"evt_overflow_{i}",
            "timestamp_utc": "2026-10-20T18:00:00Z",
            "source_service": f"overflow-service-{i}",
            "host_id": "host-1",
            "metrics": {
                "cpu_usage_pct": 99.0,
                "memory_rss_mb": 512.0,
                "latency_p99_ms": 100.0,
                "error_rate_pct": 0.1,
            },
            "raw_log": None,
            "compression": "lz4",
        }
        client.post("/v1/evaluate", json=event_payload)

    alerts_resp = client.get("/v1/alerts")
    assert alerts_resp.status_code == 200
    stored_alerts = alerts_resp.json()
    assert len(stored_alerts) == 50


def test_evaluate_invalid_payload():
    invalid_payload = {
        "event_id": "evt_invalid",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "auth-service",
        "host_id": "host-1",
        "metrics": {
            "cpu_usage_pct": 150.0,  # Invalid: cpu > 100
        },
    }
    response = client.post("/v1/evaluate", json=invalid_payload)
    assert response.status_code == 422
