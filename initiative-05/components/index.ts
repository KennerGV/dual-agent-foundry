// UI Component Interfaces & Props

import type {
  TelemetryEvent,
  AnomalyAlert,
  IncidentRecord,
  RunbookExecutionRequest,
  RunbookExecutionResult
} from "../bff/index.js";

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
