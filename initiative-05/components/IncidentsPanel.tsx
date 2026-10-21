import React, { useState } from "react";
import type {
  IncidentRecord,
  IncidentStatus,
  RunbookExecutionRequest,
  RunbookExecutionResult,
  Severity,
} from "../bff/index.js";

export interface IncidentsPanelProps {
  incidents: IncidentRecord[];
  onTriggerRunbook: (request: RunbookExecutionRequest) => Promise<RunbookExecutionResult>;
  onSelectIncident?: (incident: IncidentRecord) => void;
  isLoading?: boolean;
}

export const IncidentsPanel: React.FC<IncidentsPanelProps> = ({
  incidents,
  onTriggerRunbook,
  onSelectIncident,
  isLoading = false,
}) => {
  const [executingRunbooks, setExecutingRunbooks] = useState<Record<string, boolean>>({});
  const [executionResults, setExecutionResults] = useState<Record<string, RunbookExecutionResult>>({});

  const handleRunbookTrigger = async (
    e: React.MouseEvent,
    incident: IncidentRecord
  ) => {
    e.stopPropagation();
    if (!incident.active_runbook) return;

    setExecutingRunbooks((prev) => ({ ...prev, [incident.incident_id]: true }));
    try {
      const result = await onTriggerRunbook({
        incident_id: incident.incident_id,
        runbook_id: incident.active_runbook,
        triggered_by: "CommandCenterUI",
      });
      setExecutionResults((prev) => ({ ...prev, [incident.incident_id]: result }));
    } catch (err) {
      setExecutionResults((prev) => ({
        ...prev,
        [incident.incident_id]: {
          execution_id: `exec_failed_${Date.now()}`,
          incident_id: incident.incident_id,
          runbook_id: incident.active_runbook,
          status: "FAILED",
          executed_at: new Date().toISOString(),
          message: err instanceof Error ? err.message : "Execution failed",
        },
      }));
    } finally {
      setExecutingRunbooks((prev) => ({ ...prev, [incident.incident_id]: false }));
    }
  };

  const getStatusBadgeClass = (status: IncidentStatus) => {
    switch (status) {
      case "OPEN":
        return "status-open";
      case "MITIGATING":
        return "status-mitigating";
      case "RESOLVED":
        return "status-resolved";
      case "CLOSED":
        return "status-closed";
      default:
        return "status-default";
    }
  };

  const getSeverityBadgeClass = (severity: Severity) => {
    switch (severity) {
      case "SEV-1":
        return "badge-sev-1";
      case "SEV-2":
        return "badge-sev-2";
      case "SEV-3":
        return "badge-sev-3";
      default:
        return "badge-sev-default";
    }
  };

  return (
    <div className="incidents-panel">
      <div className="incidents-panel-header">
        <h2>Active Incident Timeline</h2>
        <span className="incidents-count">{incidents.length} Records</span>
      </div>

      {isLoading ? (
        <div className="loading-indicator">Loading incident records...</div>
      ) : incidents.length === 0 ? (
        <div className="empty-state">No incidents recorded.</div>
      ) : (
        <div className="incidents-timeline">
          {incidents.map((incident) => {
            const isExecuting = !!executingRunbooks[incident.incident_id];
            const lastResult = executionResults[incident.incident_id];

            return (
              <div
                key={incident.incident_id}
                className={`incident-card ${onSelectIncident ? "interactive" : ""}`}
                onClick={() => onSelectIncident?.(incident)}
              >
                <div className="incident-card-header">
                  <span className={`status-badge ${getStatusBadgeClass(incident.status)}`}>
                    {incident.status}
                  </span>
                  <span className={`severity-badge ${getSeverityBadgeClass(incident.severity)}`}>
                    {incident.severity}
                  </span>
                  <span className="incident-id">{incident.incident_id}</span>
                  <span className="incident-service">{incident.service}</span>
                </div>

                <div className="incident-body">
                  <div className="incident-meta">
                    <div>
                      <strong>Opened:</strong> {incident.opened_at_utc}
                    </div>
                    <div>
                      <strong>Updated:</strong> {incident.updated_at_utc}
                    </div>
                    <div>
                      <strong>Deduplicated Alerts:</strong> {incident.deduplicated_alerts_count}
                    </div>
                    <div>
                      <strong>Active Runbook:</strong> {incident.active_runbook || "None"}
                    </div>
                  </div>

                  {incident.active_runbook && (
                    <div className="runbook-action-area">
                      <button
                        className="trigger-runbook-button"
                        onClick={(e) => handleRunbookTrigger(e, incident)}
                        disabled={isExecuting}
                      >
                        {isExecuting
                          ? "Executing Runbook..."
                          : `Execute Runbook (${incident.active_runbook})`}
                      </button>
                    </div>
                  )}

                  {lastResult && (
                    <div className={`execution-result execution-${lastResult.status.toLowerCase()}`}>
                      <span className="execution-status">[{lastResult.status}]</span>{" "}
                      <span className="execution-message">{lastResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
