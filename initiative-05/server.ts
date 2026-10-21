import http from "node:http";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  AlertClientAdapter,
  AnomalyAlert,
  ChaosClientAdapter,
  ChaosExperimentConfig,
  ChaosExperimentResult,
  DefaultAlertAdapter,
  DefaultChaosAdapter,
  DefaultIncidentAdapter,
  DefaultTelemetryAdapter,
  DefaultWarRoomBffAggregator,
  IncidentClientAdapter,
  IncidentRecord,
  IncidentStatus,
  RunbookExecutionRequest,
  RunbookExecutionResult,
  TelemetryClientAdapter,
  TelemetryEvent,
} from "./bff/index.js";
import { AlertsPanel } from "./components/AlertsPanel.js";
import { IncidentsPanel } from "./components/IncidentsPanel.js";
import { TelemetryPanel } from "./components/TelemetryPanel.js";
import { ChaosSimulatorView } from "./views/ChaosSimulatorView.js";
import { MttrMetricsView } from "./views/MttrMetricsView.js";
import { WarRoomDashboard } from "./views/WarRoomDashboard.js";

const PORT = Number(process.env.PORT || 8080);
const TELEMETRY_URL = process.env.TELEMETRY_URL || "http://telemetry-ingestor:8081";
const ALERT_URL = process.env.ALERT_URL || "http://anomaly-sentinel:8082";
const INCIDENT_URL = process.env.INCIDENT_URL || "http://incident-orchestrator:8083";
const CHAOS_URL = process.env.CHAOS_URL || "http://chaos-verifier:8084";

const MONITORED_SERVICES = [
  "payment-gateway-prod",
  "order-processor-prod",
  "auth-service-prod",
];

const AVAILABLE_SCENARIOS = [
  "SYNTHETIC_LATENCY_BURST",
  "ERROR_5XX_BURST",
  "CPU_SATURATION",
  "COMBINED_FAILURE",
];

async function fetchJsonWithTimeout<T>(url: string, options?: RequestInit, timeoutMs = 2500): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class LiveTelemetryAdapter implements TelemetryClientAdapter {
  private fallback = new DefaultTelemetryAdapter();
  async fetchRecentEvents(service?: string, limit?: number): Promise<TelemetryEvent[]> {
    try {
      const events = await fetchJsonWithTimeout<TelemetryEvent[]>(`${TELEMETRY_URL}/v1/events`);
      let filtered = service ? events.filter((e) => e.source_service === service) : events;
      if (limit !== undefined && limit >= 0) {
        filtered = filtered.slice(0, limit);
      }
      return filtered;
    } catch {
      return this.fallback.fetchRecentEvents(service, limit);
    }
  }
}

export class LiveAlertAdapter implements AlertClientAdapter {
  private fallback = new DefaultAlertAdapter();
  async fetchActiveAlerts(service?: string): Promise<AnomalyAlert[]> {
    try {
      const query = service ? `?service=${encodeURIComponent(service)}` : "";
      return await fetchJsonWithTimeout<AnomalyAlert[]>(`${ALERT_URL}/v1/alerts${query}`);
    } catch {
      return this.fallback.fetchActiveAlerts(service);
    }
  }
}

