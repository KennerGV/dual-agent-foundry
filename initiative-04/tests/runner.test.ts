import { describe, it } from "node:test";
import assert from "node:assert";
import { ChaosExperimentRunner, calculateMttr, evaluateSla } from "../runner/index.js";
import { ExperimentConfig, SyntheticEvent } from "../types.js";
import { ScenarioGenerator } from "../runner/types.js";

describe("Chaos Experiment Runner Suite", () => {
  const runner = new ChaosExperimentRunner();

  const testConfig: ExperimentConfig = {
    experiment_id: "exp_runner_01",
    scenario_type: "LATENCY_BURST",
    target_service: "user-service",
    intensity: 2,
    duration_seconds: 10,
    sla_max_mttr_ms: 12000,
    sla_max_detection_ms: 3000,
  };

  it("calculateMttr returns difference between start and recovery times", () => {
    assert.strictEqual(calculateMttr(1000, 6000), 5000);
    assert.strictEqual(calculateMttr(6000, 1000), 0); // floor at 0
  });

  it("evaluateSla correctly checks SLA criteria", () => {
    const passResult = {
      experiment_id: "e1",
      scenario: "s1",
      target_service: "t1",
      injected_events_count: 10,
      detection_time_ms: 2000,
      mitigation_recovery_mttr_ms: 10000,
      passed_sla: false,
    };
    assert.strictEqual(evaluateSla(passResult, testConfig), true);

    const failDetectionResult = { ...passResult, detection_time_ms: 5000 };
    assert.strictEqual(evaluateSla(failDetectionResult, testConfig), false);

    const failMttrResult = { ...passResult, mitigation_recovery_mttr_ms: 15000 };
    assert.strictEqual(evaluateSla(failMttrResult, testConfig), false);
  });

  it("ChaosExperimentRunner runs experiment and computes SLA", async () => {
    const mockGenerator: ScenarioGenerator = {
      scenario_type: "LATENCY_BURST",
      generate: (config: ExperimentConfig): SyntheticEvent[] => [
        {
          event_id: "evt_1",
          timestamp_utc: "2026-10-21T10:00:00.000Z",
          source_service: config.target_service,
          host_id: "host_1",
          metrics: { cpu_usage_pct: 10, memory_rss_mb: 200, latency_p99_ms: 50, error_rate_pct: 0 },
        },
        {
          event_id: "evt_2",
          timestamp_utc: "2026-10-21T10:00:01.500Z",
          source_service: config.target_service,
          host_id: "host_1",
          metrics: { cpu_usage_pct: 85, memory_rss_mb: 200, latency_p99_ms: 500, error_rate_pct: 10 },
        },
        {
          event_id: "evt_3",
          timestamp_utc: "2026-10-21T10:00:08.000Z",
          source_service: config.target_service,
          host_id: "host_1",
          metrics: { cpu_usage_pct: 10, memory_rss_mb: 200, latency_p99_ms: 40, error_rate_pct: 0 },
        },
      ],
    };

    const result = await runner.run(testConfig, mockGenerator);
    assert.strictEqual(result.experiment_id, "exp_runner_01");
    assert.strictEqual(result.injected_events_count, 3);
    assert.strictEqual(result.detection_time_ms, 1500);
    assert.strictEqual(result.mitigation_recovery_mttr_ms, 8000);
    assert.strictEqual(result.passed_sla, true);
  });
});
