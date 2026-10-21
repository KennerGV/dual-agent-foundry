import { SyntheticEvent, ExperimentConfig } from "../types.js";
import { ScenarioGenerator } from "./types.js";
import { calculateEventCount, generateBaseEvent } from "./utils.js";

export class Error5xxBurstGenerator implements ScenarioGenerator {
  readonly scenario_type: string = "ERROR_5XX_BURST";

  generate(config: ExperimentConfig): SyntheticEvent[] {
    const totalEvents = calculateEventCount(config);
    const startTimeMs = Date.now();
    const durationMs = config.duration_seconds * 1000;
    const intensity = Math.max(0.1, config.intensity);

    const events: SyntheticEvent[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const base = generateBaseEvent(config, i, totalEvents, startTimeMs, durationMs);

      const progress = totalEvents > 1 ? i / (totalEvents - 1) : 0.5;
      const burstFactor = progress > 0.2 && progress < 0.8 ? 1.0 : 0.2;

      const baseErrorRate = 1.0;
      const spikeErrorRate = Math.min(99.9, baseErrorRate + intensity * 12 * burstFactor);
      const errorRate = Number(spikeErrorRate.toFixed(2));

      const latencyP99 = Math.round(80 + burstFactor * 120 + (i % 11) * 3);
      const cpuUsage = Number((30 + burstFactor * 15 + (i % 4)).toFixed(1));
      const memoryRss = Math.round(410 + burstFactor * 60);

      events.push({
        ...base,
        metrics: {
          cpu_usage_pct: Math.min(100, cpuUsage),
          memory_rss_mb: memoryRss,
          latency_p99_ms: latencyP99,
          error_rate_pct: errorRate,
        },
        raw_log: `[ERROR] HTTP 500 Internal Server Error rate spiked to ${errorRate}% on ${config.target_service}`,
      });
    }

    return events;
  }
}
