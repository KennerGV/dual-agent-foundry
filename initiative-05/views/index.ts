// War Room & Dashboard View Interfaces & Props

import type {
  WarRoomSummary,
  ServiceOverview,
  ChaosExperimentConfig,
  ChaosExperimentResult
} from "../bff/index.js";

export interface WarRoomDashboardProps {
  summary: WarRoomSummary;
  services: ServiceOverview[];
  onRefreshAll: () => Promise<void>;
}

export interface ChaosSimulatorViewProps {
  availableScenarios: string[];
  targetServices: string[];
  onRunExperiment: (config: ChaosExperimentConfig) => Promise<ChaosExperimentResult>;
  recentResults: ChaosExperimentResult[];
  isExecuting?: boolean;
}

export interface MttrMetricsViewProps {
  experimentResults: ChaosExperimentResult[];
  slaTargetMs: number;
  averageMttrMs: number;
  historicalIncidentCount: number;
}
