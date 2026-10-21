import { SyntheticEvent, ExperimentConfig } from "../types.js";

export interface ScenarioGenerator {
  scenario_type: string;
  generate(config: ExperimentConfig): SyntheticEvent[];
}
