import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from .base import BaseRule
from .models import AnomalyAlert, DetectionResult, RuleEvaluationResult, TelemetryEvent


class RawLogSecurityRule(BaseRule):
    """Rule that inspects `raw_log` for security attack patterns and assigns severity (SEV-1 to SEV-4)."""

    def __init__(self):
        self.rule_id = "RULE-SEC-001"
        self.rule_name = "Raw Log Security Pattern Inspection"

        # Pattern definitions mapped to severity and details
        self.sev1_patterns = [
            r"(?i)\b(union\s+select|drop\s+table|exec\(|system\(|passthru|/bin/sh|/bin/bash)\b",
            r"(?i)\b(remote\s+code\s+execution|rce_attempt|root_compromise|unauthorized_root)\b",
        ]
        self.sev2_patterns = [
            r"(?i)<script\b",
            r"(?i)\b(etc/passwd|\.\./\.\./|path_traversal)\b",
            r"(?i)\b(unauthorized_access|auth_bypass|forbidden_access|jwt_invalid)\b",
            r"(?i)\b(out\s+of\s+memory|oom_killer|segmentation\s+fault)\b",
        ]
        self.sev3_patterns = [
            r"(?i)\b(exception|stacktrace|sql_exception|connection_refused|timeout_error)\b",
            r"(?i)\b(invalid_input|validation_failed|auth_failure)\b",
        ]
        self.sev4_patterns = [
            r"(?i)\b(warning|deprecated|notice)\b",
        ]

    def evaluate(
        self, event: TelemetryEvent, detections: List[DetectionResult]
    ) -> Optional[RuleEvaluationResult]:
        if not event.raw_log:
            return RuleEvaluationResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=False,
                anomaly_type="NONE",
                severity="SEV-4",
                confidence=0.0,
                description="No raw_log provided in telemetry event.",
            )

        log = event.raw_log

        # Check SEV-1
        for pat in self.sev1_patterns:
            if re.search(pat, log):
                return RuleEvaluationResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    anomaly_type="CRITICAL_SECURITY_EXPLOIT_ATTEMPT",
                    severity="SEV-1",
                    confidence=0.95,
                    description=f"Critical security exploit or attack vector detected in log: {log[:100]}",
                )

        # Check SEV-2
        for pat in self.sev2_patterns:
            if re.search(pat, log):
                return RuleEvaluationResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    anomaly_type="SECURITY_THREAT_DETECTED",
                    severity="SEV-2",
                    confidence=0.85,
                    description=f"Security threat or unauthorized activity detected in log: {log[:100]}",
                )

        # Check SEV-3
        for pat in self.sev3_patterns:
            if re.search(pat, log):
                return RuleEvaluationResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    anomaly_type="APPLICATION_ERROR_LOGGED",
                    severity="SEV-3",
                    confidence=0.70,
                    description=f"Application error pattern found in log: {log[:100]}",
                )

        # Check SEV-4
        for pat in self.sev4_patterns:
            if re.search(pat, log):
                return RuleEvaluationResult(
                    rule_id=self.rule_id,
                    rule_name=self.rule_name,
                    triggered=True,
                    anomaly_type="LOG_WARNING",
                    severity="SEV-4",
                    confidence=0.50,
                    description=f"Minor warning logged in raw_log: {log[:100]}",
                )

        return RuleEvaluationResult(
            rule_id=self.rule_id,
            rule_name=self.rule_name,
            triggered=False,
            anomaly_type="NONE",
            severity="SEV-4",
            confidence=0.0,
            description="No matching security or error patterns found in raw_log.",
        )


