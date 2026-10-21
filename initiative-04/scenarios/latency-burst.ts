import { SyntheticEvent, ExperimentConfig } from "../types.js";
import { ScenarioGenerator } from "./types.js";
import { calculateEventCount, generateBaseEvent } from "./utils.js";

export class LatencyBurstGenerator implements ScenarioGenerator {
  readonly scenario_type: string = "LATENCY_BURST";

  generate(config: ExperimentConfig): SyntheticEvent[] {
    const totalEvents = calculateEventCount(config);
    const startTimeMs = Date.now();
    const durationMs = config.duration_seconds * 1000;
    const intensity = Math.max(0.1, config.intensity);

    const events: SyntheticEvent[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const base = generateBaseEvent(config, i, totalEvents, startTimeMs, durationMs);

      const progress = totalEvents > 1 ? i / (totalEvents - 1) : 0.5;
      const spikeFactor = Math.sin(progress * Math.PI);

      const baseLatency = 45;
      const addedLatency = intensity * 450 * spikeFactor;
      const latencyP99 = Math.round(baseLatency + addedLatency + (i % 7) * 5);

      const baseErrorRate = 0.5;
      const errorRate = Number((baseErrorRate + (intensity > 5 ? (intensity - 5) * 1.5 : 0)).toFixed(2));

      const cpuUsage = Number((25 + spikeFactor * 20 + (i % 5)).toFixed(1));
      const memoryRss = Math.round(380 + spikeFactor * 120);

      events.push({
        ...base,
        metrics: {
          cpu_usage_pct: Math.min(100, cpuUsage),
          memory_rss_mb: memoryRss,
          latency_p99_ms: latencyP99,
          error_rate_pct: Math.min(100, errorRate),
        },
        raw_log: `[WARN] High latency detected on ${config.target_service}: p99=${latencyP99}ms (threshold: 200ms)`,
      });
    }

    return events;
  }
}
