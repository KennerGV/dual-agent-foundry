import sys
from pathlib import Path
from datetime import datetime, timezone

from fastapi.testclient import TestClient

# Ensure initiative-02 directory is in sys.path
init_02_path = Path(__file__).parent.parent
if str(init_02_path) not in sys.path:
    sys.path.insert(0, str(init_02_path))

from api.app import app
from api.models import TelemetryEvent, TelemetryMetrics, EvaluationBatchRequest

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "anomaly-sentinel"}


def test_evaluate_single_normal_event():
    event_data = {
        "event_id": "evt_normal_01",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway-prod",
        "host_id": "node-us-east-01",
        "metrics": {
            "cpu_usage_pct": 25.0,
            "memory_rss_mb": 512.0,
            "latency_p99_ms": 120.0,
            "error_rate_pct": 0.5,
        },
        "raw_log": None,
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_data)
    assert response.status_code == 200
    assert response.json() == []


def test_evaluate_single_anomalous_event():
    event_data = {
        "event_id": "evt_9f8a7b6c",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway-prod",
        "host_id": "node-us-east-04",
        "metrics": {
            "cpu_usage_pct": 94.2,
            "memory_rss_mb": 3840.0,
            "latency_p99_ms": 1420.5,
            "error_rate_pct": 18.4,
        },
        "raw_log": "ERROR [conn_pool] timeout acquiring connection after 1000ms",
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_data)
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["source_service"] == "payment-gateway-prod"
    assert alert["anomaly_type"] == "LATENCY_SPIKE_AND_ERROR_SURGE"
    assert alert["recommended_severity"] == "SEV-1"
    assert alert["confidence"] == 0.96


def test_evaluate_batch():
    batch_data = {
        "events": [
            {
                "event_id": "evt_normal",
                "timestamp_utc": "2026-10-20T18:00:00Z",
                "source_service": "auth-service",
                "host_id": "node-1",
                "metrics": {
                    "cpu_usage_pct": 10.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
            },
            {
                "event_id": "evt_high_cpu",
                "timestamp_utc": "2026-10-20T18:01:00Z",
                "source_service": "auth-service",
                "host_id": "node-1",
                "metrics": {
                    "cpu_usage_pct": 95.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
            },
        ]
    }
    response = client.post("/v1/evaluate/batch", json=batch_data)
    assert response.status_code == 200
    data = response.json()
    assert data["processed_count"] == 2
    assert len(data["alerts"]) == 1
    assert data["alerts"][0]["anomaly_type"] == "HIGH_CPU_USAGE"
    assert data["alerts"][0]["recommended_severity"] == "SEV-3"
