from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class TelemetryMetrics(BaseModel):
    cpu_usage_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    memory_rss_mb: Optional[float] = Field(default=None, ge=0.0)
    latency_p99_ms: Optional[float] = Field(default=None, ge=0.0)
    error_rate_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)


class TelemetryEvent(BaseModel):
    event_id: str = Field(..., description="ID único del evento de telemetría")
    timestamp_utc: datetime = Field(..., description="Marca temporal UTC de ocurrencia")
    source_service: str = Field(..., description="Nombre del servicio origen (e.g. payment-gateway-prod)")
    host_id: str = Field(..., description="Identificador del host/nodo")
    metrics: TelemetryMetrics = Field(..., description="Métricas asociadas al evento")
    raw_log: Optional[str] = Field(default=None, description="Log crudo o mensaje de error")
    compression: Optional[str] = Field(default="lz4", description="Algoritmo de compresión si aplica")


class AnomalyAlert(BaseModel):
    alert_id: str = Field(..., description="ID único de la alerta generada")
    detected_at_utc: datetime = Field(..., description="Marca temporal de detección")
    source_event_ids: List[str] = Field(..., description="Lista de IDs de eventos origen")
    source_service: str = Field(..., description="Servicio afectado")
    anomaly_type: str = Field(..., description="Categoría de la anomalía (e.g. LATENCY_SPIKE_AND_ERROR_SURGE)")
    z_score: float = Field(..., description="Puntaje Z calculado o ponderado")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Nivel de confianza entre 0.0 y 1.0")
    recommended_severity: str = Field(..., description="Nivel de severidad recomendado: SEV-1, SEV-2, SEV-3, SEV-4")


class DetectionResult(BaseModel):
    metric_name: str
    is_anomaly: bool
    z_score: float
    current_value: float
    threshold: float
    detector_name: str


class RuleEvaluationResult(BaseModel):
    rule_id: str
    rule_name: str
    triggered: bool
    anomaly_type: str
    severity: str
    confidence: float
    description: str


class EvaluationBatchRequest(BaseModel):
    events: List[TelemetryEvent]


class EvaluationBatchResponse(BaseModel):
    processed_count: int
    alerts: List[AnomalyAlert]
