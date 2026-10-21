export interface ChaosExperimentResult {
  experiment_id: string;
  scenario: string;
  target_service: string;
  injected_events_count: number;
  detection_time_ms: number;
  mitigation_recovery_mttr_ms: number;
  passed_sla: boolean;
}

export interface SyntheticEvent {
  event_id: string;
  timestamp_utc: string;
  source_service: string;
  host_id: string;
  metrics: {
    cpu_usage_pct: number;
    memory_rss_mb: number;
    latency_p99_ms: number;
    error_rate_pct: number;
  };
  raw_log?: string;
  compression?: string;
}

export interface ExperimentConfig {
  experiment_id: string;
  scenario_type: string;
  target_service: string;
  intensity: number;
  duration_seconds: number;
  sla_max_mttr_ms: number;
  sla_max_detection_ms: number;
}
