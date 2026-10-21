import { SyntheticEvent, ExperimentConfig } from "../types.js";
import { ScenarioGenerator } from "./types.js";
import { calculateEventCount, generateBaseEvent } from "./utils.js";

export class CombinedBurstGenerator implements ScenarioGenerator {
  readonly scenario_type: string = "SYNTHETIC_LATENCY_AND_ERROR_BURST";

  generate(config: ExperimentConfig): SyntheticEvent[] {
    const totalEvents = calculateEventCount(config);
    const startTimeMs = Date.now();
    const durationMs = config.duration_seconds * 1000;
    const intensity = Math.max(0.1, config.intensity);

    const events: SyntheticEvent[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const base = generateBaseEvent(config, i, totalEvents, startTimeMs, durationMs);

      const progress = totalEvents > 1 ? i / (totalEvents - 1) : 0.5;
      const wave = Math.sin(progress * Math.PI);

      const latencyP99 = Math.round(100 + wave * intensity * 350 + (i % 9) * 10);
      const errorRate = Number(Math.min(100, 2.0 + wave * intensity * 8.5).toFixed(2));
      const cpuUsage = Number(Math.min(100, 35 + wave * intensity * 12 + (i % 3)).toFixed(1));
      const memoryRss = Math.round(450 + wave * 150);

      events.push({
        ...base,
        metrics: {
          cpu_usage_pct: cpuUsage,
          memory_rss_mb: memoryRss,
          latency_p99_ms: latencyP99,
          error_rate_pct: errorRate,
        },
        raw_log: `[ALERT] Synthetic fault wave on ${config.target_service}: latency=${latencyP99}ms, error_rate=${errorRate}%, cpu=${cpuUsage}%`,
      });
    }

    return events;
  }
}
