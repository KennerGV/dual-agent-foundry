import { ScenarioGenerator } from "./types.js";
import { LatencyBurstGenerator } from "./latency-burst.js";
import { Error5xxBurstGenerator } from "./error-5xx-burst.js";
import { CpuSaturationGenerator } from "./cpu-saturation.js";
import { CombinedBurstGenerator } from "./combined-burst.js";

class ScenarioCatalog {
  private registry: Map<string, ScenarioGenerator> = new Map();
  private defaultGenerator: ScenarioGenerator;

  constructor() {
    this.defaultGenerator = new CombinedBurstGenerator();

    this.register(new LatencyBurstGenerator());
    this.register(new Error5xxBurstGenerator());
    this.register(new CpuSaturationGenerator());
    this.register(new CombinedBurstGenerator());

    this.registry.set("LATENCY_SPIKE", new LatencyBurstGenerator());
    this.registry.set("SYNTHETIC_LATENCY_BURST", new LatencyBurstGenerator());
    this.registry.set("5XX_ERRORS", new Error5xxBurstGenerator());
    this.registry.set("ERROR_BURST", new Error5xxBurstGenerator());
    this.registry.set("CPU_EXHAUSTION", new CpuSaturationGenerator());
    this.registry.set("RESOURCE_EXHAUSTION", new CpuSaturationGenerator());
  }

  public register(generator: ScenarioGenerator): void {
    this.registry.set(generator.scenario_type.toUpperCase(), generator);
  }

  public get(scenarioType: string): ScenarioGenerator {
    if (!scenarioType) {
      return this.defaultGenerator;
    }
    const normalized = scenarioType.toUpperCase().trim();
    return this.registry.get(normalized) || this.defaultGenerator;
  }

  public getAvailableScenarios(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const catalog = new ScenarioCatalog();

export function getScenarioGenerator(scenarioType: string): ScenarioGenerator {
  return catalog.get(scenarioType);
}

export function registerScenarioGenerator(generator: ScenarioGenerator): void {
  catalog.register(generator);
}

export function getAvailableScenarios(): string[] {
  return catalog.getAvailableScenarios();
}
