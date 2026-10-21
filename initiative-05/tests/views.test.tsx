// Views Unit Test Suite for Initiative 05

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WarRoomDashboard,
  ChaosSimulatorView,
  MttrMetricsView
} from "../index.js";
import type {
  WarRoomSummary,
  ServiceOverview,
  ChaosExperimentResult,
  ChaosExperimentConfig
} from "../index.js";

describe("War Room Page Views Tests", () => {
  describe("WarRoomDashboard View", () => {
    const mockSummary: WarRoomSummary = {
      active_incidents_count: 2,
      sev1_count: 1,
      system_health_score: 65,
      total_telemetry_events_ingested: 15420,
      average_mttr_ms: 12500,
      last_updated_utc: "2026-10-20T18:20:00Z"
    };

    const mockServices: ServiceOverview[] = [
      {
        service_name: "payment-gateway",
        health_status: "CRITICAL",
        active_incidents: [
          {
            incident_id: "inc_001",
            status: "MITIGATING",
            severity: "SEV-1",
            service: "payment-gateway",
            deduplicated_alerts_count: 12,
            active_runbook: "rb_restart",
            opened_at_utc: "2026-10-20T18:00:00Z",
            updated_at_utc: "2026-10-20T18:15:00Z"
          }
        ],
        recent_alerts: [],
        latest_telemetry: {
          event_id: "evt_999",
          timestamp_utc: "2026-10-20T18:20:00Z",
          source_service: "payment-gateway",
          host_id: "host-1",
          metrics: {
            cpu_usage_pct: 95.0,
            memory_rss_mb: 4096,
            latency_p99_ms: 1200.0,
            error_rate_pct: 15.5
          },
          raw_log: "ERROR database connection timeout",
          compression: "lz4"
        }
      },
      {
        service_name: "auth-service",
        health_status: "HEALTHY",
        active_incidents: [],
        recent_alerts: []
      }
    ];

    it("should render dashboard header and summary KPI metrics", () => {
      const html = renderToStaticMarkup(
        React.createElement(WarRoomDashboard, {
          summary: mockSummary,
          services: mockServices,
          onRefreshAll: async () => {}
        })
      );

      assert.ok(html.includes("AegisPulse War Room Dashboard"));
      assert.ok(html.includes("65 / 100")); // Health Score
      assert.ok(html.includes("15,420")); // Telemetry count formatted
      assert.ok(html.includes("13s")); // Avg MTTR in seconds
      assert.ok(html.includes("Refresh Dashboard"));
    });

    it("should render monitored services with correct health status badges and metrics", () => {
      const html = renderToStaticMarkup(
        React.createElement(WarRoomDashboard, {
          summary: mockSummary,
          services: mockServices,
          onRefreshAll: async () => {}
        })
      );

      assert.ok(html.includes("payment-gateway"));
      assert.ok(html.includes("CRITICAL"));
      assert.ok(html.includes("auth-service"));
      assert.ok(html.includes("HEALTHY"));
      assert.ok(html.includes("CPU: 95%"));
      assert.ok(html.includes("p99 Latency: 1200 ms"));
      assert.ok(html.includes("No telemetry data available"));
    });
  });

  describe("ChaosSimulatorView View", () => {
    const mockScenarios = ["LATENCY_SPIKE", "PACKET_LOSS", "CPU_EXHAUSTION"];
    const mockServices = ["payment-gateway", "order-processor"];

    const mockResults: ChaosExperimentResult[] = [
      {
        experiment_id: "exp_01",
        scenario: "LATENCY_SPIKE",
        target_service: "payment-gateway",
        injected_events_count: 500,
        detection_time_ms: 1200,
        mitigation_recovery_mttr_ms: 8500,
        passed_sla: true
      },
      {
        experiment_id: "exp_02",
        scenario: "PACKET_LOSS",
        target_service: "order-processor",
        injected_events_count: 1000,
        detection_time_ms: 4500,
        mitigation_recovery_mttr_ms: 22000,
        passed_sla: false
      }
    ];

    const mockRunExperiment = async (config: ChaosExperimentConfig): Promise<ChaosExperimentResult> => ({
      experiment_id: config.experiment_id,
      scenario: config.scenario_type,
      target_service: config.target_service,
      injected_events_count: 300,
      detection_time_ms: 1500,
      mitigation_recovery_mttr_ms: 9000,
      passed_sla: true
    });

    it("should render scenario configuration form and history table", () => {
      const html = renderToStaticMarkup(
        React.createElement(ChaosSimulatorView, {
          availableScenarios: mockScenarios,
          targetServices: mockServices,
          onRunExperiment: mockRunExperiment,
          recentResults: mockResults
        })
      );

      assert.ok(html.includes("Chaos Engineering Simulator"));
      assert.ok(html.includes("Configure Injection"));
      assert.ok(html.includes("LATENCY_SPIKE"));
      assert.ok(html.includes("PACKET_LOSS"));
      assert.ok(html.includes("CPU_EXHAUSTION"));
      assert.ok(html.includes("payment-gateway"));
      assert.ok(html.includes("order-processor"));
      assert.ok(html.includes("Inject Failure Scenario"));

      // Table history
      assert.ok(html.includes("exp_01"));
      assert.ok(html.includes("exp_02"));
      assert.ok(html.includes("PASSED"));
      assert.ok(html.includes("BREACHED"));
    });

    it("should render executing state when isExecuting is true", () => {
      const html = renderToStaticMarkup(
        React.createElement(ChaosSimulatorView, {
          availableScenarios: mockScenarios,
          targetServices: mockServices,
          onRunExperiment: mockRunExperiment,
          recentResults: [],
          isExecuting: true
        })
      );

      assert.ok(html.includes("Executing Chaos Scenario..."));
      assert.ok(html.includes("Chaos experiment running in sandbox environment..."));
    });
  });

  describe("MttrMetricsView View", () => {
    const mockResults: ChaosExperimentResult[] = [
      {
        experiment_id: "exp_10",
        scenario: "LATENCY_BURST",
        target_service: "auth-service",
        injected_events_count: 200,
        detection_time_ms: 1000,
        mitigation_recovery_mttr_ms: 7000,
        passed_sla: true
      },
      {
        experiment_id: "exp_20",
        scenario: "MEMORY_LEAK",
        target_service: "auth-service",
        injected_events_count: 400,
        detection_time_ms: 2000,
        mitigation_recovery_mttr_ms: 11000,
        passed_sla: true
      }
    ];

    it("should render SLA compliant banner when average MTTR meets SLA target", () => {
      const html = renderToStaticMarkup(
        React.createElement(MttrMetricsView, {
          experimentResults: mockResults,
          slaTargetMs: 15000,
          averageMttrMs: 9000,
          historicalIncidentCount: 12
        })
      );

      assert.ok(html.includes("MTTR &amp; SLA Metrics Analytics"));
      assert.ok(html.includes("9.0s"));
      assert.ok(html.includes("Target SLA: 15.0s"));
      assert.ok(html.includes("100.0%")); // 2 of 2 passed
      assert.ok(html.includes("System Operating Within SLA Thresholds"));
      assert.ok(html.includes("SLA COMPLIANT"));
      assert.ok(html.includes("exp_10"));
      assert.ok(html.includes("exp_20"));
    });

    it("should render SLA breach banner when average MTTR exceeds SLA target", () => {
      const html = renderToStaticMarkup(
        React.createElement(MttrMetricsView, {
          experimentResults: mockResults,
          slaTargetMs: 8000,
          averageMttrMs: 12000,
          historicalIncidentCount: 15
        })
      );

      assert.ok(html.includes("12.0s"));
      assert.ok(html.includes("Target SLA: 8.0s"));
      assert.ok(html.includes("SLA Target Breach Detected"));
      assert.ok(html.includes("SLA BREACH"));
    });
  });
});
