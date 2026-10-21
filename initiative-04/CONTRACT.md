# Contract Specification — Initiative 04 (Chaos Verifier)

This document defines the technical contracts, TypeScript interfaces, data models, and component boundaries for the `initiative-04` Chaos Verifier module.
It establishes the contracts between `scenarios/` (`J4-Core`), `runner/` (`J4-Runner`), and `cli/` (`J4-CLI`).

---

## 1. Global Data Model (`ChaosExperimentResult`)

Derived from `ROADMAP.md` Section 2.4:

```json
{
  "experiment_id": "chs_ddos_sim_01",
  "scenario": "SYNTHETIC_LATENCY_AND_ERROR_BURST",
  "target_service": "payment-gateway-prod",
  "injected_events_count": 500,
  "detection_time_ms": 1850,
  "mitigation_recovery_mttr_ms": 12400,
  "passed_sla": true
}
```

### 1.1 Core TypeScript Interfaces

```typescript
export interface ChaosExperimentResult {
  experiment_id: string;
  scenario: string;
  target_service: string;
  injected_events_count: number;
  detection_time_ms: number;
  mitigation_recovery_mttr_ms: number;
  passed_sla: boolean;
}

export interface SyntheticEvent {
  event_id: string;
  timestamp_utc: string;
  source_service: string;
  host_id: string;
  metrics: {
    cpu_usage_pct: number;
    memory_rss_mb: number;
    latency_p99_ms: number;
    error_rate_pct: number;
  };
  raw_log?: string;
  compression?: string;
}

export interface ExperimentConfig {
  experiment_id: string;
  scenario_type: string;
  target_service: string;
  intensity: number;
  duration_seconds: number;
  sla_max_mttr_ms: number;
  sla_max_detection_ms: number;
}
```

---

## 2. Layer Contracts & Interfaces

### 2.1 `scenarios/` Layer (`J4-Core`)

**Responsibility:** Catalog and generators of synthetic chaos fault events (e.g. latency spikes, error bursts, resource exhaustion).

**Interfaces:**

```typescript
import { SyntheticEvent, ExperimentConfig } from "./types";

export interface ScenarioGenerator {
  scenario_type: string;
  generate(config: ExperimentConfig): SyntheticEvent[];
}
```

---

### 2.2 `runner/` Layer (`J4-Runner`)

**Responsibility:** Chaos experiment execution engine, timing measurements, and MTTR / SLA calculation.

**Interfaces:**

```typescript
import { ExperimentConfig, ChaosExperimentResult } from "./types";
import { ScenarioGenerator } from "./scenarios";

export interface ExperimentRunner {
  run(config: ExperimentConfig, generator: ScenarioGenerator): Promise<ChaosExperimentResult>;
  calculateMttr(startTime: number, recoveryTime: number): number;
  evaluateSla(result: ChaosExperimentResult, config: ExperimentConfig): boolean;
}
```

---

### 2.3 `cli/` Layer (`J4-CLI`)

**Responsibility:** Command-line interface and Markdown/JSON report exporter.

**Interfaces:**

```typescript
import { ExperimentConfig, ChaosExperimentResult } from "./types";

export interface ReportExporter {
  exportJson(result: ChaosExperimentResult, outputPath: string): Promise<void>;
  exportMarkdown(result: ChaosExperimentResult, outputPath: string): Promise<void>;
}

export interface CliOptions {
  configPath?: string;
  format?: "json" | "markdown" | "all";
  outputDir?: string;
}
```

---

## 3. Inter-Component Flow

1. **`cli/`** parses command line arguments and loads an `ExperimentConfig`.
2. **`cli/`** passes the `ExperimentConfig` to **`runner/`**.
3. **`runner/`** invokes the appropriate `ScenarioGenerator` from **`scenarios/`** to generate synthetic fault events.
4. **`runner/`** executes the chaos simulation, calculates detection timing and MTTR, evaluates SLA compliance, and returns a `ChaosExperimentResult`.
5. **`cli/`** outputs the result and exports JSON and/or Markdown reports via `ReportExporter`.
