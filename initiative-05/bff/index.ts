// Upstream Data Models & BFF Adapter Contracts

export interface Metrics {
  cpu_usage_pct: number;
  memory_rss_mb: number;
  latency_p99_ms: number;
  error_rate_pct: number;
}

export interface TelemetryEvent {
  event_id: string;
  timestamp_utc: string;
  source_service: string;
  host_id: string;
  metrics: Metrics;
  raw_log: string;
  compression: string;
}

export type Severity = "SEV-1" | "SEV-2" | "SEV-3";

export interface AnomalyAlert {
  alert_id: string;
  detected_at_utc: string;
  source_event_ids: string[];
  source_service: string;
  anomaly_type: string;
  z_score: number;
  confidence: number;
  recommended_severity: Severity;
}

export type IncidentStatus = "OPEN" | "MITIGATING" | "RESOLVED" | "CLOSED";

export interface IncidentRecord {
  incident_id: string;
  status: IncidentStatus;
  severity: Severity;
  service: string;
  deduplicated_alerts_count: number;
  active_runbook: string;
  opened_at_utc: string;
  updated_at_utc: string;
}

export interface RunbookExecutionRequest {
  incident_id: string;
  runbook_id: string;
  triggered_by: string;
}

export interface RunbookExecutionResult {
  execution_id: string;
  incident_id: string;
  runbook_id: string;
  status: "EXECUTING" | "SUCCESS" | "FAILED";
  executed_at: string;
  message: string;
}

export interface ChaosExperimentResult {
  experiment_id: string;
  scenario: string;
  target_service: string;
  injected_events_count: number;
  detection_time_ms: number;
  mitigation_recovery_mttr_ms: number;
  passed_sla: boolean;
}

export interface ChaosExperimentConfig {
  experiment_id: string;
  scenario_type: string;
  target_service: string;
  intensity: number;
  duration_seconds: number;
  sla_max_mttr_ms: number;
  sla_max_detection_ms: number;
}

export interface WarRoomSummary {
  active_incidents_count: number;
  sev1_count: number;
  system_health_score: number;
  total_telemetry_events_ingested: number;
  average_mttr_ms: number;
  last_updated_utc: string;
}

export interface ServiceOverview {
  service_name: string;
  health_status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  active_incidents: IncidentRecord[];
  recent_alerts: AnomalyAlert[];
  latest_telemetry?: TelemetryEvent;
}

export interface TelemetryClientAdapter {
  fetchRecentEvents(service?: string, limit?: number): Promise<TelemetryEvent[]>;
}

export interface AlertClientAdapter {
  fetchActiveAlerts(service?: string): Promise<AnomalyAlert[]>;
}

export interface IncidentClientAdapter {
  fetchIncidents(status?: IncidentStatus, service?: string): Promise<IncidentRecord[]>;
  triggerRunbook(request: RunbookExecutionRequest): Promise<RunbookExecutionResult>;
}

export interface ChaosClientAdapter {
  triggerExperiment(config: ChaosExperimentConfig): Promise<ChaosExperimentResult>;
  fetchExperimentHistory(limit?: number): Promise<ChaosExperimentResult[]>;
}

export interface WarRoomBffAggregator {
  getWarRoomSummary(): Promise<WarRoomSummary>;
  getServiceOverview(serviceName: string): Promise<ServiceOverview>;
}
