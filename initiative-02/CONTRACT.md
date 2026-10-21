# Initiative 02 — Anomaly Sentinel Technical Contract (`CONTRACT.md`)

## 1. Visión General
Este documento define los modelos de datos (Pydantic v2), firmas de funciones e interfaces abstractas entre las tres capas principales de **`initiative-02/` (Anomaly Sentinel)**:
1. `detectors/`: Detectores estadísticos (Z-Score, series temporales / promedios móviles).
2. `rules/`: Motor declarativo de reglas de seguridad y umbrales.
3. `api/`: Servidor REST (FastAPI) para evaluación individual y en lote.

---

## 2. Modelos de Datos Centrales (Pydantic v2)

### 2.1 `TelemetryMetrics`
Representa las métricas numéricas contenidas en un evento de telemetría.

```python
from typing import Optional
from pydantic import BaseModel, Field

class TelemetryMetrics(BaseModel):
    cpu_usage_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    memory_rss_mb: Optional[float] = Field(default=None, ge=0.0)
    latency_p99_ms: Optional[float] = Field(default=None, ge=0.0)
    error_rate_pct: Optional[float] = Field(default=None, ge=0.0, le=100.0)
```

### 2.2 `TelemetryEvent` (Entrada Principal - Consumido desde Initiative 01)
```python
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class TelemetryEvent(BaseModel):
    event_id: str = Field(..., description="ID único del evento de telemetría")
    timestamp_utc: datetime = Field(..., description="Marca temporal UTC de ocurrencia")
    source_service: str = Field(..., description="Nombre del servicio origen (e.g. payment-gateway-prod)")
    host_id: str = Field(..., description="Identificador del host/nodo")
    metrics: TelemetryMetrics = Field(..., description="Métricas asociadas al evento")
    raw_log: Optional[str] = Field(default=None, description="Log crudo o mensaje de error")
    compression: Optional[str] = Field(default="lz4", description="Algoritmo de compresión si aplica")
```

### 2.3 `AnomalyAlert` (Salida Principal - Producido hacia Initiative 03)
```python
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class AnomalyAlert(BaseModel):
    alert_id: str = Field(..., description="ID único de la alerta generada")
    detected_at_utc: datetime = Field(..., description="Marca temporal de detección")
    source_event_ids: List[str] = Field(..., description="Lista de IDs de eventos origen")
    source_service: str = Field(..., description="Servicio afectado")
    anomaly_type: str = Field(..., description="Categoría de la anomalía (e.g. LATENCY_SPIKE_AND_ERROR_SURGE)")
    z_score: float = Field(..., description="Puntaje Z calculado o ponderado")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Nivel de confianza entre 0.0 y 1.0")
    recommended_severity: str = Field(..., description="Nivel de severidad recomendado: SEV-1, SEV-2, SEV-3")
```

### 2.4 Modelos Intermedios y de Lote

```python
from typing import List, Optional
from pydantic import BaseModel, Field

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
```

---

## 3. Interfaces por Capa

### 3.1 Capa `detectors/`
Definición de interfaz base y firmas que debe implementar `J2-Core`.

```python
from abc import ABC, abstractmethod
from typing import List, Optional

class BaseDetector(ABC):
    @abstractmethod
    def fit(self, events: List[TelemetryEvent]) -> None:
        """Entrena o actualiza la línea base histórica del detector."""
        pass

    @abstractmethod
    def detect(self, event: TelemetryEvent) -> List[DetectionResult]:
        """Evalúa un evento contra el modelo/estadísticas actuales."""
        pass

class ZScoreDetector(BaseDetector):
    def __init__(self, threshold: float = 3.0):
        self.threshold = threshold

    def fit(self, events: List[TelemetryEvent]) -> None: ...
    def detect(self, event: TelemetryEvent) -> List[DetectionResult]: ...

class TimeSeriesDetector(BaseDetector):
    def __init__(self, window_size: int = 10, threshold_std: float = 2.5):
        self.window_size = window_size
        self.threshold_std = threshold_std

    def fit(self, events: List[TelemetryEvent]) -> None: ...
    def detect(self, event: TelemetryEvent) -> List[DetectionResult]: ...
```

### 3.2 Capa `rules/`
Definición del motor declarativo y reglas que debe implementar `J2-Rules`.

```python
from abc import ABC, abstractmethod
from typing import List, Optional

class BaseRule(ABC):
    @abstractmethod
    def evaluate(self, event: TelemetryEvent, detections: List[DetectionResult]) -> Optional[RuleEvaluationResult]:
        """Evalúa las condiciones de la regla sobre las detecciones de un evento."""
        pass

class RuleEngine:
    def __init__(self, rules: Optional[List[BaseRule]] = None):
        self.rules: List[BaseRule] = rules or []

    def register_rule(self, rule: BaseRule) -> None: ...
    def evaluate_all(self, event: TelemetryEvent, detections: List[DetectionResult]) -> List[AnomalyAlert]: ...
```

### 3.3 Capa `api/`
Endpoints REST expuestos por FastAPI que debe implementar `J2-API`.

- `GET /healthz`
  - Resp: `{"status": "ok", "service": "anomaly-sentinel"}`
- `POST /v1/evaluate`
  - Body: `TelemetryEvent`
  - Resp: `List[AnomalyAlert]`
- `POST /v1/evaluate/batch`
  - Body: `EvaluationBatchRequest`
  - Resp: `EvaluationBatchResponse`

---

## 4. Flujo de Datos Interno

```
[TelemetryEvent]
       │
       ▼
 1. Capa detectors/ ──────► List[DetectionResult] (Z-Score / TimeSeries)
       │
       ▼
 2. Capa rules/     ──────► List[RuleEvaluationResult] & Combinación de alertas
       │
       ▼
 3. Capa api/       ──────► Retorna List[AnomalyAlert] al cliente HTTP
```
