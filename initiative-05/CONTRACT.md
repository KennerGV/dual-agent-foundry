# Contract Specification — Initiative 05 (Command Center UI & BFF)

This document defines the technical contracts, data models, TypeScript interfaces, component props, and BFF adapter signatures for `initiative-05` (Command Center UI).
It establishes the boundaries between `bff/` (`J5-BFF`), `components/` (`J5-UI-Core`), and `views/` (`J5-Chaos-UI`), ensuring seamless aggregation of upstream contracts from initiatives 01 through 04.

---

## 1. Global Data Models (Consumed from Initiatives 01 - 04)

### 1.1 `TelemetryEvent` (Initiative 01)
```typescript
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
```

### 1.2 `AnomalyAlert` (Initiative 02)
```typescript
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
```

### 1.3 `IncidentRecord` & Runbooks (Initiative 03)
```typescript
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
```

### 1.4 `ChaosExperimentResult` & Config (Initiative 04)
```typescript
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
```

### 1.5 Aggregated War Room Models (BFF Output for UI)
```typescript
export interface WarRoomSummary {
  active_incidents_count: number;
  sev1_count: number;
  system_health_score: number; // 0 - 100
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
```

---

## 2. Layer Contracts & Subdirectory Interfaces

### 2.1 `bff/` Layer (`J5-BFF`)
**Responsibility:** Aggregating REST/gRPC responses from upstream services (01-04), providing unified adapters, and supplying clean JSON data feeds to frontend views.

**Adapters & Client Interfaces:**
```typescript
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
```

---

### 2.2 `components/` Layer (`J5-UI-Core`)
**Responsibility:** Presentational and interactive UI panels for telemetry metrics, anomaly alerts, and active incident management.

**Component Interface Props:**
```typescript
export interface TelemetryPanelProps {
  events: TelemetryEvent[];
  selectedService?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export interface AlertsPanelProps {
  alerts: AnomalyAlert[];
  onSelectAlert?: (alert: AnomalyAlert) => void;
  isLoading?: boolean;
}

export interface IncidentsPanelProps {
  incidents: IncidentRecord[];
  onTriggerRunbook: (request: RunbookExecutionRequest) => Promise<RunbookExecutionResult>;
  onSelectIncident?: (incident: IncidentRecord) => void;
  isLoading?: boolean;
}
```

---

### 2.3 `views/` Layer (`J5-Chaos-UI`)
**Responsibility:** Page-level views combining components and BFF aggregators for the War Room dashboard, Chaos engineering simulator, and MTTR SLA metrics analytics.

**View Props & Interfaces:**
```typescript
export interface WarRoomDashboardProps {
  summary: WarRoomSummary;
  services: ServiceOverview[];
  onRefreshAll: () => Promise<void>;
}

export interface ChaosSimulatorViewProps {
  availableScenarios: string[];
  targetServices: string[];
  onRunExperiment: (config: ChaosExperimentConfig) => Promise<ChaosExperimentResult>;
  recentResults: ChaosExperimentResult[];
  isExecuting?: boolean;
}

export interface MttrMetricsViewProps {
  experimentResults: ChaosExperimentResult[];
  slaTargetMs: number;
  averageMttrMs: number;
  historicalIncidentCount: number;
}
```

---

## 3. Architecture & Data Flow

```
[ Initiative 01: Telemetry ]   [ Initiative 02: Anomaly ]   [ Initiative 03: Incident ]   [ Initiative 04: Chaos ]
            │                              │                            │                            │
            └──────────────────────────────┴──────────────┬─────────────┴────────────────────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ initiative-05/bff/       │ (Adapters & Aggregator)
                                            └─────────────┬────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ initiative-05/components/│ (Panels: Telemetry, Alerts, Incidents)
                                            └─────────────┬────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ initiative-05/views/     │ (WarRoom, ChaosSim, MttrMetrics)
                                            └──────────────────────────┘
```
