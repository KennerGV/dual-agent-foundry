from abc import ABC, abstractmethod
from typing import List
from .models import DetectionResult, TelemetryEvent


class BaseDetector(ABC):
    @abstractmethod
    def fit(self, events: List[TelemetryEvent]) -> None:
        """Entrena o actualiza la línea base histórica del detector."""
        pass

    @abstractmethod
    def detect(self, event: TelemetryEvent) -> List[DetectionResult]:
        """Evalúa un evento contra el modelo/estadísticas actuales."""
        pass
