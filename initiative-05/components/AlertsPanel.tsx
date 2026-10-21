import React from "react";
import type { AnomalyAlert, Severity } from "../bff/index.js";

export interface AlertsPanelProps {
  alerts: AnomalyAlert[];
  onSelectAlert?: (alert: AnomalyAlert) => void;
  isLoading?: boolean;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alerts,
  onSelectAlert,
  isLoading = false,
}) => {
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
    <div className="alerts-panel">
      <div className="alerts-panel-header">
        <h2>Anomaly Alerts</h2>
        <span className="alerts-count">{alerts.length} Active Alerts</span>
      </div>

      {isLoading ? (
        <div className="loading-indicator">Loading anomaly alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">No anomaly alerts detected.</div>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <div
              key={alert.alert_id}
              className={`alert-card ${onSelectAlert ? "interactive" : ""}`}
              onClick={() => onSelectAlert?.(alert)}
            >
              <div className="alert-card-header">
                <span className={`severity-badge ${getSeverityBadgeClass(alert.recommended_severity)}`}>
                  {alert.recommended_severity}
                </span>
                <span className="alert-type">{alert.anomaly_type}</span>
                <span className="alert-service">{alert.source_service}</span>
                <span className="alert-timestamp">{alert.detected_at_utc}</span>
              </div>
              <div className="alert-details">
                <div className="detail-item">
                  <span className="detail-label">Alert ID:</span>
                  <span className="detail-value">{alert.alert_id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Z-Score:</span>
                  <span className="detail-value">{alert.z_score.toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Confidence:</span>
                  <span className="detail-value">{(alert.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Linked Events:</span>
                  <span className="detail-value">{alert.source_event_ids.length}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
