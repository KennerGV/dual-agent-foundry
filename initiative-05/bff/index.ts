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

// Deterministic Adapters & Aggregator Implementations

export class DefaultTelemetryAdapter implements TelemetryClientAdapter {
  private events: TelemetryEvent[];

  constructor(initialEvents?: TelemetryEvent[]) {
    this.events = initialEvents ?? [
      {
        event_id: "evt_9f8a7b6c",
        timestamp_utc: "2026-10-20T18:00:00Z",
        source_service: "payment-gateway-prod",
        host_id: "node-us-east-04",
        metrics: {
          cpu_usage_pct: 94.2,
          memory_rss_mb: 3840,
          latency_p99_ms: 1420.5,
          error_rate_pct: 18.4
        },
        raw_log: "ERROR [conn_pool] timeout acquiring connection after 1000ms",
        compression: "lz4"
      },
      {
        event_id: "evt_1a2b3c4d",
        timestamp_utc: "2026-10-20T17:58:00Z",
        source_service: "auth-service-prod",
        host_id: "node-us-east-01",
        metrics: {
          cpu_usage_pct: 45.0,
          memory_rss_mb: 1024,
          latency_p99_ms: 120.0,
          error_rate_pct: 0.1
        },
        raw_log: "INFO [auth] token verified successfully",
        compression: "lz4"
      },
      {
        event_id: "evt_5e6f7g8h",
        timestamp_utc: "2026-10-20T17:59:30Z",
        source_service: "order-processor-prod",
        host_id: "node-us-west-02",
        metrics: {
          cpu_usage_pct: 78.5,
          memory_rss_mb: 2048,
          latency_p99_ms: 450.2,
          error_rate_pct: 2.1
        },
        raw_log: "WARN [order_queue] queue depth exceeding soft threshold",
        compression: "lz4"
      }
    ];
  }

  async fetchRecentEvents(service?: string, limit?: number): Promise<TelemetryEvent[]> {
    let filtered = service
      ? this.events.filter((e) => e.source_service === service)
      : [...this.events];

    if (limit !== undefined && limit >= 0) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }
}

export class DefaultAlertAdapter implements AlertClientAdapter {
  private alerts: AnomalyAlert[];

  constructor(initialAlerts?: AnomalyAlert[]) {
    this.alerts = initialAlerts ?? [
      {
        alert_id: "alt_3c2d1e0f",
        detected_at_utc: "2026-10-20T18:00:02Z",
        source_event_ids: ["evt_9f8a7b6c"],
        source_service: "payment-gateway-prod",
        anomaly_type: "LATENCY_SPIKE_AND_ERROR_SURGE",
        z_score: 4.85,
        confidence: 0.96,
        recommended_severity: "SEV-1"
      },
      {
        alert_id: "alt_8g7f6e5d",
        detected_at_utc: "2026-10-20T17:59:40Z",
        source_event_ids: ["evt_5e6f7g8h"],
        source_service: "order-processor-prod",
        anomaly_type: "QUEUE_BACKLOG_WARNING",
        z_score: 2.15,
        confidence: 0.82,
        recommended_severity: "SEV-3"
      }
    ];
  }

  async fetchActiveAlerts(service?: string): Promise<AnomalyAlert[]> {
    if (service) {
      return this.alerts.filter((a) => a.source_service === service);
    }
    return [...this.alerts];
  }
}

export class DefaultIncidentAdapter implements IncidentClientAdapter {
  private incidents: IncidentRecord[];

  constructor(initialIncidents?: IncidentRecord[]) {
    this.incidents = initialIncidents ?? [
      {
        incident_id: "inc_2026_0042",
        status: "MITIGATING",
        severity: "SEV-1",
        service: "payment-gateway-prod",
        deduplicated_alerts_count: 14,
        active_runbook: "rb_restart_conn_pool_and_scale",
        opened_at_utc: "2026-10-20T18:00:03Z",
        updated_at_utc: "2026-10-20T18:00:15Z"
      }
    ];
  }

  async fetchIncidents(status?: IncidentStatus, service?: string): Promise<IncidentRecord[]> {
    return this.incidents.filter((inc) => {
      if (status && inc.status !== status) return false;
      if (service && inc.service !== service) return false;
      return true;
    });
  }

  async triggerRunbook(request: RunbookExecutionRequest): Promise<RunbookExecutionResult> {
    const timestamp = new Date().toISOString();
    return {
      execution_id: `exec_${Date.now()}`,
      incident_id: request.incident_id,
      runbook_id: request.runbook_id,
      status: "SUCCESS",
      executed_at: timestamp,
      message: `Runbook '${request.runbook_id}' executed successfully by ${request.triggered_by}.`
    };
  }
}

