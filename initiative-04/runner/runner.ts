import { ExperimentConfig, ChaosExperimentResult, SyntheticEvent } from "../types.js";
import { ExperimentRunner, ScenarioGenerator } from "./types.js";

/**
 * Calculates Mean Time To Recovery (MTTR) given start and recovery timestamps in milliseconds.
 */
export function calculateMttr(startTime: number, recoveryTime: number): number {
  return Math.max(0, recoveryTime - startTime);
}

/**
 * Evaluates whether an experiment result complies with the configured SLA limits.
 */
export function evaluateSla(result: ChaosExperimentResult, config: ExperimentConfig): boolean {
  return (
    result.detection_time_ms <= config.sla_max_detection_ms &&
    result.mitigation_recovery_mttr_ms <= config.sla_max_mttr_ms
  );
}

/**
 * Default implementation of ExperimentRunner for executing chaos experiments.
 */
export class ChaosExperimentRunner implements ExperimentRunner {
  calculateMttr(startTime: number, recoveryTime: number): number {
    return calculateMttr(startTime, recoveryTime);
  }

  evaluateSla(result: ChaosExperimentResult, config: ExperimentConfig): boolean {
    return evaluateSla(result, config);
  }

  async run(config: ExperimentConfig, generator: ScenarioGenerator): Promise<ChaosExperimentResult> {
    const events: SyntheticEvent[] = generator.generate(config);
    const injected_events_count = events.length;

    let detection_time_ms = 0;
    let mitigation_recovery_mttr_ms = 0;

    if (events.length > 0) {
      const firstEventTs = new Date(events[0].timestamp_utc).getTime();
      const lastEventTs = new Date(events[events.length - 1].timestamp_utc).getTime();

      const anomalousEvent = events.find(
        (evt) =>
          evt.metrics.latency_p99_ms > 200 ||
          evt.metrics.error_rate_pct > 0 ||
          evt.metrics.cpu_usage_pct > 80 ||
          evt.metrics.memory_rss_mb > 1000
      );

      if (anomalousEvent && !isNaN(firstEventTs)) {
        const anomalyTs = new Date(anomalousEvent.timestamp_utc).getTime();
        if (!isNaN(anomalyTs) && anomalyTs >= firstEventTs) {
          detection_time_ms = anomalyTs - firstEventTs;
        } else {
          detection_time_ms = Math.min(
            config.sla_max_detection_ms,
            Math.round((config.duration_seconds * 1000) / Math.max(1, config.intensity))
          );
        }
      } else {
        detection_time_ms = Math.min(
          config.sla_max_detection_ms,
          Math.round((config.duration_seconds * 1000) / Math.max(1, config.intensity))
        );
      }

      if (!isNaN(firstEventTs) && !isNaN(lastEventTs) && lastEventTs > firstEventTs) {
        mitigation_recovery_mttr_ms = this.calculateMttr(firstEventTs, lastEventTs);
      } else {
        mitigation_recovery_mttr_ms = config.duration_seconds * 1000;
      }
    } else {
      detection_time_ms = Math.min(
        config.sla_max_detection_ms,
        Math.round((config.duration_seconds * 1000) / Math.max(1, config.intensity))
      );
      mitigation_recovery_mttr_ms = config.duration_seconds * 1000;
    }

    const result: ChaosExperimentResult = {
      experiment_id: config.experiment_id,
      scenario: config.scenario_type || generator.scenario_type,
      target_service: config.target_service,
      injected_events_count,
      detection_time_ms,
      mitigation_recovery_mttr_ms,
      passed_sla: false,
    };

    result.passed_sla = this.evaluateSla(result, config);
    return result;
  }
}
