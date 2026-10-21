from typing import Dict, List, Optional
from .base import BaseDetector
from .models import DetectionResult, TelemetryEvent


class SpikeDetector(BaseDetector):
    def __init__(
        self,
        latency_threshold_ms: float = 1000.0,
        error_rate_threshold_pct: float = 10.0,
        cpu_threshold_pct: float = 90.0,
        memory_threshold_mb: float = 4096.0,
        spike_multiplier: float = 3.0,
    ):
        self.latency_threshold_ms = latency_threshold_ms
        self.error_rate_threshold_pct = error_rate_threshold_pct
        self.cpu_threshold_pct = cpu_threshold_pct
        self.memory_threshold_mb = memory_threshold_mb
        self.spike_multiplier = spike_multiplier
        self._thresholds = {
            "latency_p99_ms": self.latency_threshold_ms,
            "error_rate_pct": self.error_rate_threshold_pct,
            "cpu_usage_pct": self.cpu_threshold_pct,
            "memory_rss_mb": self.memory_threshold_mb,
        }
        self._baselines: Dict[str, Dict[str, float]] = {}

    def fit(self, events: List[TelemetryEvent]) -> None:
        """Calcula líneas base medias por servicio para evaluar picos o desviaciones."""
        service_metric_values: Dict[str, Dict[str, List[float]]] = {}
        for event in events:
            if event.metrics is None:
                continue

            service = event.source_service
            if service not in service_metric_values:
                service_metric_values[service] = {}

            for metric_name in self._thresholds.keys():
                val = getattr(event.metrics, metric_name, None)
                if val is not None:
                    service_metric_values[service].setdefault(metric_name, []).append(float(val))

        for service, metrics_map in service_metric_values.items():
            self._baselines[service] = {}
            for metric_name, vals in metrics_map.items():
                if vals:
                    self._baselines[service][metric_name] = sum(vals) / len(vals)

    def detect(self, event: TelemetryEvent) -> List[DetectionResult]:
        """Detecta picos pronunciados que sobrepasan umbrales absolutos o líneas base."""
        results: List[DetectionResult] = []
        if event.metrics is None:
            return results

        service = event.source_service

        for metric_name, default_threshold in self._thresholds.items():
            val = getattr(event.metrics, metric_name, None)
            if val is None:
                continue

            val_float = float(val)
            baseline = self._baselines.get(service, {}).get(metric_name, None)
            threshold = default_threshold

            if baseline and baseline > 0:
                z_score = (val_float - baseline) / baseline
            elif threshold > 0:
                z_score = (val_float - threshold) / threshold
            else:
                z_score = 0.0

            # Anomaly triggered if exceeding absolute threshold OR exceeding baseline * spike_multiplier (while >= half threshold)
            is_anomaly = val_float >= threshold or (
                baseline is not None
                and baseline > 0
                and val_float >= baseline * self.spike_multiplier
                and val_float >= threshold * 0.5
            )

            results.append(
                DetectionResult(
                    metric_name=metric_name,
                    is_anomaly=is_anomaly,
                    z_score=round(z_score, 4),
                    current_value=val_float,
                    threshold=float(threshold),
                    detector_name="SpikeDetector",
                )
            )

        return results


# Alias for specific latency / error spike detector naming
LatencyErrorSpikeDetector = SpikeDetector
