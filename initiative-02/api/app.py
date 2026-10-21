from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI

from api.models import (
    AnomalyAlert,
    EvaluationBatchRequest,
    EvaluationBatchResponse,
    TelemetryEvent,
)
from api.service import EvaluationService

app = FastAPI(title="Anomaly Sentinel API", version="0.1.0")
evaluation_service = EvaluationService()

active_alerts: List[AnomalyAlert] = [
    AnomalyAlert(
        alert_id="alt_3c2d1e0f",
        detected_at_utc=datetime(2026, 10, 21, 3, 15, 2, tzinfo=timezone.utc),
        source_event_ids=["evt_9f8a7b6c"],
        source_service="payment-gateway-prod",
        anomaly_type="LATENCY_SPIKE_AND_ERROR_SURGE",
        z_score=4.85,
        confidence=0.96,
        recommended_severity="SEV-1",
    ),
    AnomalyAlert(
        alert_id="alt_8g7f6e5d",
        detected_at_utc=datetime(2026, 10, 21, 3, 14, 40, tzinfo=timezone.utc),
        source_event_ids=["evt_5e6f7g8h"],
        source_service="order-processor-prod",
        anomaly_type="QUEUE_BACKLOG_WARNING",
        z_score=2.15,
        confidence=0.82,
        recommended_severity="SEV-3",
    ),
]


@app.get("/healthz")
def health_check():
    return {"status": "ok", "service": "anomaly-sentinel"}


@app.get("/v1/alerts", response_model=List[AnomalyAlert])
def list_alerts(service: Optional[str] = None) -> List[AnomalyAlert]:
    if service:
        return [a for a in active_alerts if a.source_service == service]
    return list(active_alerts)


@app.post("/v1/evaluate", response_model=List[AnomalyAlert])
def evaluate_event(event: TelemetryEvent) -> List[AnomalyAlert]:
    generated = evaluation_service.evaluate_event(event)
    for alert in reversed(generated):
        active_alerts.insert(0, alert)
    del active_alerts[50:]
    return generated


@app.post("/v1/evaluate/batch", response_model=EvaluationBatchResponse)
def evaluate_batch(request: EvaluationBatchRequest) -> EvaluationBatchResponse:
    response = evaluation_service.evaluate_batch(request)
    for alert in reversed(response.alerts):
        active_alerts.insert(0, alert)
    del active_alerts[50:]
    return response
