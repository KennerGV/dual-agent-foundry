import { describe, it } from "node:test";
import assert from "node:assert";
import { getScenarioGenerator } from "../scenarios/index.js";
import { ChaosExperimentRunner } from "../runner/index.js";
import { ExperimentConfig } from "../types.js";

describe("Integration Test Suite — Chaos Verifier End to End", () => {
  it("executes full workflow: config -> scenario generator -> runner -> result evaluation", async () => {
    const config: ExperimentConfig = {
      experiment_id: "chs_ddos_sim_01",
      scenario_type: "SYNTHETIC_LATENCY_AND_ERROR_BURST",
      target_service: "payment-gateway-prod",
      intensity: 50,
      duration_seconds: 10,
      sla_max_mttr_ms: 15000,
      sla_max_detection_ms: 2000,
    };

    const generator = getScenarioGenerator(config.scenario_type);
    assert.ok(generator, "Generator should be retrieved from catalog");

    const runner = new ChaosExperimentRunner();
    const result = await runner.run(config, generator);

    assert.strictEqual(result.experiment_id, "chs_ddos_sim_01");
    assert.strictEqual(result.scenario, "SYNTHETIC_LATENCY_AND_ERROR_BURST");
    assert.strictEqual(result.target_service, "payment-gateway-prod");
    assert.strictEqual(result.injected_events_count, 500); // intensity 50 * 10s
    assert.ok(typeof result.detection_time_ms === "number");
    assert.ok(typeof result.mitigation_recovery_mttr_ms === "number");
    assert.strictEqual(typeof result.passed_sla, "boolean");
  });
});
