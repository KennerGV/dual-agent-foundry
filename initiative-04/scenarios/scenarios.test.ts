import {
  LatencyBurstGenerator,
  Error5xxBurstGenerator,
  CpuSaturationGenerator,
  CombinedBurstGenerator,
  getScenarioGenerator,
  getAvailableScenarios,
} from "./index.js";
import { ExperimentConfig } from "../types.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTests() {
  console.log("Running scenario generator tests...");

  const baseConfig: ExperimentConfig = {
    experiment_id: "test_exp_01",
    scenario_type: "LATENCY_BURST",
    target_service: "payment-service",
    intensity: 5,
    duration_seconds: 10,
    sla_max_mttr_ms: 10000,
    sla_max_detection_ms: 2000,
  };

  // 1. Latency Burst Test
  const latencyGen = new LatencyBurstGenerator();
  assert(latencyGen.scenario_type === "LATENCY_BURST", "LatencyBurst scenario_type mismatch");
  const latencyEvents = latencyGen.generate(baseConfig);
  assert(latencyEvents.length > 0, "LatencyBurst generated 0 events");
  assert(latencyEvents[0].metrics.latency_p99_ms > 0, "Latency metric invalid");
  assert(latencyEvents[0].source_service === "payment-service", "Target service mismatch");

  // 2. 5xx Error Burst Test
  const errorGen = new Error5xxBurstGenerator();
  assert(errorGen.scenario_type === "ERROR_5XX_BURST", "Error5xx scenario_type mismatch");
  const errorEvents = errorGen.generate({ ...baseConfig, scenario_type: "ERROR_5XX_BURST" });
  assert(errorEvents.length > 0, "Error5xx generated 0 events");
  assert(errorEvents[0].metrics.error_rate_pct >= 0, "Error rate metric invalid");

  // 3. CPU Saturation Test
  const cpuGen = new CpuSaturationGenerator();
  assert(cpuGen.scenario_type === "CPU_SATURATION", "CpuSaturation scenario_type mismatch");
  const cpuEvents = cpuGen.generate({ ...baseConfig, scenario_type: "CPU_SATURATION" });
  assert(cpuEvents.length > 0, "CpuSaturation generated 0 events");
  assert(cpuEvents[0].metrics.cpu_usage_pct > 0, "CPU usage metric invalid");

  // 4. Combined Burst Test
  const combinedGen = new CombinedBurstGenerator();
  assert(combinedGen.scenario_type === "SYNTHETIC_LATENCY_AND_ERROR_BURST", "Combined scenario_type mismatch");
  const combinedEvents = combinedGen.generate({ ...baseConfig, scenario_type: "SYNTHETIC_LATENCY_AND_ERROR_BURST" });
  assert(combinedEvents.length > 0, "Combined generated 0 events");

  // 5. Catalog Test
  const foundGen = getScenarioGenerator("LATENCY_SPIKE");
  assert(foundGen.scenario_type === "LATENCY_BURST", "Catalog failed alias resolution for LATENCY_SPIKE");

  const defaultGen = getScenarioGenerator("UNKNOWN_SCENARIO_TYPE");
  assert(defaultGen !== undefined, "Catalog failed fallback for unknown scenario");

  const available = getAvailableScenarios();
  assert(available.includes("LATENCY_BURST"), "Available scenarios missing LATENCY_BURST");

  console.log("All scenario generator tests passed successfully!");
}

runTests();
