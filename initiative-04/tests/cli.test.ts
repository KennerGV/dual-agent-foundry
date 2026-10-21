import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "fs/promises";
import * as path from "path";
import { parseCliArgs, generateMarkdownReport, DefaultReportExporter, runCli } from "../cli/index.js";
import { ChaosExperimentResult } from "../types.js";

describe("CLI & Reporting Suite", () => {
  const tmpDir = path.join(process.cwd(), ".tmp_test_reports");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("parseCliArgs correctly parses command line arguments", () => {
    const args = ["--config", "./config.json", "--format", "json", "--output-dir", "./out"];
    const options = parseCliArgs(args);
    assert.strictEqual(options.configPath, "./config.json");
    assert.strictEqual(options.format, "json");
    assert.strictEqual(options.outputDir, "./out");
  });

  it("generateMarkdownReport produces valid markdown format", () => {
    const sampleResult: ChaosExperimentResult = {
      experiment_id: "exp_cli_01",
      scenario: "LATENCY_BURST",
      target_service: "checkout-service",
      injected_events_count: 100,
      detection_time_ms: 1200,
      mitigation_recovery_mttr_ms: 5000,
      passed_sla: true,
    };

    const markdown = generateMarkdownReport(sampleResult);
    assert.ok(markdown.includes("# Chaos Experiment Report: exp_cli_01"));
    assert.ok(markdown.includes("checkout-service"));
    assert.ok(markdown.includes("PASSED"));
  });

  it("DefaultReportExporter exports JSON and Markdown files", async () => {
    const sampleResult: ChaosExperimentResult = {
      experiment_id: "exp_cli_exporter",
      scenario: "ERROR_5XX_BURST",
      target_service: "payment-service",
      injected_events_count: 50,
      detection_time_ms: 800,
      mitigation_recovery_mttr_ms: 4000,
      passed_sla: true,
    };

    const exporter = new DefaultReportExporter();
    const jsonPath = path.join(tmpDir, "report.json");
    const mdPath = path.join(tmpDir, "report.md");

    await exporter.exportJson(sampleResult, jsonPath);
    await exporter.exportMarkdown(sampleResult, mdPath);

    const jsonContent = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
    assert.strictEqual(jsonContent.experiment_id, "exp_cli_exporter");

    const mdContent = await fs.readFile(mdPath, "utf-8");
    assert.ok(mdContent.includes("exp_cli_exporter"));
  });

  it("runCli executes end-to-end with config file and runner", async () => {
    const configPath = path.join(tmpDir, "config.json");
    const configData = {
      experiment_id: "exp_run_cli",
      scenario_type: "CPU_SATURATION",
      target_service: "inventory-service",
      intensity: 5,
      duration_seconds: 10,
      sla_max_mttr_ms: 10000,
      sla_max_detection_ms: 2000,
    };
    await fs.writeFile(configPath, JSON.stringify(configData), "utf-8");

    const cliOptions = {
      configPath,
      format: "all" as const,
      outputDir: tmpDir,
    };

    const mockRunner = {
      runConfig: async (_cfgPath: string): Promise<ChaosExperimentResult> => ({
        experiment_id: configData.experiment_id,
        scenario: configData.scenario_type,
        target_service: configData.target_service,
        injected_events_count: 50,
        detection_time_ms: 500,
        mitigation_recovery_mttr_ms: 2000,
        passed_sla: true,
      }),
    };

    const res = await runCli(cliOptions, mockRunner);
    assert.ok(res);
    assert.strictEqual(res.experiment_id, "exp_run_cli");

    const jsonExported = await fs.readFile(path.join(tmpDir, "exp_run_cli.json"), "utf-8");
    assert.ok(jsonExported.includes("exp_run_cli"));

    const mdExported = await fs.readFile(path.join(tmpDir, "exp_run_cli.md"), "utf-8");
    assert.ok(mdExported.includes("exp_run_cli"));
  });
});
