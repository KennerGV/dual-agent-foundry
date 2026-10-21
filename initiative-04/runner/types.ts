import { ExperimentConfig, ChaosExperimentResult, SyntheticEvent } from "../types.js";

export interface ScenarioGenerator {
  scenario_type: string;
  generate(config: ExperimentConfig): SyntheticEvent[];
}

export interface ExperimentRunner {
  run(config: ExperimentConfig, generator: ScenarioGenerator): Promise<ChaosExperimentResult>;
  calculateMttr(startTime: number, recoveryTime: number): number;
  evaluateSla(result: ChaosExperimentResult, config: ExperimentConfig): boolean;
}
