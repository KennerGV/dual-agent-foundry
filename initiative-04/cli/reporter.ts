import * as fs from "fs/promises";
import * as path from "path";
import { ChaosExperimentResult } from "../types";

export interface ReportExporter {
  exportJson(result: ChaosExperimentResult, outputPath: string): Promise<void>;
  exportMarkdown(result: ChaosExperimentResult, outputPath: string): Promise<void>;
}

export function generateMarkdownReport(result: ChaosExperimentResult): string {
  const status = result.passed_sla ? "PASSED ✅" : "FAILED ❌";
  return `# Chaos Experiment Report: ${result.experiment_id}

## Summary
- **Experiment ID:** \`${result.experiment_id}\`
- **Scenario:** \`${result.scenario}\`
- **Target Service:** \`${result.target_service}\`
- **SLA Status:** **${status}**

## Key Metrics
- **Injected Events:** ${result.injected_events_count}
- **Detection Time:** ${result.detection_time_ms} ms
- **Mitigation Recovery (MTTR):** ${result.mitigation_recovery_mttr_ms} ms
`;
}

export class DefaultReportExporter implements ReportExporter {
  async exportJson(result: ChaosExperimentResult, outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
  }

  async exportMarkdown(result: ChaosExperimentResult, outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }
    const content = generateMarkdownReport(result);
    await fs.writeFile(outputPath, content, "utf-8");
  }
}
