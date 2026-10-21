import { describe, it } from "node:test";
import assert from "node:assert";
import {
  LatencyBurstGenerator,
  Error5xxBurstGenerator,
  CpuSaturationGenerator,
  CombinedBurstGenerator,
  getScenarioGenerator,
  getAvailableScenarios,
} from "../scenarios/index.js";
import { ExperimentConfig } from "../types.js";

describe("Scenario Generators Suite", () => {
  const sampleConfig: ExperimentConfig = {
    experiment_id: "exp_scenario_test",
    scenario_type: "LATENCY_BURST",
    target_service: "order-service",
    intensity: 4,
    duration_seconds: 5,
    sla_max_mttr_ms: 8000,
    sla_max_detection_ms: 2000,
  };

  it("LatencyBurstGenerator generates expected events", () => {
    const gen = new LatencyBurstGenerator();
    assert.strictEqual(gen.scenario_type, "LATENCY_BURST");

    const events = gen.generate(sampleConfig);
    assert.strictEqual(events.length, 20); // intensity * duration_seconds = 4 * 5
    for (const evt of events) {
      assert.strictEqual(evt.source_service, "order-service");
      assert.ok(evt.metrics.latency_p99_ms > 0);
    }
  });

  it("Error5xxBurstGenerator generates expected 5xx error events", () => {
    const gen = new Error5xxBurstGenerator();
    assert.strictEqual(gen.scenario_type, "ERROR_5XX_BURST");

    const events = gen.generate({ ...sampleConfig, scenario_type: "ERROR_5XX_BURST" });
    assert.strictEqual(events.length, 20);
    const hasErrors = events.some((e) => e.metrics.error_rate_pct > 0);
    assert.ok(hasErrors);
  });

  it("CpuSaturationGenerator generates expected high CPU events", () => {
    const gen = new CpuSaturationGenerator();
    assert.strictEqual(gen.scenario_type, "CPU_SATURATION");

    const events = gen.generate({ ...sampleConfig, scenario_type: "CPU_SATURATION" });
    assert.strictEqual(events.length, 20);
    const hasHighCpu = events.some((e) => e.metrics.cpu_usage_pct >= 80);
    assert.ok(hasHighCpu);
  });

  it("CombinedBurstGenerator combines latency and error fault events", () => {
    const gen = new CombinedBurstGenerator();
    assert.strictEqual(gen.scenario_type, "SYNTHETIC_LATENCY_AND_ERROR_BURST");

    const events = gen.generate({ ...sampleConfig, scenario_type: "SYNTHETIC_LATENCY_AND_ERROR_BURST" });
    assert.strictEqual(events.length, 20);
    assert.ok(events.length > 0);
  });

  it("Scenario Catalog supports alias resolution and fallback", () => {
    const latencyGen = getScenarioGenerator("LATENCY_SPIKE");
    assert.strictEqual(latencyGen.scenario_type, "LATENCY_BURST");

    const fallbackGen = getScenarioGenerator("NON_EXISTENT_SCENARIO");
    assert.ok(fallbackGen);

    const available = getAvailableScenarios();
    assert.ok(available.length > 0);
  });
});
