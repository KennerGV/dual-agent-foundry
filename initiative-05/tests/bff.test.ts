// BFF Adapters & Aggregator Unit Test Suite for Initiative 05

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DefaultTelemetryAdapter,
  DefaultAlertAdapter,
  DefaultIncidentAdapter,
  DefaultChaosAdapter,
  DefaultWarRoomBffAggregator
} from "../index.js";

describe("BFF Adapters and Aggregator Tests", () => {
  describe("DefaultTelemetryAdapter", () => {
    it("should fetch all initial telemetry events when no filter provided", async () => {
      const adapter = new DefaultTelemetryAdapter();
      const events = await adapter.fetchRecentEvents();
      assert.ok(events.length >= 3);
      assert.equal(events[0].event_id, "evt_9f8a7b6c");
    });

    it("should filter telemetry events by service name", async () => {
      const adapter = new DefaultTelemetryAdapter();
      const events = await adapter.fetchRecentEvents("payment-gateway-prod");
      assert.equal(events.length, 1);
      assert.equal(events[0].source_service, "payment-gateway-prod");
    });

    it("should limit the number of returned telemetry events", async () => {
      const adapter = new DefaultTelemetryAdapter();
      const events = await adapter.fetchRecentEvents(undefined, 2);
      assert.equal(events.length, 2);
    });
  });

  describe("DefaultAlertAdapter", () => {
    it("should fetch active alerts without service filter", async () => {
      const adapter = new DefaultAlertAdapter();
      const alerts = await adapter.fetchActiveAlerts();
      assert.ok(alerts.length >= 2);
    });

    it("should filter active alerts by service", async () => {
      const adapter = new DefaultAlertAdapter();
      const alerts = await adapter.fetchActiveAlerts("order-processor-prod");
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].source_service, "order-processor-prod");
    });
  });

  describe("DefaultIncidentAdapter", () => {
    it("should fetch incidents filtered by status and service", async () => {
      const adapter = new DefaultIncidentAdapter();
      const incidents = await adapter.fetchIncidents("MITIGATING", "payment-gateway-prod");
      assert.equal(incidents.length, 1);
      assert.equal(incidents[0].incident_id, "inc_2026_0042");
    });

    it("should return empty list when filter does not match any incident", async () => {
      const adapter = new DefaultIncidentAdapter();
      const incidents = await adapter.fetchIncidents("RESOLVED", "payment-gateway-prod");
      assert.equal(incidents.length, 0);
    });

    it("should execute runbook successfully and return result record", async () => {
      const adapter = new DefaultIncidentAdapter();
      const result = await adapter.triggerRunbook({
        incident_id: "inc_2026_0042",
        runbook_id: "rb_restart_conn_pool",
        triggered_by: "TestUser"
      });

      assert.equal(result.incident_id, "inc_2026_0042");
      assert.equal(result.status, "SUCCESS");
      assert.ok(result.message.includes("rb_restart_conn_pool"));
    });
  });

  describe("DefaultChaosAdapter", () => {
    it("should trigger chaos experiment and record pass status when within SLA", async () => {
      const adapter = new DefaultChaosAdapter();
      const result = await adapter.triggerExperiment({
        experiment_id: "exp_test_01",
        scenario_type: "LATENCY_SPIKE",
        target_service: "payment-gateway-prod",
        intensity: 3,
        duration_seconds: 20,
        sla_max_mttr_ms: 15000,
        sla_max_detection_ms: 3000
      });

      assert.equal(result.experiment_id, "exp_test_01");
      assert.equal(result.passed_sla, true);

      const history = await adapter.fetchExperimentHistory();
      assert.equal(history[0].experiment_id, "exp_test_01");
    });

    it("should evaluate passed_sla as false when detection or MTTR exceeds SLA limits", async () => {
      const adapter = new DefaultChaosAdapter();
      const result = await adapter.triggerExperiment({
        experiment_id: "exp_test_fail",
        scenario_type: "LATENCY_SPIKE",
        target_service: "payment-gateway-prod",
        intensity: 5,
        duration_seconds: 30,
        sla_max_mttr_ms: 5000, // lower than default 10000ms
        sla_max_detection_ms: 3000
      });

      assert.equal(result.passed_sla, false);
    });
  });

  describe("DefaultWarRoomBffAggregator", () => {
    it("should aggregate War Room summary with correct health score and incident counts", async () => {
      const aggregator = new DefaultWarRoomBffAggregator();
      const summary = await aggregator.getWarRoomSummary();

      assert.equal(summary.active_incidents_count, 1);
      assert.equal(summary.sev1_count, 1);
      assert.equal(summary.system_health_score, 75); // 100 - 25 for SEV-1
      assert.ok(summary.total_telemetry_events_ingested >= 3);
      assert.ok(summary.average_mttr_ms > 0);
    });

    it("should produce CRITICAL service overview when service has SEV-1 active incident", async () => {
      const aggregator = new DefaultWarRoomBffAggregator();
      const overview = await aggregator.getServiceOverview("payment-gateway-prod");

      assert.equal(overview.service_name, "payment-gateway-prod");
      assert.equal(overview.health_status, "CRITICAL");
      assert.equal(overview.active_incidents.length, 1);
      assert.ok(overview.latest_telemetry);
    });

    it("should produce HEALTHY service overview for service with no active incidents or alerts", async () => {
      const aggregator = new DefaultWarRoomBffAggregator();
      const overview = await aggregator.getServiceOverview("auth-service-prod");

      assert.equal(overview.service_name, "auth-service-prod");
      assert.equal(overview.health_status, "HEALTHY");
      assert.equal(overview.active_incidents.length, 0);
    });
  });
});
