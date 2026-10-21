import http from "node:http";
import { ChaosExperimentRunner } from "./runner/runner.js";
import { getAvailableScenarios, getScenarioGenerator } from "./scenarios/catalog.js";
import { ChaosExperimentResult, ExperimentConfig } from "./types.js";

const PORT = Number(process.env.PORT || 8084);
const runner = new ChaosExperimentRunner();

const experimentHistory: ChaosExperimentResult[] = [
  {
    experiment_id: "chs_ddos_sim_01",
    scenario: "SYNTHETIC_LATENCY_AND_ERROR_BURST",
    target_service: "payment-gateway-prod",
    injected_events_count: 500,
    detection_time_ms: 1850,
    mitigation_recovery_mttr_ms: 12400,
    passed_sla: true,
  },
];

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { status: "ok", service: "chaos-verifier" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/scenarios") {
    sendJson(res, 200, getAvailableScenarios());
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/experiments") {
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const data =
      limit !== undefined && !isNaN(limit) && limit >= 0
        ? experimentHistory.slice(0, limit)
        : experimentHistory;
    sendJson(res, 200, data);
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/experiments") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("error", (err) => {
      sendJson(res, 400, { error: err.message });
    });
    req.on("end", async () => {
      try {
        const body = JSON.parse(raw || "{}") as Partial<ExperimentConfig>;
        const config: ExperimentConfig = {
          experiment_id: body.experiment_id || `exp_${Date.now().toString(36)}`,
          scenario_type: body.scenario_type || "COMBINED_FAILURE",
          target_service: body.target_service || "payment-gateway-prod",
          intensity: Number(body.intensity ?? 5),
          duration_seconds: Number(body.duration_seconds ?? 15),
          sla_max_mttr_ms: Number(body.sla_max_mttr_ms ?? 15000),
          sla_max_detection_ms: Number(body.sla_max_detection_ms ?? 3000),
        };

        const generator = getScenarioGenerator(config.scenario_type);
        const result = await runner.run(config, generator);
        experimentHistory.unshift(result);
        if (experimentHistory.length > 50) {
          experimentHistory.length = 50;
        }
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : "Invalid experiment config",
        });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Initiative 04 Chaos Verifier listening on http://0.0.0.0:${PORT}`);
  });
}

export { server, experimentHistory, sendJson, PORT };
