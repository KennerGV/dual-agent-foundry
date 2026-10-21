import { ExperimentConfig, SyntheticEvent } from "../types.js";
import { ChaosExperimentRunner, calculateMttr, evaluateSla, ScenarioGenerator } from "./index.js";

async function testRunner(): Promise<void> {
  const runner = new ChaosExperimentRunner();

  // Test MTTR calculation
  const mttr = runner.calculateMttr(1000, 5000);
  if (mttr !== 4000) {
    throw new Error(`Expected MTTR 4000, got ${mttr}`);
  }

  // Test SLA evaluation
  const dummyResult = {
    experiment_id: "test_exp",
    scenario: "TEST_SCENARIO",
    target_service: "test-service",
    injected_events_count: 10,
    detection_time_ms: 500,
    mitigation_recovery_mttr_ms: 2000,
    passed_sla: true,
  };

  const dummyConfig: ExperimentConfig = {
    experiment_id: "test_exp",
    scenario_type: "TEST_SCENARIO",
    target_service: "test-service",
    intensity: 1,
    duration_seconds: 10,
    sla_max_mttr_ms: 5000,
    sla_max_detection_ms: 1000,
  };

  const passed = runner.evaluateSla(dummyResult, dummyConfig);
  if (!passed) {
    throw new Error("Expected SLA evaluation to pass");
  }

  // Test run with mock generator
  const mockGenerator: ScenarioGenerator = {
    scenario_type: "TEST_SCENARIO",
    generate: (cfg: ExperimentConfig): SyntheticEvent[] => [
      {
        event_id: "evt_1",
        timestamp_utc: "2026-10-20T18:00:00Z",
        source_service: cfg.target_service,
        host_id: "host_1",
        metrics: {
          cpu_usage_pct: 10,
          memory_rss_mb: 100,
          latency_p99_ms: 50,
          error_rate_pct: 0,
        },
      },
      {
        event_id: "evt_2",
        timestamp_utc: "2026-10-20T18:00:01Z",
        source_service: cfg.target_service,
        host_id: "host_1",
        metrics: {
          cpu_usage_pct: 90,
          memory_rss_mb: 2000,
          latency_p99_ms: 1500,
          error_rate_pct: 25,
        },
      },
      {
        event_id: "evt_3",
        timestamp_utc: "2026-10-20T18:00:05Z",
        source_service: cfg.target_service,
        host_id: "host_1",
        metrics: {
          cpu_usage_pct: 15,
          memory_rss_mb: 120,
          latency_p99_ms: 60,
          error_rate_pct: 0,
        },
      },
    ],
  };

  const res = await runner.run(dummyConfig, mockGenerator);
  if (res.injected_events_count !== 3) {
    throw new Error(`Expected 3 events, got ${res.injected_events_count}`);
  }
  if (res.detection_time_ms !== 1000) {
    throw new Error(`Expected detection time 1000ms, got ${res.detection_time_ms}`);
  }
  if (res.mitigation_recovery_mttr_ms !== 5000) {
    throw new Error(`Expected MTTR 5000ms, got ${res.mitigation_recovery_mttr_ms}`);
  }
  if (!res.passed_sla) {
    throw new Error("Expected passed_sla to be true");
  }
}

testRunner().then(() => console.log("Runner tests passed.")).catch((err) => {
  console.error(err);
  process.exit(1);
});