class CriticalThresholdRule(BaseRule):
    """Rule that checks numerical metrics against critical system thresholds."""

    def __init__(
        self,
        cpu_crit: float = 90.0,
        mem_crit_mb: float = 8192.0,
        latency_crit_ms: float = 2000.0,
        error_crit_pct: float = 15.0,
    ):
        self.rule_id = "RULE-METRIC-001"
        self.rule_name = "Critical Metric Threshold Rule"
        self.cpu_crit = cpu_crit
        self.mem_crit_mb = mem_crit_mb
        self.latency_crit_ms = latency_crit_ms
        self.error_crit_pct = error_crit_pct

    def evaluate(
        self, event: TelemetryEvent, detections: List[DetectionResult]
    ) -> Optional[RuleEvaluationResult]:
        metrics = event.metrics
        violations = []

        if metrics.cpu_usage_pct is not None and metrics.cpu_usage_pct >= self.cpu_crit:
            violations.append(f"CPU usage ({metrics.cpu_usage_pct}%) >= {self.cpu_crit}%")

        if metrics.memory_rss_mb is not None and metrics.memory_rss_mb >= self.mem_crit_mb:
            violations.append(f"Memory RSS ({metrics.memory_rss_mb} MB) >= {self.mem_crit_mb} MB")

        if metrics.latency_p99_ms is not None and metrics.latency_p99_ms >= self.latency_crit_ms:
            violations.append(f"Latency p99 ({metrics.latency_p99_ms} ms) >= {self.latency_crit_ms} ms")

        if metrics.error_rate_pct is not None and metrics.error_rate_pct >= self.error_crit_pct:
            violations.append(f"Error rate ({metrics.error_rate_pct}%) >= {self.error_crit_pct}%")

        if not violations:
            return RuleEvaluationResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=False,
                anomaly_type="NONE",
                severity="SEV-4",
                confidence=0.0,
                description="All metrics are within acceptable thresholds.",
            )

        # Severity classification based on multiple or specific violations
        if len(violations) >= 3 or (
            metrics.error_rate_pct is not None
            and metrics.error_rate_pct >= 50.0
        ):
            sev = "SEV-1"
            anomaly_type = "MULTIPLE_CRITICAL_THRESHOLDS_EXCEEDED"
            conf = 0.95
        elif len(violations) == 2 or (
            metrics.error_rate_pct is not None
            and metrics.error_rate_pct >= self.error_crit_pct
        ):
            sev = "SEV-2"
            anomaly_type = "LATENCY_SPIKE_AND_ERROR_SURGE" if (
                metrics.latency_p99_ms is not None and metrics.latency_p99_ms >= self.latency_crit_ms
            ) else "CRITICAL_METRIC_THRESHOLD_EXCEEDED"
            conf = 0.85
        else:
            sev = "SEV-3"
            anomaly_type = "METRIC_THRESHOLD_WARNING"
            conf = 0.70

        return RuleEvaluationResult(
            rule_id=self.rule_id,
            rule_name=self.rule_name,
            triggered=True,
            anomaly_type=anomaly_type,
            severity=sev,
            confidence=conf,
            description="Threshold violations: " + "; ".join(violations),
        )


class AnomalyDetectionRule(BaseRule):
    """Rule that evaluates statistical anomaly detections output by statistical detectors."""

    def __init__(self):
        self.rule_id = "RULE-DETECTOR-001"
        self.rule_name = "Statistical Anomaly Detection Rule"

    def evaluate(
        self, event: TelemetryEvent, detections: List[DetectionResult]
    ) -> Optional[RuleEvaluationResult]:
        active_anomalies = [d for d in detections if d.is_anomaly]

        if not active_anomalies:
            return RuleEvaluationResult(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                triggered=False,
                anomaly_type="NONE",
                severity="SEV-4",
                confidence=0.0,
                description="No statistical anomalies detected.",
            )

        max_z = max(abs(d.z_score) for d in active_anomalies)

        if max_z >= 5.0 or len(active_anomalies) >= 3:
            sev = "SEV-1"
            conf = 0.90
        elif max_z >= 3.5 or len(active_anomalies) == 2:
            sev = "SEV-2"
            conf = 0.80
        else:
            sev = "SEV-3"
            conf = 0.65

        metrics_anomalous = [d.metric_name for d in active_anomalies]
        anomaly_type = f"STATISTICAL_ANOMALY_{'_AND_'.join(m.upper() for m in metrics_anomalous)}"

        return RuleEvaluationResult(
            rule_id=self.rule_id,
            rule_name=self.rule_name,
            triggered=True,
            anomaly_type=anomaly_type,
            severity=sev,
            confidence=conf,
            description=f"Statistical anomalies found in: {', '.join(metrics_anomalous)} (Max Z-score: {max_z:.2f})",
        )


def get_default_rules() -> List[BaseRule]:
    return [
        RawLogSecurityRule(),
        CriticalThresholdRule(),
        AnomalyDetectionRule(),
    ]


class RuleEngine:
    def __init__(self, rules: Optional[List[BaseRule]] = None):
        self.rules: List[BaseRule] = rules if rules is not None else get_default_rules()

    def register_rule(self, rule: BaseRule) -> None:
        self.rules.append(rule)

    def evaluate_all(
        self, event: TelemetryEvent, detections: List[DetectionResult]
    ) -> List[AnomalyAlert]:
        alerts: List[AnomalyAlert] = []

        for rule in self.rules:
            result = rule.evaluate(event, detections)
            if result and result.triggered:
                # Determine representative Z-score
                if detections:
                    z_score = max(abs(d.z_score) for d in detections)
                else:
                    z_score = 0.0

                alert = AnomalyAlert(
                    alert_id=f"alert-{uuid.uuid4().hex[:12]}",
                    detected_at_utc=datetime.now(timezone.utc),
                    source_event_ids=[event.event_id],
                    source_service=event.source_service,
                    anomaly_type=result.anomaly_type,
                    z_score=z_score,
                    confidence=result.confidence,
                    recommended_severity=result.severity,
                )
                alerts.append(alert)

        return alerts
