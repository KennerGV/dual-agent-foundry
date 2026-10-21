"""
Detectors package for Anomaly Sentinel (Initiative 02).
Statistical anomaly detection algorithms (Z-Score, moving windows, spikes).
"""

from .base import BaseDetector
from .models import (
    AnomalyAlert,
    DetectionResult,
    EvaluationBatchRequest,
    EvaluationBatchResponse,
    RuleEvaluationResult,
    TelemetryEvent,
    TelemetryMetrics,
)
from .spike import LatencyErrorSpikeDetector, SpikeDetector
from .timeseries import TimeSeriesDetector
from .zscore import ZScoreDetector

__all__ = [
    "BaseDetector",
    "ZScoreDetector",
    "TimeSeriesDetector",
    "SpikeDetector",
    "LatencyErrorSpikeDetector",
    "TelemetryMetrics",
    "TelemetryEvent",
    "AnomalyAlert",
    "DetectionResult",
    "RuleEvaluationResult",
    "EvaluationBatchRequest",
    "EvaluationBatchResponse",
]
