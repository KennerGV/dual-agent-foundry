import React, { useState } from "react";
import type {
  ChaosExperimentConfig,
  ChaosExperimentResult
} from "../bff/index.js";

export interface ChaosSimulatorViewProps {
  availableScenarios: string[];
  targetServices: string[];
  onRunExperiment: (config: ChaosExperimentConfig) => Promise<ChaosExperimentResult>;
  recentResults: ChaosExperimentResult[];
  isExecuting?: boolean;
}

export const ChaosSimulatorView: React.FC<ChaosSimulatorViewProps> = ({
  availableScenarios,
  targetServices,
  onRunExperiment,
  recentResults,
  isExecuting = false
}) => {
  const [scenarioType, setScenarioType] = useState<string>(
    availableScenarios[0] || "SYNTHETIC_LATENCY_BURST"
  );
  const [targetService, setTargetService] = useState<string>(
    targetServices[0] || "payment-gateway-prod"
  );
  const [intensity, setIntensity] = useState<number>(5);
  const [durationSeconds, setDurationSeconds] = useState<number>(30);
  const [slaMaxMttrMs, setSlaMaxMttrMs] = useState<number>(15000);
  const [slaMaxDetectionMs, setSlaMaxDetectionMs] = useState<number>(3000);

  const [loading, setLoading] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<ChaosExperimentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRunning = isExecuting || loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setLastResult(null);

    const config: ChaosExperimentConfig = {
      experiment_id: `exp_${Date.now().toString(36)}`,
      scenario_type: scenarioType,
      target_service: targetService,
      intensity,
      duration_seconds: durationSeconds,
      sla_max_mttr_ms: slaMaxMttrMs,
      sla_max_detection_ms: slaMaxDetectionMs
    };

    try {
      const result = await onRunExperiment(config);
      setLastResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to execute chaos experiment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chaos-simulator-view" style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", color: "#1F2937" }}>Chaos Engineering Simulator</h1>
        <p style={{ margin: "0.25rem 0 0 0", color: "#6B7280", fontSize: "0.875rem" }}>
          Trigger controlled failure injection scenarios and verify automated MTTR/SLA resilience
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "2.5rem" }}>
        {/* Scenario Config Form */}
        <div style={{ border: "1px solid #E5E7EB", borderRadius: "0.5rem", padding: "1.5rem", backgroundColor: "#FFFFFF" }}>
          <h2 style={{ margin: "0 0 1.25rem 0", fontSize: "1.25rem", color: "#111827" }}>Configure Injection</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                Target Scenario
              </label>
              <select
                value={scenarioType}
                onChange={(e) => setScenarioType(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #D1D5DB", borderRadius: "0.375rem" }}
              >
                {availableScenarios.map((sc) => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                Target Service
              </label>
              <select
                value={targetService}
                onChange={(e) => setTargetService(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #D1D5DB", borderRadius: "0.375rem" }}
              >
                {targetServices.map((svc) => (
                  <option key={svc} value={svc}>{svc}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                  Intensity Level (1-10): {intensity}
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #D1D5DB", borderRadius: "0.375rem" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                  Max SLA MTTR (ms)
                </label>
                <input
                  type="number"
                  step="500"
                  value={slaMaxMttrMs}
                  onChange={(e) => setSlaMaxMttrMs(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #D1D5DB", borderRadius: "0.375rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.375rem" }}>
                  Max SLA Detection (ms)
                </label>
                <input
                  type="number"
                  step="100"
                  value={slaMaxDetectionMs}
                  onChange={(e) => setSlaMaxDetectionMs(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #D1D5DB", borderRadius: "0.375rem" }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isRunning}
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                backgroundColor: isRunning ? "#9CA3AF" : "#DC2626",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: "bold",
                fontSize: "1rem",
                cursor: isRunning ? "not-allowed" : "pointer"
              }}
            >
              {isRunning ? "Executing Chaos Scenario..." : "⚡ Inject Failure Scenario"}
            </button>
          </form>
        </div>

        {/* Execution Status / Result Banner */}
        <div style={{ border: "1px solid #E5E7EB", borderRadius: "0.5rem", padding: "1.5rem", backgroundColor: "#F9FAFB", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", color: "#374151" }}>Experiment Result Feedback</h3>

          {errorMessage && (
            <div style={{ padding: "1rem", backgroundColor: "#FEE2E2", color: "#991B1B", borderRadius: "0.375rem", border: "1px solid #FCA5A5" }}>
              <strong>Execution Failed:</strong> {errorMessage}
            </div>
          )}

          {lastResult && (
            <div style={{ padding: "1rem", backgroundColor: lastResult.passed_sla ? "#ECFDF5" : "#FEF2F2", borderRadius: "0.375rem", border: lastResult.passed_sla ? "1px solid #A7F3D0" : "1px solid #FECACA" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: "bold", fontSize: "1.1rem", color: lastResult.passed_sla ? "#065F46" : "#991B1B" }}>
                  {lastResult.passed_sla ? "✅ SLA PASSED" : "❌ SLA BREACHED"}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#6B7280" }}>{lastResult.experiment_id}</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#374151", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <div>Scenario: <strong>{lastResult.scenario}</strong></div>
                <div>Target: <strong>{lastResult.target_service}</strong></div>
                <div>Detection Time: <strong>{lastResult.detection_time_ms} ms</strong></div>
                <div>Mitigation/MTTR: <strong>{lastResult.mitigation_recovery_mttr_ms} ms</strong></div>
                <div>Injected Events: <strong>{lastResult.injected_events_count}</strong></div>
              </div>
            </div>
          )}

          {!errorMessage && !lastResult && !isRunning && (
            <div style={{ color: "#9CA3AF", fontStyle: "italic", textAlign: "center" }}>
              No chaos experiment executed in this session yet.
            </div>
          )}

          {isRunning && (
            <div style={{ textAlign: "center", color: "#2563EB", fontWeight: "bold" }}>
              ⏳ Chaos experiment running in sandbox environment...
            </div>
          )}
        </div>
      </div>

      {/* Recent Experiments History */}
      <section>
        <h2 style={{ fontSize: "1.25rem", color: "#1F2937", marginBottom: "1rem" }}>Recent Experiment History ({recentResults.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#F3F4F6", borderBottom: "2px solid #E5E7EB" }}>
                <th style={{ padding: "0.75rem" }}>Experiment ID</th>
                <th style={{ padding: "0.75rem" }}>Scenario</th>
                <th style={{ padding: "0.75rem" }}>Target Service</th>
                <th style={{ padding: "0.75rem" }}>Injected Events</th>
                <th style={{ padding: "0.75rem" }}>Detection (ms)</th>
                <th style={{ padding: "0.75rem" }}>MTTR (ms)</th>
                <th style={{ padding: "0.75rem" }}>SLA Status</th>
              </tr>
            </thead>
            <tbody>
              {recentResults.map((res) => (
                <tr key={res.experiment_id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{res.experiment_id}</td>
                  <td style={{ padding: "0.75rem" }}>{res.scenario}</td>
                  <td style={{ padding: "0.75rem" }}>{res.target_service}</td>
                  <td style={{ padding: "0.75rem" }}>{res.injected_events_count}</td>
                  <td style={{ padding: "0.75rem" }}>{res.detection_time_ms} ms</td>
                  <td style={{ padding: "0.75rem" }}>{res.mitigation_recovery_mttr_ms} ms</td>
                  <td style={{ padding: "0.75rem" }}>
                    <span style={{
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      backgroundColor: res.passed_sla ? "#D1FAE5" : "#FEE2E2",
                      color: res.passed_sla ? "#065F46" : "#991B1B"
                    }}>
                      {res.passed_sla ? "PASSED" : "BREACHED"}
                    </span>
                  </td>
                </tr>
              ))}

              {recentResults.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "1.5rem", textAlign: "center", color: "#9CA3AF" }}>
                    No recent experiment history available.
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