export class DefaultChaosAdapter implements ChaosClientAdapter {
  private history: ChaosExperimentResult[];

  constructor(initialHistory?: ChaosExperimentResult[]) {
    this.history = initialHistory ?? [
      {
        experiment_id: "chs_ddos_sim_01",
        scenario: "SYNTHETIC_LATENCY_AND_ERROR_BURST",
        target_service: "payment-gateway-prod",
        injected_events_count: 500,
        detection_time_ms: 1850,
        mitigation_recovery_mttr_ms: 12400,
        passed_sla: true
      }
    ];
  }

  async triggerExperiment(config: ChaosExperimentConfig): Promise<ChaosExperimentResult> {
    const detection_time_ms = 1500;
    const mitigation_recovery_mttr_ms = 10000;
    const passed_sla =
      detection_time_ms <= config.sla_max_detection_ms &&
      mitigation_recovery_mttr_ms <= config.sla_max_mttr_ms;

    const result: ChaosExperimentResult = {
      experiment_id: config.experiment_id,
      scenario: config.scenario_type,
      target_service: config.target_service,
      injected_events_count: config.intensity * 100,
      detection_time_ms,
      mitigation_recovery_mttr_ms,
      passed_sla
    };

    this.history.unshift(result);
    return result;
  }

  async fetchExperimentHistory(limit?: number): Promise<ChaosExperimentResult[]> {
    if (limit !== undefined && limit >= 0) {
      return this.history.slice(0, limit);
    }
    return [...this.history];
  }
}

export class DefaultWarRoomBffAggregator implements WarRoomBffAggregator {
  constructor(
    private telemetryAdapter: TelemetryClientAdapter = new DefaultTelemetryAdapter(),
    private alertAdapter: AlertClientAdapter = new DefaultAlertAdapter(),
    private incidentAdapter: IncidentClientAdapter = new DefaultIncidentAdapter(),
    private chaosAdapter: ChaosClientAdapter = new DefaultChaosAdapter()
  ) {}

  async getWarRoomSummary(): Promise<WarRoomSummary> {
    const allIncidents = await this.incidentAdapter.fetchIncidents();
    const activeIncidents = allIncidents.filter(
      (inc) => inc.status === "OPEN" || inc.status === "MITIGATING"
    );

    const sev1Count = activeIncidents.filter((inc) => inc.severity === "SEV-1").length;

    let healthDeduction = 0;
    for (const inc of activeIncidents) {
      if (inc.severity === "SEV-1") healthDeduction += 25;
      else if (inc.severity === "SEV-2") healthDeduction += 15;
      else if (inc.severity === "SEV-3") healthDeduction += 5;
    }

    const healthScore = Math.max(0, Math.min(100, 100 - healthDeduction));

    const events = await this.telemetryAdapter.fetchRecentEvents();
    const chaosHistory = await this.chaosAdapter.fetchExperimentHistory();

    const totalMttr = chaosHistory.reduce((acc, c) => acc + c.mitigation_recovery_mttr_ms, 0);
    const avgMttr = chaosHistory.length > 0 ? totalMttr / chaosHistory.length : 0;

    return {
      active_incidents_count: activeIncidents.length,
      sev1_count: sev1Count,
      system_health_score: healthScore,
      total_telemetry_events_ingested: events.length,
      average_mttr_ms: avgMttr,
      last_updated_utc: new Date().toISOString()
    };
  }

  async getServiceOverview(serviceName: string): Promise<ServiceOverview> {
    const activeIncidents = await this.incidentAdapter.fetchIncidents(undefined, serviceName);
    const recentAlerts = await this.alertAdapter.fetchActiveAlerts(serviceName);
    const recentEvents = await this.telemetryAdapter.fetchRecentEvents(serviceName, 1);

    const openIncidents = activeIncidents.filter(
      (inc) => inc.status === "OPEN" || inc.status === "MITIGATING"
    );

    let healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";

    if (openIncidents.some((inc) => inc.severity === "SEV-1") || recentAlerts.some((a) => a.recommended_severity === "SEV-1")) {
      healthStatus = "CRITICAL";
    } else if (openIncidents.length > 0 || recentAlerts.length > 0) {
      healthStatus = "DEGRADED";
    }

    return {
      service_name: serviceName,
      health_status: healthStatus,
      active_incidents: openIncidents,
      recent_alerts: recentAlerts,
      latest_telemetry: recentEvents[0]
    };
  }
}
