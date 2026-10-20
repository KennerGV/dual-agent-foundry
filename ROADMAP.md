# AegisPulse — Global Architecture & Inter-Service Contracts (`ROADMAP.md`)

Este documento define el contrato global del ecosistema **AegisPulse** dentro de `KennerGV/dual-agent-foundry`. Todos los escuadrones de agentes en **Jules** y el Comité Revisor de **Antigravity** deben respetar estrictamente estos esquemas y reglas de aislamiento.

---

## 1. Reglas de Oro para Agentes (Jules & Antigravity)

1. **Aislamiento Estricto por Carpeta y Subcarpeta:**
   * Ningún agente puede modificar archivos fuera de su carpeta de iniciativa (`initiative-01/` a `initiative-05/`) ni fuera de su subcarpeta asignada (`core/`, `data/`, `api/`, `tests/`).
2. **Contrato de Docker Obligatorio (`--network none`):**
   * Cada carpeta `initiative-0X/` debe contener un `Dockerfile` autocontenido cuyo comando por defecto (`CMD`) ejecute la suite completa de pruebas automatizadas sin requerir acceso a internet durante `docker run`.
3. **Cortacircuitos de 3 Intentos:**
   * Si un Pull Request recibe 3 revisiones con `CHANGES_REQUESTED` por parte de Antigravity, queda pausado hasta la intervención de `@KennerGV`.

---

## 2. Contratos Globales de Datos entre las 5 Iniciativas

### 2.1 Contrato `TelemetryEvent` (Producido por `initiative-01` Rust -> Consumido por `initiative-02` Python)
```json
{
  "event_id": "evt_9f8a7b6c",
  "timestamp_utc": "2026-10-20T18:00:00Z",
  "source_service": "payment-gateway-prod",
  "host_id": "node-us-east-04",
  "metrics": {
    "cpu_usage_pct": 94.2,
    "memory_rss_mb": 3840,
    "latency_p99_ms": 1420.5,
    "error_rate_pct": 18.4
  },
  "raw_log": "ERROR [conn_pool] timeout acquiring connection after 1000ms",
  "compression": "lz4"
}
```

### 2.2 Contrato `AnomalyAlert` (Producido por `initiative-02` Python -> Consumido por `initiative-03` Go)
```json
{
  "alert_id": "alt_3c2d1e0f",
  "detected_at_utc": "2026-10-20T18:00:02Z",
  "source_event_ids": ["evt_9f8a7b6c"],
  "source_service": "payment-gateway-prod",
  "anomaly_type": "LATENCY_SPIKE_AND_ERROR_SURGE",
  "z_score": 4.85,
  "confidence": 0.96,
  "recommended_severity": "SEV-1"
}
```

### 2.3 Contrato `IncidentRecord` (Gestionado por `initiative-03` Go -> Consumido por `initiative-05` React/TS)
```json
{
  "incident_id": "inc_2026_0042",
  "status": "MITIGATING",
  "severity": "SEV-1",
  "service": "payment-gateway-prod",
  "deduplicated_alerts_count": 14,
  "active_runbook": "rb_restart_conn_pool_and_scale",
  "opened_at_utc": "2026-10-20T18:00:03Z",
  "updated_at_utc": "2026-10-20T18:00:15Z"
}
```

### 2.4 Contrato `ChaosExperimentResult` (Producido por `initiative-04` Node/TS -> Consumido por `initiative-01` y `initiative-05`)
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
