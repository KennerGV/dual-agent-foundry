from abc import ABC, abstractmethod
from typing import List, Optional
from .models import TelemetryEvent, DetectionResult, RuleEvaluationResult


class BaseRule(ABC):
    @abstractmethod
    def evaluate(
        self, event: TelemetryEvent, detections: List[DetectionResult]
    ) -> Optional[RuleEvaluationResult]:
        """Evalúa las condiciones de la regla sobre un evento y sus detecciones."""
        pass
