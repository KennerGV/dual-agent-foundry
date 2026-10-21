from typing import List
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


@app.get("/healthz")
def health_check():
    return {"status": "ok", "service": "anomaly-sentinel"}


@app.post("/v1/evaluate", response_model=List[AnomalyAlert])
def evaluate_event(event: TelemetryEvent) -> List[AnomalyAlert]:
    return evaluation_service.evaluate_event(event)


@app.post("/v1/evaluate/batch", response_model=EvaluationBatchResponse)
def evaluate_batch(request: EvaluationBatchRequest) -> EvaluationBatchResponse:
    return evaluation_service.evaluate_batch(request)
