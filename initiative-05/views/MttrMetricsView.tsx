import React from "react";
import type { ChaosExperimentResult } from "../bff/index.js";

export interface MttrMetricsViewProps {
  experimentResults: ChaosExperimentResult[];
  slaTargetMs: number;
  averageMttrMs: number;
  historicalIncidentCount: number;
}

export const MttrMetricsView: React.FC<MttrMetricsViewProps> = ({
  experimentResults,
  slaTargetMs,
  averageMttrMs,
  historicalIncidentCount
}) => {
  const totalExperiments = experimentResults.length;
  const passedExperiments = experimentResults.filter((r) => r.passed_sla).length;
  const complianceRate = totalExperiments > 0 ? (passedExperiments / totalExperiments) * 100 : 100;

  const avgDetectionMs = totalExperiments > 0
    ? Math.round(experimentResults.reduce((acc, r) => acc + r.detection_time_ms, 0) / totalExperiments)
    : 0;

  const isSlaCompliant = averageMttrMs <= slaTargetMs;

  return (
    <div className="mttr-metrics-view" style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#1F2937" }}>MTTR & SLA Metrics Analytics</h1>
        <p style={{ margin: "0.25rem 0 0 0", color: "#6B7280", fontSize: "0.875rem" }}>
          System resilience metrics, MTTR benchmarks, and chaos experiment SLA performance
        </p>
      </header>

      {/* KPI Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ padding: "1.25rem", borderRadius: "0.5rem", backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Average MTTR</div>
          <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: isSlaCompliant ? "#10B981" : "#EF4444", marginTop: "0.25rem" }}>
            {(averageMttrMs / 1000).toFixed(1)}s
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "0.25rem" }}>
            Target SLA: {(slaTargetMs / 1000).toFixed(1)}s
          </div>
        </div>

        <div style={{ padding: "1.25rem", borderRadius: "0.5rem", backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>SLA Compliance Rate</div>
          <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: complianceRate >= 90 ? "#10B981" : complianceRate >= 75 ? "#F59E0B" : "#EF4444", marginTop: "0.25rem" }}>
            {complianceRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "0.25rem" }}>
            Passed {passedExperiments} of {totalExperiments} chaos runs
          </div>
        </div>

        <div style={{ padding: "1.25rem", borderRadius: "0.5rem", backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Avg Detection Time</div>
          <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#1F2937", marginTop: "0.25rem" }}>
            {avgDetectionMs} ms
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "0.25rem" }}>
            Time-to-Detect (TTD)
          </div>
        </div>

        <div style={{ padding: "1.25rem", borderRadius: "0.5rem", backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.75rem", color: "#6B7280", textTransform: "uppercase" }}>Historical Incidents</div>
          <div style={{ fontSize: "1.875rem", fontWeight: "bold", color: "#1F2937", marginTop: "0.25rem" }}>
            {historicalIncidentCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "0.25rem" }}>
            Total incidents recorded
          </div>
        </div>
      </section>

      {/* Global Status Banner */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{
          padding: "1rem 1.5rem",
          borderRadius: "0.5rem",
          backgroundColor: isSlaCompliant ? "#ECFDF5" : "#FEF2F2",
          border: isSlaCompliant ? "1px solid #A7F3D0" : "1px solid #FECACA",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: isSlaCompliant ? "#065F46" : "#991B1B" }}>
              {isSlaCompliant ? "System Operating Within SLA Thresholds" : "SLA Target Breach Detected"}
            </h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: isSlaCompliant ? "#047857" : "#B91C1C" }}>
              {isSlaCompliant
                ? `Current average MTTR of ${(averageMttrMs / 1000).toFixed(1)}s meets the required SLA limit of ${(slaTargetMs / 1000).toFixed(1)}s.`
                : `Current average MTTR of ${(averageMttrMs / 1000).toFixed(1)}s exceeds the maximum allowed SLA limit of ${(slaTargetMs / 1000).toFixed(1)}s.`}
            </p>
          </div>
          <span style={{
            padding: "0.375rem 0.75rem",
            borderRadius: "9999px",
            fontSize: "0.875rem",
            fontWeight: "bold",
            backgroundColor: isSlaCompliant ? "#10B981" : "#EF4444",
            color: "#FFFFFF"
          }}>
            {isSlaCompliant ? "SLA COMPLIANT" : "SLA BREACH"}
          </span>
        </div>
      </section>

      {/* Detailed Experiment Results Table */}
      <section>
        <h2 style={{ fontSize: "1.25rem", color: "#1F2937", marginBottom: "1rem" }}>Experiment Benchmark Breakdown</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#F3F4F6", borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "0.75rem" }}>Experiment ID</th>
                <th style={{ padding: "0.75rem" }}>Scenario</th>
                <th style={{ padding: "0.75rem" }}>Service</th>
                <th style={{ padding: "0.75rem" }}>Detection (ms)</th>
                <th style={{ padding: "0.75rem" }}>Recovery MTTR (ms)</th>
                <th style={{ padding: "0.75rem" }}>SLA Evaluation</th>
              </tr>
            </thead>
            <tbody>
              {experimentResults.map((res) => (
                <tr key={res.experiment_id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{res.experiment_id}</td>
                  <td style={{ padding: "0.75rem" }}>{res.scenario}</td>
                  <td style={{ padding: "0.75rem" }}>{res.target_service}</td>
                  <td style={{ padding: "0.75rem" }}>{res.detection_time_ms} ms</td>
                  <td style={{ padding: "0.75rem", fontWeight: "bold" }}>{res.mitigation_recovery_mttr_ms} ms</td>
                  <td style={{ padding: "0.75rem" }}>
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      backgroundColor: res.passed_sla ? "#D1FAE5" : "#FEE2E2",
                      color: res.passed_sla ? "#065F46" : "#991B1B"
                    }}>
                      {res.passed_sla ? "PASSED" : "FAILED SLA"}
                    </span>
                  </td>
                </tr>
              ))}

              {experimentResults.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "#9CA3AF" }}>
                    No experiment records available for MTTR evaluation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
