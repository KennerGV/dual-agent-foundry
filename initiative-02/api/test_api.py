import sys
from pathlib import Path

from fastapi.testclient import TestClient

# Ensure initiative-02 directory is in sys.path
init_02_path = Path(__file__).parent.parent
if str(init_02_path) not in sys.path:
    sys.path.insert(0, str(init_02_path))

from api.app import app

client = TestClient(app)


def test_healthz():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "anomaly-sentinel"}


def test_get_alerts_unfiltered_and_filtered():
    response = client.get("/v1/alerts")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    response_filtered = client.get("/v1/alerts?service=payment-gateway-prod")
    assert response_filtered.status_code == 200
    for alert in response_filtered.json():
        assert alert["source_service"] == "payment-gateway-prod"


def test_evaluate_single_anomalous_event():
    event_data = {
        "event_id": "evt_sec_exploit_99",
        "timestamp_utc": "2026-10-20T18:00:00Z",
        "source_service": "payment-gateway-prod",
        "host_id": "node-us-east-04",
        "metrics": {
            "cpu_usage_pct": 50.0,
            "memory_rss_mb": 512.0,
            "latency_p99_ms": 100.0,
            "error_rate_pct": 0.0,
        },
        "raw_log": "UNION SELECT password FROM admin",
        "compression": "lz4",
    }
    response = client.post("/v1/evaluate", json=event_data)
    assert response.status_code == 200
    alerts = response.json()
    assert len(alerts) >= 1
    alert = alerts[0]
    assert alert["source_service"] == "payment-gateway-prod"
    assert alert["recommended_severity"] == "SEV-1"


def test_evaluate_batch():
    batch_data = {
        "events": [
            {
                "event_id": "evt_normal_batch_01",
                "timestamp_utc": "2026-10-20T18:00:00Z",
                "source_service": "auth-service-test",
                "host_id": "node-1",
                "metrics": {
                    "cpu_usage_pct": 10.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
                "raw_log": "All normal",
            },
            {
                "event_id": "evt_high_cpu_batch_02",
                "timestamp_utc": "2026-10-20T18:01:00Z",
                "source_service": "auth-service-test",
                "host_id": "node-1",
                "metrics": {
                    "cpu_usage_pct": 95.0,
                    "memory_rss_mb": 256.0,
                    "latency_p99_ms": 50.0,
                    "error_rate_pct": 0.0,
                },
                "raw_log": None,
            },
        ]
    }
    response = client.post("/v1/evaluate/batch", json=batch_data)
    assert response.status_code == 200
    data = response.json()
    assert data["processed_count"] == 2
    assert isinstance(data["alerts"], list)
    assert len(data["alerts"]) >= 1
