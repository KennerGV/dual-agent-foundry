import { describe, it } from "node:test";
import assert from "node:assert";
import { ChaosExperimentResult, ExperimentConfig, SyntheticEvent } from "../types.js";

describe("Contract Specification - ChaosExperimentResult Data Model", () => {
  it("should conform to ChaosExperimentResult interface definition", () => {
    const result: ChaosExperimentResult = {
      experiment_id: "chs_ddos_sim_01",
      scenario: "SYNTHETIC_LATENCY_AND_ERROR_BURST",
      target_service: "payment-gateway-prod",
      injected_events_count: 500,
      detection_time_ms: 1850,
      mitigation_recovery_mttr_ms: 12400,
      passed_sla: true,
    };

    assert.strictEqual(typeof result.experiment_id, "string");
    assert.strictEqual(typeof result.scenario, "string");
    assert.strictEqual(typeof result.target_service, "string");
    assert.strictEqual(typeof result.injected_events_count, "number");
    assert.strictEqual(typeof result.detection_time_ms, "number");
    assert.strictEqual(typeof result.mitigation_recovery_mttr_ms, "number");
    assert.strictEqual(typeof result.passed_sla, "boolean");
  });

  it("should validate required fields in ExperimentConfig", () => {
    const config: ExperimentConfig = {
      experiment_id: "exp_test_01",
      scenario_type: "LATENCY_BURST",
      target_service: "auth-service",
      intensity: 10,
      duration_seconds: 30,
      sla_max_mttr_ms: 15000,
      sla_max_detection_ms: 3000,
    };

    assert.strictEqual(config.experiment_id, "exp_test_01");
    assert.ok(config.intensity > 0);
    assert.ok(config.duration_seconds > 0);
    assert.ok(config.sla_max_mttr_ms >= 0);
    assert.ok(config.sla_max_detection_ms >= 0);
  });

  it("should validate SyntheticEvent structure and metrics payload", () => {
    const event: SyntheticEvent = {
      event_id: "evt_1001",
      timestamp_utc: "2026-10-21T00:00:00.000Z",
      source_service: "payment-gateway-prod",
      host_id: "host-prod-01",
      metrics: {
        cpu_usage_pct: 85.5,
        memory_rss_mb: 512,
        latency_p99_ms: 1200,
        error_rate_pct: 5.2,
      },
    };

    assert.strictEqual(event.event_id, "evt_1001");
    assert.ok(!isNaN(Date.parse(event.timestamp_utc)));
    assert.ok(event.metrics.cpu_usage_pct >= 0 && event.metrics.cpu_usage_pct <= 100);
    assert.ok(event.metrics.memory_rss_mb >= 0);
    assert.ok(event.metrics.latency_p99_ms >= 0);
    assert.ok(event.metrics.error_rate_pct >= 0 && event.metrics.error_rate_pct <= 100);
  });
});
