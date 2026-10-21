import { SyntheticEvent, ExperimentConfig } from "../types.js";

export function calculateEventCount(config: ExperimentConfig): number {
  const duration = Math.max(1, config.duration_seconds || 10);
  const intensity = Math.max(0.1, config.intensity || 1);
  // Calculate reasonable number of events based on duration and intensity
  const ratePerSec = Math.max(1, Math.min(50, Math.round(intensity <= 1 ? intensity * 10 : intensity)));
  return Math.max(5, Math.min(1000, duration * ratePerSec));
}

export function generateBaseEvent(
  config: ExperimentConfig,
  index: number,
  totalEvents: number,
  startTimeMs: number,
  durationMs: number
): Omit<SyntheticEvent, "metrics"> {
  const timeStep = totalEvents > 1 ? durationMs / (totalEvents - 1) : 0;
  const eventTime = new Date(startTimeMs + index * timeStep);
  const hostIndex = (index % 3) + 1;
  const hostId = `host-${config.target_service}-node-0${hostIndex}`;

  return {
    event_id: `${config.experiment_id}-evt-${(index + 1).toString().padStart(4, "0")}`,
    timestamp_utc: eventTime.toISOString(),
    source_service: config.target_service,
    host_id: hostId,
  };
}
