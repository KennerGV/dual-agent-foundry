"""
API package for Anomaly Sentinel (Initiative 02).
REST API service endpoints for event and batch evaluation.
"""

from api.app import app
from api.models import (
    AnomalyAlert,
    DetectionResult,
    EvaluationBatchRequest,
    EvaluationBatchResponse,
    RuleEvaluationResult,
    TelemetryEvent,
    TelemetryMetrics,
)
from api.service import EvaluationService

__all__ = [
    "app",
    "EvaluationService",
    "TelemetryMetrics",
    "TelemetryEvent",
    "AnomalyAlert",
    "DetectionResult",
    "RuleEvaluationResult",
    "EvaluationBatchRequest",
    "EvaluationBatchResponse",
]
