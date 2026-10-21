// UI Components Unit Test Suite for Initiative 05

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TelemetryPanel,
  AlertsPanel,
  IncidentsPanel
} from "../index.js";
import type {
  TelemetryEvent,
  AnomalyAlert,
  IncidentRecord,
  RunbookExecutionResult
} from "../index.js";

describe("UI Components Rendering & Prop Behavior Tests", () => {
  describe("TelemetryPanel Component", () => {
    const mockEvents: TelemetryEvent[] = [
      {
        event_id: "evt_100",
        timestamp_utc: "2026-10-20T18:00:00Z",
        source_service: "auth-service",
        host_id: "node-1",
        metrics: {
          cpu_usage_pct: 45.2,
          memory_rss_mb: 1024,
          latency_p99_ms: 120.0,
          error_rate_pct: 0.05
        },
        raw_log: "INFO token verified",
        compression: "lz4"
      },
      {
        event_id: "evt_200",
        timestamp_utc: "2026-10-20T18:01:00Z",
        source_service: "payment-service",
        host_id: "node-2",
        metrics: {
          cpu_usage_pct: 88.5,
          memory_rss_mb: 2048,
          latency_p99_ms: 850.0,
          error_rate_pct: 5.2
        },
        raw_log: "WARN db latency high",
        compression: "lz4"
      }
    ];

    it("should render live telemetry events and metrics", () => {
      const html = renderToStaticMarkup(
        React.createElement(TelemetryPanel, { events: mockEvents })
      );

      assert.ok(html.includes("Live Telemetry Stream"));
      assert.ok(html.includes("evt_100"));
      assert.ok(html.includes("auth-service"));
      assert.ok(html.includes("45.2%"));
      assert.ok(html.includes("1024 MB"));
      assert.ok(html.includes("evt_200"));
      assert.ok(html.includes("payment-service"));
    });

    it("should filter telemetry events by selectedService prop", () => {
      const html = renderToStaticMarkup(
        React.createElement(TelemetryPanel, {
          events: mockEvents,
          selectedService: "payment-service"
        })
      );

      assert.ok(html.includes("Service: payment-service"));
      assert.ok(html.includes("evt_200"));
      assert.ok(!html.includes("evt_100"));
    });

    it("should display loading indicator when isLoading is true", () => {
      const html = renderToStaticMarkup(
        React.createElement(TelemetryPanel, {
          events: [],
          isLoading: true
        })
      );

      assert.ok(html.includes("Loading telemetry data..."));
    });

    it("should display empty state when events array is empty", () => {
      const html = renderToStaticMarkup(
        React.createElement(TelemetryPanel, {
          events: [],
          isLoading: false
        })
      );

      assert.ok(html.includes("No telemetry events recorded."));
    });

    it("should render refresh button when onRefresh prop is supplied", () => {
      const html = renderToStaticMarkup(
        React.createElement(TelemetryPanel, {
          events: mockEvents,
          onRefresh: () => {}
        })
      );

      assert.ok(html.includes("<button"));
      assert.ok(html.includes("Refresh"));
    });
  });

  describe("AlertsPanel Component", () => {
    const mockAlerts: AnomalyAlert[] = [
      {
        alert_id: "alt_sev1",
        detected_at_utc: "2026-10-20T18:05:00Z",
        source_event_ids: ["evt_100", "evt_101"],
        source_service: "checkout-service",
        anomaly_type: "HIGH_CPU_SPIKE",
        z_score: 5.2,
        confidence: 0.98,
        recommended_severity: "SEV-1"
      },
      {
        alert_id: "alt_sev3",
        detected_at_utc: "2026-10-20T18:06:00Z",
        source_event_ids: ["evt_102"],
        source_service: "notify-service",
        anomaly_type: "LATENCY_DRIFT",
        z_score: 2.1,
        confidence: 0.81,
        recommended_severity: "SEV-3"
      }
    ];

    it("should render anomaly alerts list with counts and severity badges", () => {
      const html = renderToStaticMarkup(
        React.createElement(AlertsPanel, { alerts: mockAlerts })
      );

      assert.ok(html.includes("2 Active Alerts"));
      assert.ok(html.includes("badge-sev-1"));
      assert.ok(html.includes("SEV-1"));
      assert.ok(html.includes("badge-sev-3"));
      assert.ok(html.includes("SEV-3"));
      assert.ok(html.includes("HIGH_CPU_SPIKE"));
      assert.ok(html.includes("checkout-service"));
      assert.ok(html.includes("5.20"));
      assert.ok(html.includes("98.0%"));
    });

    it("should render loading state for AlertsPanel", () => {
      const html = renderToStaticMarkup(
        React.createElement(AlertsPanel, { alerts: [], isLoading: true })
      );

      assert.ok(html.includes("Loading anomaly alerts..."));
    });

    it("should render empty state when no alerts exist", () => {
      const html = renderToStaticMarkup(
        React.createElement(AlertsPanel, { alerts: [], isLoading: false })
      );

      assert.ok(html.includes("No anomaly alerts detected."));
    });

    it("should mark cards interactive when onSelectAlert handler is provided", () => {
      const html = renderToStaticMarkup(
        React.createElement(AlertsPanel, {
          alerts: mockAlerts,
          onSelectAlert: () => {}
        })
      );

      assert.ok(html.includes("alert-card interactive"));
    });
  });

  describe("IncidentsPanel Component", () => {
    const mockIncidents: IncidentRecord[] = [
      {
        incident_id: "inc_9001",
        status: "MITIGATING",
        severity: "SEV-1",
        service: "payment-gateway",
        deduplicated_alerts_count: 8,
        active_runbook: "rb_failover_db",
        opened_at_utc: "2026-10-20T18:10:00Z",
        updated_at_utc: "2026-10-20T18:12:00Z"
      }
    ];

    const mockRunbookHandler = async (): Promise<RunbookExecutionResult> => ({
      execution_id: "exec_123",
      incident_id: "inc_9001",
      runbook_id: "rb_failover_db",
      status: "SUCCESS",
      executed_at: "2026-10-20T18:12:30Z",
      message: "Runbook executed successfully."
    });

    it("should render incident timeline card with status and active runbook button", () => {
      const html = renderToStaticMarkup(
        React.createElement(IncidentsPanel, {
          incidents: mockIncidents,
          onTriggerRunbook: mockRunbookHandler
        })
      );

      assert.ok(html.includes("Active Incident Timeline"));
      assert.ok(html.includes("inc_9001"));
      assert.ok(html.includes("status-mitigating"));
      assert.ok(html.includes("MITIGATING"));
      assert.ok(html.includes("badge-sev-1"));
      assert.ok(html.includes("SEV-1"));
      assert.ok(html.includes("Execute Runbook (rb_failover_db)"));
    });

    it("should render loading state for IncidentsPanel", () => {
      const html = renderToStaticMarkup(
        React.createElement(IncidentsPanel, {
          incidents: [],
          onTriggerRunbook: mockRunbookHandler,
          isLoading: true
        })
      );

      assert.ok(html.includes("Loading incident records..."));
    });

    it("should render empty state when no incidents are present", () => {
      const html = renderToStaticMarkup(
        React.createElement(IncidentsPanel, {
          incidents: [],
          onTriggerRunbook: mockRunbookHandler,
          isLoading: false
        })
      );

      assert.ok(html.includes("No incidents recorded."));
    });
  });
});
