from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from api.app import app

client = TestClient(app)


def test_healthz_endpoint():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "anomaly-sentinel"}


def test_evaluate_single_normal_event():
    event_payload = {
        "event_id": "evt_norm_01",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway",
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
    # Normal event should return empty list of alerts
    assert response.json() == []


def test_evaluate_single_anomalous_event():
    event_payload = {
        "event_id": "evt_high_cpu",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway",
        "host_id": "host-1",
        "metrics": {
            "cpu_usage_pct": 98.0,
            "memory_rss_mb": 512.0,
            "latency_p99_ms": 100.0,
            "error_rate_pct": 0.1,
        },
        "raw_log": None,
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_payload)
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) >= 1
    alert = alerts[0]
    assert alert["source_service"] == "payment-gateway"
    assert "source_event_ids" in alert
    assert "recommended_severity" in alert


def test_evaluate_batch_endpoint():
    batch_payload = {
        "events": [
            {
                "event_id": "evt_b1",
                "timestamp_utc": "2026-10-20T18:00:00Z",
                "source_service": "auth-service",
                "host_id": "host-1",
                "metrics": {
                    "cpu_usage_pct": 15.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
            },
            {
                "event_id": "evt_b2",
                "timestamp_utc": "2026-10-20T18:01:00Z",
                "source_service": "auth-service",
                "host_id": "host-1",
                "metrics": {
                    "cpu_usage_pct": 20.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 55.0,
                    "error_rate_pct": 0.0,
                },
            },
        ]
    }
    response = client.post("/v1/evaluate/batch", json=batch_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["processed_count"] == 2
    assert isinstance(data["alerts"], list)


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
