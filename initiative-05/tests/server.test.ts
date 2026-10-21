// SSR/BFF Server & Live Adapters Unit Test Suite for Initiative 05

import test, { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  LiveTelemetryAdapter,
  LiveAlertAdapter,
  LiveIncidentAdapter,
  LiveChaosAdapter,
  renderDashboardHtml,
  server,
} from "../server.js";

describe("Server & Live Adapters Test Suite", () => {
  after(() => {
    server.close();
  });

  describe("Live Client Adapters Fallback Mechanisms", () => {
    it("LiveTelemetryAdapter should fallback to DefaultTelemetryAdapter when upstream is offline", async () => {
      const adapter = new LiveTelemetryAdapter();
      const events = await adapter.fetchRecentEvents("payment-gateway-prod", 5);
      assert.ok(Array.isArray(events));
      assert.ok(events.length > 0);
      assert.equal(events[0].source_service, "payment-gateway-prod");
    });

    it("LiveAlertAdapter should fallback to DefaultAlertAdapter when upstream is offline", async () => {
      const adapter = new LiveAlertAdapter();
      const alerts = await adapter.fetchActiveAlerts();
      assert.ok(Array.isArray(alerts));
      assert.ok(alerts.length >= 2);
    });

    it("LiveIncidentAdapter should fallback to DefaultIncidentAdapter when upstream is offline", async () => {
      const adapter = new LiveIncidentAdapter();
      const incidents = await adapter.fetchIncidents("MITIGATING");
      assert.ok(Array.isArray(incidents));
      assert.ok(incidents.length > 0);
      assert.equal(incidents[0].status, "MITIGATING");

      const runbookRes = await adapter.triggerRunbook({
        incident_id: "inc_2026_0042",
        runbook_id: "rb_restart",
        triggered_by: "TestRunner",
      });
      assert.equal(runbookRes.status, "SUCCESS");
      assert.equal(runbookRes.incident_id, "inc_2026_0042");
    });

    it("LiveChaosAdapter should fallback to DefaultChaosAdapter when upstream is offline", async () => {
      const adapter = new LiveChaosAdapter();
      const result = await adapter.triggerExperiment({
        experiment_id: "exp_live_fallback_01",
        scenario_type: "CPU_SATURATION",
        target_service: "payment-gateway-prod",
        intensity: 5,
        duration_seconds: 30,
        sla_max_mttr_ms: 15000,
        sla_max_detection_ms: 3000,
      });

      assert.equal(result.experiment_id, "exp_live_fallback_01");
      assert.equal(result.passed_sla, true);

      const history = await adapter.fetchExperimentHistory();
      assert.ok(Array.isArray(history));
      assert.ok(history.length > 0);
    });
  });

  describe("SSR Dashboard HTML Generator", () => {
    it("renderDashboardHtml should render full HTML with all views and panels", async () => {
      const html = await renderDashboardHtml();
      assert.ok(html.includes("<!DOCTYPE html>"));
      assert.ok(html.includes("AegisPulse Command Center"));
      assert.ok(html.includes("AegisPulse War Room Dashboard"));
      assert.ok(html.includes("Live Telemetry Stream"));
      assert.ok(html.includes("Active Alerts"));
      assert.ok(html.includes("Active Incident Timeline"));
      assert.ok(html.includes("Chaos Engineering Simulator"));
      assert.ok(html.includes("MTTR &amp; SLA Metrics Analytics"));
    });
  });

  describe("HTTP Server API Endpoints Integration", () => {
    function requestServer(
      path: string,
      method = "GET",
      body?: unknown
    ): Promise<{ status: number; body: string }> {
      return new Promise((resolve, reject) => {
        const addr = server.address();
        let port = 8080;
        if (addr && typeof addr === "object") {
          port = addr.port;
        }

        const payload = body ? JSON.stringify(body) : undefined;
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path,
            method,
            headers: payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {},
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              resolve({ status: res.statusCode || 500, body: data });
            });
          }
        );

        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
      });
    }

    it("GET /healthz should return 200 OK with service status", async () => {
      const res = await requestServer("/healthz");
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.status, "ok");
      assert.equal(data.service, "command-center-ui");
    });

    it("GET /api/summary should return 200 OK with War Room summary JSON", async () => {
      const res = await requestServer("/api/summary");
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.ok(typeof data.system_health_score === "number");
      assert.ok(typeof data.active_incidents_count === "number");
    });

    it("POST /api/runbook should execute runbook and return 200 OK", async () => {
      const res = await requestServer("/api/runbook", "POST", {
        incident_id: "inc_2026_0042",
        runbook_id: "rb_restart",
        triggered_by: "IntegrationTest",
      });
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.incident_id, "inc_2026_0042");
      assert.equal(data.status, "SUCCESS");
    });

    it("POST /api/chaos/run should trigger experiment and return 200 OK", async () => {
      const res = await requestServer("/api/chaos/run", "POST", {
        experiment_id: "exp_http_01",
        scenario_type: "SYNTHETIC_LATENCY_BURST",
        target_service: "auth-service-prod",
        intensity: 4,
        duration_seconds: 20,
        sla_max_mttr_ms: 15000,
        sla_max_detection_ms: 3000,
      });
      assert.equal(res.status, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.experiment_id, "exp_http_01");
      assert.equal(data.target_service, "auth-service-prod");
    });

    it("GET / should return 200 OK with rendered dashboard HTML", async () => {
      const res = await requestServer("/");
      assert.equal(res.status, 200);
      assert.ok(res.body.includes("<!DOCTYPE html>"));
      assert.ok(res.body.includes("AegisPulse Command Center"));
    });

    it("GET /unknown should return 404 Not Found", async () => {
      const res = await requestServer("/unknown");
      assert.equal(res.status, 404);
      const data = JSON.parse(res.body);
      assert.equal(data.error, "Not found");
    });
  });
});