export class LiveIncidentAdapter implements IncidentClientAdapter {
  private fallback = new DefaultIncidentAdapter();
  async fetchIncidents(status?: IncidentStatus, service?: string): Promise<IncidentRecord[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (service) params.set("service", service);
      params.set("limit", "50");
      return await fetchJsonWithTimeout<IncidentRecord[]>(`${INCIDENT_URL}/v1/incidents?${params.toString()}`);
    } catch {
      return this.fallback.fetchIncidents(status, service);
    }
  }

  async triggerRunbook(request: RunbookExecutionRequest): Promise<RunbookExecutionResult> {
    try {
      return await fetchJsonWithTimeout<RunbookExecutionResult>(
        `${INCIDENT_URL}/v1/incidents/${encodeURIComponent(request.incident_id)}/runbook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }
      );
    } catch {
      return this.fallback.triggerRunbook(request);
    }
  }
}

export class LiveChaosAdapter implements ChaosClientAdapter {
  private fallback = new DefaultChaosAdapter();
  async triggerExperiment(config: ChaosExperimentConfig): Promise<ChaosExperimentResult> {
    try {
      const result = await fetchJsonWithTimeout<ChaosExperimentResult>(`${CHAOS_URL}/v1/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      // Cascade synthetic event across P1 (Rust) -> P2 (Python) -> P3 (Go)
      const syntheticEvent: TelemetryEvent = {
        event_id: `evt_chaos_${Date.now().toString(36)}`,
        timestamp_utc: new Date().toISOString(),
        source_service: config.target_service,
        host_id: "chaos-injector-node-01",
        metrics: {
          cpu_usage_pct: Math.min(99.9, 65 + config.intensity * 3.4),
          memory_rss_mb: 2048 + config.intensity * 256,
          latency_p99_ms: 850 + config.intensity * 180,
          error_rate_pct: Math.min(95.0, 5 + config.intensity * 3.2),
        },
        raw_log: `CRITICAL [chaos_verifier] Injected ${config.scenario_type} (intensity=${config.intensity}) on ${config.target_service}`,
        compression: "lz4",
      };

      try {
        await fetchJsonWithTimeout(`${TELEMETRY_URL}/v1/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syntheticEvent),
        });
      } catch {
        // Ignore upstream ingest error in fallback
      }

      try {
        const alerts = await fetchJsonWithTimeout<AnomalyAlert[]>(`${ALERT_URL}/v1/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syntheticEvent),
        });
        for (const alert of alerts) {
          await fetchJsonWithTimeout(`${INCIDENT_URL}/v1/alerts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alert),
          });
        }
      } catch {
        // Ignore upstream alert cascade error in fallback
      }

      return result;
    } catch {
      return this.fallback.triggerExperiment(config);
    }
  }

  async fetchExperimentHistory(limit?: number): Promise<ChaosExperimentResult[]> {
    try {
      const query = limit !== undefined ? `?limit=${limit}` : "";
      return await fetchJsonWithTimeout<ChaosExperimentResult[]>(`${CHAOS_URL}/v1/experiments${query}`);
    } catch {
      return this.fallback.fetchExperimentHistory(limit);
    }
  }
}

const telemetryAdapter = new LiveTelemetryAdapter();
const alertAdapter = new LiveAlertAdapter();
const incidentAdapter = new LiveIncidentAdapter();
const chaosAdapter = new LiveChaosAdapter();
const bffAggregator = new DefaultWarRoomBffAggregator(
  telemetryAdapter,
  alertAdapter,
  incidentAdapter,
  chaosAdapter
);

interface MeshNodeStatus {
  id: string;
  name: string;
  tech: string;
  port: number;
  online: boolean;
}

async function checkMeshHealth(): Promise<MeshNodeStatus[]> {
  const checks = [
    { id: "P1", name: "Telemetry Ingestor", tech: "Rust", port: 8081, url: `${TELEMETRY_URL}/healthz` },
    { id: "P2", name: "Anomaly Sentinel", tech: "Python 3.12", port: 8082, url: `${ALERT_URL}/healthz` },
    { id: "P3", name: "Incident Orchestrator", tech: "Go 1.22", port: 8083, url: `${INCIDENT_URL}/healthz` },
    { id: "P4", name: "Chaos Verifier", tech: "Node.js / TS", port: 8084, url: `${CHAOS_URL}/healthz` },
  ];

  const results = await Promise.all(
    checks.map(async (c) => {
      try {
        await fetchJsonWithTimeout(c.url, undefined, 1200);
        return { id: c.id, name: c.name, tech: c.tech, port: c.port, online: true };
      } catch {
        return { id: c.id, name: c.name, tech: c.tech, port: c.port, online: false };
      }
    })
  );

  results.push({
    id: "P5",
    name: "Command Center UI & BFF",
    tech: "React / TS",
    port: PORT,
    online: true,
  });

  return results;
}

export async function renderDashboardHtml(): Promise<string> {
  const [summary, services, events, alerts, incidents, experiments, mesh] = await Promise.all([
    bffAggregator.getWarRoomSummary(),
    Promise.all(MONITORED_SERVICES.map((svc) => bffAggregator.getServiceOverview(svc))),
    telemetryAdapter.fetchRecentEvents(undefined, 15),
    alertAdapter.fetchActiveAlerts(),
    incidentAdapter.fetchIncidents(),
    chaosAdapter.fetchExperimentHistory(15),
    checkMeshHealth(),
  ]);

  for (const svc of MONITORED_SERVICES) {
    if (!services.some((s) => s.service_name === svc)) {
      services.push(await bffAggregator.getServiceOverview(svc));
    }
  }

  const noopAsync = async () => {};
  const noopRunbook = async (req: RunbookExecutionRequest): Promise<RunbookExecutionResult> => ({
    execution_id: "exec_ssr",
    incident_id: req.incident_id,
    runbook_id: req.runbook_id,
    status: "SUCCESS",
    executed_at: new Date().toISOString(),
    message: "Ready",
  });
  const noopChaos = async (cfg: ChaosExperimentConfig): Promise<ChaosExperimentResult> => ({
    experiment_id: cfg.experiment_id,
    scenario: cfg.scenario_type,
    target_service: cfg.target_service,
    injected_events_count: 100,
    detection_time_ms: 1000,
    mitigation_recovery_mttr_ms: 5000,
    passed_sla: true,
  });

  const warRoomHtml = ReactDOMServer.renderToString(
    React.createElement(WarRoomDashboard, {
      summary,
      services,
      onRefreshAll: noopAsync,
    })
  );

  const telemetryHtml = ReactDOMServer.renderToString(
    React.createElement(TelemetryPanel, { events })
  );

  const alertsHtml = ReactDOMServer.renderToString(
    React.createElement(AlertsPanel, { alerts })
  );

  const incidentsHtml = ReactDOMServer.renderToString(
    React.createElement(IncidentsPanel, {
      incidents,
      onTriggerRunbook: noopRunbook,
    })
  );

  const chaosHtml = ReactDOMServer.renderToString(
    React.createElement(ChaosSimulatorView, {
      availableScenarios: AVAILABLE_SCENARIOS,
      targetServices: MONITORED_SERVICES,
      onRunExperiment: noopChaos,
      recentResults: experiments,
    })
  );

  const mttrHtml = ReactDOMServer.renderToString(
    React.createElement(MttrMetricsView, {
      experimentResults: experiments,
      slaTargetMs: 15000,
      averageMttrMs: summary.average_mttr_ms || 12400,
      historicalIncidentCount: incidents.length,
    })
  );

  const meshBadgesHtml = mesh
    .map(
      (m) => `
      <div class="mesh-pill ${m.online ? "online" : "offline"}">
        <span class="dot"></span>
        <div>
          <div class="mesh-title">${m.id} · ${m.name}</div>
          <div class="mesh-meta">${m.tech} · :${m.port} · ${m.online ? "ONLINE" : "FALLBACK"}</div>
        </div>
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AegisPulse Command Center — Initiative 05 War Room</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background-color: #F3F4F6;
      color: #111827;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .topbar {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      color: #F8FAFC;
      padding: 1rem 1.75rem;
      border-bottom: 1px solid #334155;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .topbar-header {
      max-width: 1240px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-badge {
      background: #2563EB;
      color: #FFF;
      font-weight: 800;
      padding: 0.35rem 0.65rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
    }
    .mesh-bar {
      max-width: 1240px;
      margin: 0.85rem auto 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 0.65rem;
    }
    .mesh-pill {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .mesh-pill.online .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
      flex-shrink: 0;
    }
    .mesh-pill.offline .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #F59E0B;
      flex-shrink: 0;
    }
    .mesh-title { font-size: 0.8rem; font-weight: 700; color: #F8FAFC; }
    .mesh-meta { font-size: 0.7rem; color: #94A3B8; }
    .nav-tabs {
      max-width: 1240px;
      margin: 1.25rem auto 0 auto;
      padding: 0 1.5rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 0.6rem 1.1rem;
      border-radius: 0.5rem;
      border: 1px solid #D1D5DB;
      background: #FFFFFF;
      color: #374151;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn.active {
      background: #2563EB;
      color: #FFFFFF;
      border-color: #2563EB;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
    }
    .tab-section { display: none; }
    .tab-section.active { display: block; }
    .panels-grid {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 1.5rem;
    }
    .telemetry-panel, .alerts-panel, .incidents-panel {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 0.5rem;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .telemetry-panel-header, .alerts-panel-header, .incidents-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      border-bottom: 1px solid #F3F4F6;
      padding-bottom: 0.75rem;
    }
    .telemetry-panel-header h2, .alerts-panel-header h2, .incidents-panel-header h2 {
      margin: 0;
      font-size: 1.15rem;
      color: #1F2937;
    }
    .telemetry-card, .alert-card, .incident-card {
      border: 1px solid #E5E7EB;
      border-radius: 0.5rem;
      padding: 0.9rem;
      margin-bottom: 0.75rem;
      background: #F9FAFB;
    }
    .telemetry-card-header, .alert-card-header, .incident-card-header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.8rem;
    }
    .event-id, .incident-id { font-family: monospace; font-weight: 700; color: #2563EB; }
    .service-name, .alert-service, .incident-service {
      font-weight: 700;
      color: #111827;
      background: #E5E7EB;
      padding: 0.15rem 0.5rem;
      border-radius: 0.25rem;
    }
    .telemetry-metrics, .alert-details, .incident-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: #4B5563;
      margin-bottom: 0.5rem;
    }
    .telemetry-raw-log {
      background: #111827;
      color: #10B981;
      padding: 0.45rem 0.65rem;
      border-radius: 0.35rem;
      font-size: 0.75rem;
      overflow-x: auto;
    }
    .severity-badge, .status-badge {
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .badge-sev-1 { background: #FEE2E2; color: #991B1B; border: 1px solid #EF4444; }
    .badge-sev-2 { background: #FEF3C7; color: #92400E; border: 1px solid #F59E0B; }
    .badge-sev-3 { background: #DBEAFE; color: #1E40AF; border: 1px solid #3B82F6; }
    .status-open { background: #FEE2E2; color: #991B1B; }
    .status-mitigating { background: #FEF3C7; color: #92400E; }
    .status-resolved { background: #D1FAE5; color: #065F46; }
    .trigger-runbook-button {
      margin-top: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.75rem;
      background: #059669;
      color: #FFF;
      border: none;
      border-radius: 0.375rem;
      font-weight: 600;
      cursor: pointer;
    }
    .trigger-runbook-button:hover { background: #047857; }
    .toast-banner {
      max-width: 1150px;
      margin: 1rem auto 0 auto;
      padding: 0.85rem 1.25rem;
      border-radius: 0.5rem;
      background: #ECFDF5;
      border: 1px solid #10B981;
      color: #065F46;
      font-weight: 600;
      display: none;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-header">
      <div class="brand">
        <span class="brand-badge">AEGISPULSE</span>
        <div>
          <div style="font-weight:700;font-size:1.1rem;">Dual Agent Foundry — Command Center UI (Initiative 05)</div>
          <div style="font-size:0.78rem;color:#94A3B8;">Connected Polyglot Microservices Mesh (Rust · Python · Go · Node.js · React)</div>
        </div>
      </div>
      <div style="font-size:0.8rem;color:#CBD5E1;">
        BFF Port: <strong>:${PORT}</strong>
      </div>
    </div>
    <div class="mesh-bar">
      ${meshBadgesHtml}
    </div>
  </div>

  <div id="toast" class="toast-banner"></div>

  <nav class="nav-tabs">
    <button class="tab-btn active" onclick="switchTab('all', this)">🌐 Unified Command View (All-in-One)</button>
    <button class="tab-btn" onclick="switchTab('warroom', this)">🛡️ War Room Overview</button>
    <button class="tab-btn" onclick="switchTab('panels', this)">📡 Live Telemetry, Alerts & Incidents</button>
    <button class="tab-btn" onclick="switchTab('chaos', this)">⚡ Chaos Engineering Simulator</button>
    <button class="tab-btn" onclick="switchTab('mttr', this)">📊 MTTR & SLA Analytics</button>
  </nav>

  <main>
    <div id="sec-warroom" class="tab-section active">
      ${warRoomHtml}
    </div>

    <div id="sec-panels" class="tab-section active">
      <div class="panels-grid">
        <div>${incidentsHtml}</div>
        <div>${alertsHtml}</div>
        <div>${telemetryHtml}</div>
      </div>
    </div>

    <div id="sec-chaos" class="tab-section active">
      ${chaosHtml}
    </div>

    <div id="sec-mttr" class="tab-section active">
      ${mttrHtml}
    </div>
  </main>

  <script>
    function switchTab(tab, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sections = {
        warroom: document.getElementById('sec-warroom'),
        panels: document.getElementById('sec-panels'),
        chaos: document.getElementById('sec-chaos'),
        mttr: document.getElementById('sec-mttr')
      };
      Object.entries(sections).forEach(([key, el]) => {
        if (tab === 'all' || tab === key) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.display = 'block';
    }

    // Wire Refresh Dashboard button
    document.querySelectorAll('.war-room-dashboard header button').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.textContent = 'Refreshing...';
        window.location.reload();
      });
    });

    // Wire Runbook execution buttons
    const incidentsData = ${JSON.stringify(incidents)};
    document.querySelectorAll('.trigger-runbook-button').forEach((btn, idx) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const inc = incidentsData[idx];
        if (!inc) return;
        btn.disabled = true;
        btn.textContent = 'Executing Runbook...';
        try {
          const res = await fetch('/api/runbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              incident_id: inc.incident_id,
              runbook_id: inc.active_runbook || 'rb_auto_mitigate',
              triggered_by: 'CommandCenterUI'
            })
          });
          const data = await res.json();
          showToast('✅ ' + (data.message || 'Runbook executed successfully'));
          setTimeout(() => window.location.reload(), 900);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Retry Runbook';
        }
      });
    });

    // Wire Chaos Simulator Form
    const chaosForm = document.querySelector('.chaos-simulator-view form');
    if (chaosForm) {
      const selects = chaosForm.querySelectorAll('select');
      const inputs = chaosForm.querySelectorAll('input');
      const rangeInput = inputs[0];
      if (rangeInput) {
        rangeInput.addEventListener('input', () => {
          const label = rangeInput.parentElement.querySelector('label');
          if (label) label.textContent = 'Intensity Level (1-10): ' + rangeInput.value;
        });
      }

      chaosForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = chaosForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Executing Chaos Scenario across 5 Services...';
        }
        const config = {
          experiment_id: 'exp_' + Date.now().toString(36),
          scenario_type: selects[0] ? selects[0].value : 'SYNTHETIC_LATENCY_BURST',
          target_service: selects[1] ? selects[1].value : 'payment-gateway-prod',
          intensity: Number(inputs[0] ? inputs[0].value : 5),
          duration_seconds: Number(inputs[1] ? inputs[1].value : 30),
          sla_max_mttr_ms: Number(inputs[2] ? inputs[2].value : 15000),
          sla_max_detection_ms: Number(inputs[3] ? inputs[3].value : 3000)
        };
        try {
          const res = await fetch('/api/chaos/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
          });
          const result = await res.json();
          showToast('⚡ Chaos Scenario ' + result.scenario + ' injected on ' + result.target_service + ' (MTTR: ' + result.mitigation_recovery_mttr_ms + 'ms)');
          setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '⚡ Inject Failure Scenario';
          }
        }
      });
    }
  </script>
</body>
</html>`;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { status: "ok", service: "command-center-ui" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/summary") {
    const summary = await bffAggregator.getWarRoomSummary();
    sendJson(res, 200, summary);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runbook") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(raw || "{}") as RunbookExecutionRequest;
        const result = await incidentAdapter.triggerRunbook(payload);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Runbook error" });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chaos/run") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      try {
        const config = JSON.parse(raw || "{}") as ChaosExperimentConfig;
        const result = await chaosAdapter.triggerExperiment(config);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Chaos run error" });
      }
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    try {
      const html = await renderDashboardHtml();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Error rendering dashboard: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Initiative 05 Command Center UI & BFF listening on http://0.0.0.0:${PORT}`);
});
