import { SyntheticEvent, ExperimentConfig } from "../types.js";
import { ScenarioGenerator } from "./types.js";
import { calculateEventCount, generateBaseEvent } from "./utils.js";

export class CpuSaturationGenerator implements ScenarioGenerator {
  readonly scenario_type: string = "CPU_SATURATION";

  generate(config: ExperimentConfig): SyntheticEvent[] {
    const totalEvents = calculateEventCount(config);
    const startTimeMs = Date.now();
    const durationMs = config.duration_seconds * 1000;
    const intensity = Math.max(0.1, config.intensity);

    const events: SyntheticEvent[] = [];

    for (let i = 0; i < totalEvents; i++) {
      const base = generateBaseEvent(config, i, totalEvents, startTimeMs, durationMs);

      const progress = totalEvents > 1 ? i / (totalEvents - 1) : 0.5;
      const rampUp = Math.min(1.0, progress * 2);

      const baseCpu = 40;
      const totalCpu = Math.min(99.8, baseCpu + intensity * 10 * rampUp);
      const cpuUsage = Number(totalCpu.toFixed(1));

      const memoryRss = Math.round(512 + intensity * 80 * rampUp + (i % 13) * 10);
      const latencyP99 = Math.round(60 + rampUp * intensity * 35 + (i % 5) * 8);
      const errorRate = Number((0.2 + (totalCpu > 90 ? (totalCpu - 90) * 0.8 : 0)).toFixed(2));

      events.push({
        ...base,
        metrics: {
          cpu_usage_pct: cpuUsage,
          memory_rss_mb: memoryRss,
          latency_p99_ms: latencyP99,
          error_rate_pct: Math.min(100, errorRate),
        },
        raw_log: `[CRITICAL] CPU utilization high on ${base.host_id}: ${cpuUsage}% (memory: ${memoryRss}MB)`,
      });
    }

    return events;
  }
}
