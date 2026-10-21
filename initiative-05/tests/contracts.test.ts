// Unit & Contract Type Compliance Test for Initiative 05

import type {
  TelemetryEvent,
  AnomalyAlert,
  IncidentRecord,
  ChaosExperimentResult,
  WarRoomSummary,
  ServiceOverview
} from "../index.js";

function testContracts() {
  const telemetry: TelemetryEvent = {
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
  };

  const alert: AnomalyAlert = {
    alert_id: "alt_3c2d1e0f",
    detected_at_utc: "2026-10-20T18:00:02Z",
    source_event_ids: [telemetry.event_id],
    source_service: "payment-gateway-prod",
    anomaly_type: "LATENCY_SPIKE_AND_ERROR_SURGE",
    z_score: 4.85,
    confidence: 0.96,
    recommended_severity: "SEV-1"
  };

  const incident: IncidentRecord = {
    incident_id: "inc_2026_0042",
    status: "MITIGATING",
    severity: "SEV-1",
    service: "payment-gateway-prod",
    deduplicated_alerts_count: 14,
    active_runbook: "rb_restart_conn_pool_and_scale",
    opened_at_utc: "2026-10-20T18:00:03Z",
    updated_at_utc: "2026-10-20T18:00:15Z"
  };

  const chaos: ChaosExperimentResult = {
    experiment_id: "chs_ddos_sim_01",
    scenario: "SYNTHETIC_LATENCY_AND_ERROR_BURST",
    target_service: "payment-gateway-prod",
    injected_events_count: 500,
    detection_time_ms: 1850,
    mitigation_recovery_mttr_ms: 12400,
    passed_sla: true
  };

  const summary: WarRoomSummary = {
    active_incidents_count: 1,
    sev1_count: 1,
    system_health_score: 75.0,
    total_telemetry_events_ingested: 10000,
    average_mttr_ms: 12400,
    last_updated_utc: "2026-10-20T18:01:00Z"
  };

  const serviceOverview: ServiceOverview = {
    service_name: "payment-gateway-prod",
    health_status: "CRITICAL",
    active_incidents: [incident],
    recent_alerts: [alert],
    latest_telemetry: telemetry
  };

  console.log("Contract compliance check succeeded for Initiative 05:", {
    telemetryId: telemetry.event_id,
    alertId: alert.alert_id,
    incidentId: incident.incident_id,
    experimentId: chaos.experiment_id,
    healthScore: summary.system_health_score,
    serviceName: serviceOverview.service_name
  });
}

testContracts();
