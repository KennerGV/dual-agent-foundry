from collections import deque
import math
from typing import Dict, List, Optional
from .base import BaseDetector
from .models import DetectionResult, TelemetryEvent

METRIC_FIELDS = ("cpu_usage_pct", "memory_rss_mb", "latency_p99_ms", "error_rate_pct")


class TimeSeriesDetector(BaseDetector):
    def __init__(self, window_size: int = 10, threshold_std: float = 2.5):
        self.window_size = window_size
        self.threshold_std = threshold_std
        # service -> metric_name -> deque
        self._windows: Dict[str, Dict[str, deque]] = {}
        # global metric_name -> deque
        self._global_windows: Dict[str, deque] = {}

    def _get_deque(self, service: str, metric_name: str) -> deque:
        if service not in self._windows:
            self._windows[service] = {}
        if metric_name not in self._windows[service]:
            self._windows[service][metric_name] = deque(maxlen=self.window_size)
        return self._windows[service][metric_name]

    def _get_global_deque(self, metric_name: str) -> deque:
        if metric_name not in self._global_windows:
            self._global_windows[metric_name] = deque(maxlen=self.window_size)
        return self._global_windows[metric_name]

    def fit(self, events: List[TelemetryEvent]) -> None:
        """Entrena o actualiza la línea base histórica del detector."""
        for event in events:
            if event.metrics is None:
                continue

            service = event.source_service
            for field_name in METRIC_FIELDS:
                val = getattr(event.metrics, field_name, None)
                if val is not None:
                    d_service = self._get_deque(service, field_name)
                    d_service.append(float(val))
                    d_global = self._get_global_deque(field_name)
                    d_global.append(float(val))

    def detect(self, event: TelemetryEvent) -> List[DetectionResult]:
        """Evalúa un evento contra la ventana móvil actual y actualiza la ventana."""
        results: List[DetectionResult] = []
        if event.metrics is None:
            return results

        service = event.source_service

        for field_name in METRIC_FIELDS:
            val = getattr(event.metrics, field_name, None)
            if val is None:
                continue

            d_service = self._get_deque(service, field_name)
            d_global = self._get_global_deque(field_name)

            window_data = list(d_service) if len(d_service) > 0 else list(d_global)

            if window_data:
                mean = sum(window_data) / len(window_data)
                variance = sum((x - mean) ** 2 for x in window_data) / len(window_data)
                std = math.sqrt(variance)
                if std > 0:
                    z_score = (val - mean) / std
                else:
                    z_score = 0.0
            else:
                z_score = 0.0

            is_anomaly = abs(z_score) >= self.threshold_std

            results.append(
                DetectionResult(
                    metric_name=field_name,
                    is_anomaly=is_anomaly,
                    z_score=round(z_score, 4),
                    current_value=float(val),
                    threshold=float(self.threshold_std),
                    detector_name="TimeSeriesDetector",
                )
            )

            # Update moving window with new observation
            d_service.append(float(val))
            d_global.append(float(val))

        return results
