import React, { useState } from "react";
import type {
  WarRoomSummary,
  ServiceOverview
} from "../bff/index.js";

export interface WarRoomDashboardProps {
  summary: WarRoomSummary;
  services: ServiceOverview[];
  onRefreshAll: () => Promise<void>;
}

export const WarRoomDashboard: React.FC<WarRoomDashboardProps> = ({
  summary,
  services,
  onRefreshAll
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshAll();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthBadgeStyle = (status: "HEALTHY" | "DEGRADED" | "CRITICAL") => {
    switch (status) {
      case "HEALTHY":
        return { color: "#10B981", backgroundColor: "#ECFDF5", border: "1px solid #10B981" };
      case "DEGRADED":
        return { color: "#F59E0B", backgroundColor: "#FEF3C7", border: "1px solid #F59E0B" };
      case "CRITICAL":
        return { color: "#EF4444", backgroundColor: "#FEE2E2", border: "1px solid #EF4444" };
    }
  };

  return (
    <div className="war-room-dashboard" style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#1F2937" }}>AegisPulse War Room Dashboard</h1>
          <p style={{ margin: "0.25rem 0 0 0", color: "#6B7280", fontSize: "0.875rem" }}>
            Real-time system telemetry, active incidents, and service health overview
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: isRefreshing ? "#9CA3AF" : "#2563EB",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "0.375rem",
            cursor: isRefreshing ? "not-allowed" : "pointer",
            fontWeight: 600
          }}
        >
          {isRefreshing ? "Refreshing..." : "Refresh Dashboard"}
        </button>
      </header>

      {/* War Room Summary KPI Bar */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>System Health Score</div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: summary.system_health_score >= 80 ? "#10B981" : summary.system_health_score >= 50 ? "#F59E0B" : "#EF4444" }}>
            {summary.system_health_score} / 100
          </div>
        </div>

        <div style={{ padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Active Incidents</div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: summary.active_incidents_count > 0 ? "#EF4444" : "#10B981" }}>
            {summary.active_incidents_count}
          </div>
        </div>

        <div style={{ padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>SEV-1 Critical</div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: summary.sev1_count > 0 ? "#DC2626" : "#6B7280" }}>
            {summary.sev1_count}
          </div>
        </div>

        <div style={{ padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Telemetry Ingested</div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#1F2937" }}>
            {summary.total_telemetry_events_ingested.toLocaleString()}
          </div>
        </div>

        <div style={{ padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Avg MTTR</div>
          <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#1F2937" }}>
            {Math.round(summary.average_mttr_ms / 1000)}s
          </div>
        </div>
      </section>

      {/* Services Overview Grid */}
      <section>
        <h2 style={{ fontSize: "1.25rem", color: "#1F2937", marginBottom: "1rem" }}>Monitored Services ({services.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1.25rem" }}>
          {services.map((svc: ServiceOverview) => (
            <div key={svc.service_name} style={{ border: "1px solid #E5E7EB", borderRadius: "0.5rem", padding: "1.25rem", backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#111827" }}>{svc.service_name}</h3>
                <span style={{ ...getHealthBadgeStyle(svc.health_status), padding: "0.25rem 0.625rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "bold" }}>
                  {svc.health_status}
                </span>
              </div>

              <div style={{ fontSize: "0.875rem", color: "#4B5563", marginBottom: "0.5rem" }}>
                Active Incidents: <strong>{svc.active_incidents.length}</strong> | Recent Alerts: <strong>{svc.recent_alerts.length}</strong>
              </div>

              {svc.latest_telemetry ? (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", backgroundColor: "#F3F4F6", borderRadius: "0.375rem", fontSize: "0.8rem" }}>
                  <div style={{ fontWeight: "bold", marginBottom: "0.25rem", color: "#374151" }}>Latest Metrics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 0.5rem", color: "#4B5563" }}>
                    <div>CPU: {svc.latest_telemetry.metrics.cpu_usage_pct}%</div>
                    <div>RAM: {svc.latest_telemetry.metrics.memory_rss_mb} MB</div>
                    <div>p99 Latency: {svc.latest_telemetry.metrics.latency_p99_ms} ms</div>
                    <div>Error Rate: {svc.latest_telemetry.metrics.error_rate_pct}%</div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#9CA3AF", fontStyle: "italic" }}>
                  No telemetry data available
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#9CA3AF", textAlign: "right" }}>
        Last updated: {summary.last_updated_utc ? new Date(summary.last_updated_utc).toUTCString() : "N/A"}
      </footer>
    </div>
  );
};
