import React from "react";
import type { TelemetryEvent } from "../bff/index.js";

export interface TelemetryPanelProps {
  events: TelemetryEvent[];
  selectedService?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  events,
  selectedService,
  onRefresh,
  isLoading = false,
}) => {
  const filteredEvents = selectedService
    ? events.filter((e) => e.source_service === selectedService)
    : events;

  return (
    <div className="telemetry-panel">
      <div className="telemetry-panel-header">
        <h2>Live Telemetry Stream</h2>
        {selectedService && (
          <span className="selected-service-badge">
            Service: {selectedService}
          </span>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="refresh-button"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="loading-indicator">Loading telemetry data...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="empty-state">No telemetry events recorded.</div>
      ) : (
        <div className="telemetry-events-list">
          {filteredEvents.map((evt) => (
            <div key={evt.event_id} className="telemetry-card">
              <div className="telemetry-card-header">
                <span className="event-id">{evt.event_id}</span>
                <span className="service-name">{evt.source_service}</span>
                <span className="host-id">{evt.host_id}</span>
                <span className="timestamp">{evt.timestamp_utc}</span>
              </div>
              <div className="telemetry-metrics">
                <div className="metric">
                  <span className="metric-label">CPU:</span>
                  <span className="metric-value">{evt.metrics.cpu_usage_pct.toFixed(1)}%</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Memory:</span>
                  <span className="metric-value">{evt.metrics.memory_rss_mb} MB</span>
                </div>
                <div className="metric">
                  <span className="metric-label">p99 Latency:</span>
                  <span className="metric-value">{evt.metrics.latency_p99_ms.toFixed(1)} ms</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Error Rate:</span>
                  <span className="metric-value">{evt.metrics.error_rate_pct.toFixed(2)}%</span>
                </div>
              </div>
              {evt.raw_log && (
                <div className="telemetry-raw-log">
                  <code>{evt.raw_log}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
