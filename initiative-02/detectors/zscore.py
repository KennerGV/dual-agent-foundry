import math
from typing import Dict, List, Optional
from .base import BaseDetector
from .models import DetectionResult, TelemetryEvent

METRIC_FIELDS = ("cpu_usage_pct", "memory_rss_mb", "latency_p99_ms", "error_rate_pct")


class ZScoreDetector(BaseDetector):
    def __init__(self, threshold: float = 3.0):
        self.threshold = threshold
        self._service_stats: Dict[str, Dict[str, Dict[str, float]]] = {}
        self._global_stats: Dict[str, Dict[str, float]] = {}

    def fit(self, events: List[TelemetryEvent]) -> None:
        """Entrena o actualiza la línea base histórica del detector."""
        service_metric_values: Dict[str, Dict[str, List[float]]] = {}
        global_metric_values: Dict[str, List[float]] = {}

        for event in events:
            service = event.source_service
            if service not in service_metric_values:
                service_metric_values[service] = {}

            if event.metrics is None:
                continue

            for field_name in METRIC_FIELDS:
                val = getattr(event.metrics, field_name, None)
                if val is not None:
                    service_metric_values[service].setdefault(field_name, []).append(val)
                    global_metric_values.setdefault(field_name, []).append(val)

        # Compute per-service stats
        self._service_stats = {}
        for service, metrics_map in service_metric_values.items():
            self._service_stats[service] = {}
            for metric_name, values in metrics_map.items():
                if values:
                    mean = sum(values) / len(values)
                    variance = sum((x - mean) ** 2 for x in values) / len(values)
                    std = math.sqrt(variance)
                    self._service_stats[service][metric_name] = {"mean": mean, "std": std}

        # Compute global stats
        self._global_stats = {}
        for metric_name, values in global_metric_values.items():
            if values:
                mean = sum(values) / len(values)
                variance = sum((x - mean) ** 2 for x in values) / len(values)
                std = math.sqrt(variance)
                self._global_stats[metric_name] = {"mean": mean, "std": std}

    def detect(self, event: TelemetryEvent) -> List[DetectionResult]:
        """Evalúa un evento contra el modelo/estadísticas actuales."""
        results: List[DetectionResult] = []
        if event.metrics is None:
            return results

        service = event.source_service

        for field_name in METRIC_FIELDS:
            val = getattr(event.metrics, field_name, None)
            if val is None:
                continue

            stats: Optional[Dict[str, float]] = None
            if service in self._service_stats and field_name in self._service_stats[service]:
                stats = self._service_stats[service][field_name]
            elif field_name in self._global_stats:
                stats = self._global_stats[field_name]

            if stats and stats["std"] > 0:
                mean = stats["mean"]
                std = stats["std"]
                z_score = (val - mean) / std
            else:
                z_score = 0.0

            is_anomaly = abs(z_score) >= self.threshold
            results.append(
                DetectionResult(
                    metric_name=field_name,
                    is_anomaly=is_anomaly,
                    z_score=round(z_score, 4),
                    current_value=float(val),
                    threshold=float(self.threshold),
                    detector_name="ZScoreDetector",
                )
            )

        return results
