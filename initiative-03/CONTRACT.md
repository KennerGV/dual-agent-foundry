# Contract Specification — Initiative 03 (Incident Orchestrator)

## 1. Visión General y Arquitectura
Este documento define el contrato técnico, modelos de datos, firmas de structs e interfaces Go (`Go 1.22`) para **`initiative-03/` (Incident Orchestrator)** dentro de la plataforma AegisPulse.

Incident Orchestrator es la máquina de estados concurrente responsable de consumir alertas de anomalías (`AnomalyAlert` producidas por `initiative-02`), agruparlas y deduplicarlas, gestionar el ciclo de vida inmutable de los incidentes (`IncidentRecord`), y ejecutar disparadores de mitigación/runbooks consumidos posteriormente por la interfaz de comando (`initiative-05`).

---

## 2. Modelos de Datos Globales (Go Structs & JSON)

### 2.1 `AnomalyAlert` (Consumido desde Initiative 02 / Python)
Derivado de `ROADMAP.md` Sección 2.2:

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

```go
package types

import "time"

type Severity string

const (
	SeveritySev1 Severity = "SEV-1"
	SeveritySev2 Severity = "SEV-2"
	SeveritySev3 Severity = "SEV-3"
)

type AnomalyAlert struct {
	AlertID             string    `json:"alert_id"`
	DetectedAtUTC       time.Time `json:"detected_at_utc"`
	SourceEventIDs      []string  `json:"source_event_ids"`
	SourceService       string    `json:"source_service"`
	AnomalyType         string    `json:"anomaly_type"`
	ZScore              float64   `json:"z_score"`
	Confidence          float64   `json:"confidence"`
	RecommendedSeverity Severity  `json:"recommended_severity"`
}
```

### 2.2 `IncidentRecord` (Gestionado por Initiative 03 -> Consumido por Initiative 05)
Derivado de `ROADMAP.md` Sección 2.3:

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

```go
package types

import "time"

type IncidentStatus string

const (
	StatusOpen       IncidentStatus = "OPEN"
	StatusMitigating IncidentStatus = "MITIGATING"
	StatusResolved   IncidentStatus = "RESOLVED"
	StatusClosed     IncidentStatus = "CLOSED"
)

type IncidentRecord struct {
	IncidentID              string         `json:"incident_id"`
	Status                  IncidentStatus `json:"status"`
	Severity                Severity       `json:"severity"`
	Service                 string         `json:"service"`
	DeduplicatedAlertsCount int            `json:"deduplicated_alerts_count"`
	ActiveRunbook           string         `json:"active_runbook"`
	OpenedAtUTC             time.Time      `json:"opened_at_utc"`
	UpdatedAtUTC             time.Time      `json:"updated_at_utc"`
}
```

### 2.3 `IncidentAuditEvent` (Historial Inmutable de Auditoría)
```go
package types

import "time"

type AuditEventType string

const (
	AuditAlertIngested     AuditEventType = "ALERT_INGESTED"
	AuditStateTransition  AuditEventType = "STATE_TRANSITION"
	AuditRunbookTriggered AuditEventType = "RUNBOOK_TRIGGERED"
	AuditSeverityEscalated AuditEventType = "SEVERITY_ESCALATED"
)

type IncidentAuditEvent struct {
	EventID      string         `json:"event_id"`
	IncidentID   string         `json:"incident_id"`
	EventType    AuditEventType `json:"event_type"`
	TimestampUTC time.Time      `json:"timestamp_utc"`
	Details      string         `json:"details"`
	Actor        string         `json:"actor"`
}
```

### 2.4 Modelos de Disparo de Runbooks (`RunbookExecution`)
```go
package types

import "time"

type RunbookExecutionRequest struct {
	IncidentID  string `json:"incident_id"`
	RunbookID   string `json:"runbook_id"`
	TriggeredBy string `json:"triggered_by"`
}

type RunbookExecutionResult struct {
	ExecutionID string    `json:"execution_id"`
	IncidentID  string    `json:"incident_id"`
	RunbookID   string    `json:"runbook_id"`
	Status      string    `json:"status"` // e.g. "EXECUTING", "SUCCESS", "FAILED"
	ExecutedAt  time.Time `json:"executed_at"`
	Message     string    `json:"message"`
}
```

---

## 3. Interfaces por Capa

### 3.1 Capa `engine/` (Máquina de Estados Concurrente y Deduplicación)
**Responsabilidad:** Procesamiento concurrente e hilado seguro (thread-safe) de `AnomalyAlert`, deduplicación por clave sintética (servicio + tipo de anomalía dentro de ventana temporal), y transiciones válidas de estado en la máquina de estados de incidentes.

```go
package engine

import (
	"context"
	"errors"

	"initiative-03/types"
)

var (
	ErrInvalidStateTransition = errors.New("transición de estado no permitida")
	ErrIncidentNotFound       = errors.New("incidente no encontrado")
)

// AlertDeduplicator evalúa si una alerta entrante pertenece a un incidente activo existente.
type AlertDeduplicator interface {
	Deduplicate(ctx context.Context, alert types.AnomalyAlert) (isDuplicate bool, existingIncidentID string, err error)
}

// StateMachine gestiona las transiciones válidas de un IncidentRecord.
type StateMachine interface {
	TransitionState(ctx context.Context, incidentID string, targetStatus types.IncidentStatus) (*types.IncidentRecord, error)
	EscalateSeverity(ctx context.Context, incidentID string, newSeverity types.Severity) (*types.IncidentRecord, error)
}

// OrchestratorEngine orquesta el flujo completo de alertas recibidas.
type OrchestratorEngine interface {
	ProcessAlert(ctx context.Context, alert types.AnomalyAlert) (*types.IncidentRecord, error)
	GetActiveIncident(ctx context.Context, service string) (*types.IncidentRecord, error)
}
```

---

### 3.2 Capa `store/` (Repositorio e Historial Inmutable de Incidentes)
**Responsabilidad:** Almacenamiento thread-safe en memoria/persistencia de `IncidentRecord` y registro append-only e inmutable de eventos de auditoría `IncidentAuditEvent`.

```go
package store

import (
	"context"
	"errors"

	"initiative-03/types"
)

var (
	ErrNotFound      = errors.New("recurso no encontrado en store")
	ErrAlreadyExists = errors.New("incidente ya existente con esa ID")
)

type StoreFilter struct {
	Service string
	Status  types.IncidentStatus
	Limit   int
	Offset  int
}

// IncidentRepository abstrae el almacenamiento y consulta de incidentes.
type IncidentRepository interface {
	Create(ctx context.Context, incident *types.IncidentRecord) error
	GetByID(ctx context.Context, incidentID string) (*types.IncidentRecord, error)
	Update(ctx context.Context, incident *types.IncidentRecord) error
	List(ctx context.Context, filter StoreFilter) ([]*types.IncidentRecord, error)
}

// AuditLogger proporciona almacenamiento de solo apéndice (append-only) para auditoría.
type AuditLogger interface {
	AppendAudit(ctx context.Context, event types.IncidentAuditEvent) error
	GetAuditLogs(ctx context.Context, incidentID string) ([]types.IncidentAuditEvent, error)
}
```

---

### 3.3 Capa `api/` (Handlers HTTP y Disparador de Runbooks)
**Responsabilidad:** Exposición de endpoints REST mediante net/http para ingesta de alertas, consulta de incidentes y activación de runbooks.

#### Endpoints REST HTTP
- `POST /v1/alerts`
  - Body: `AnomalyAlert`
  - Resp: `202 Accepted` / `200 OK` con `IncidentRecord`
- `GET /v1/incidents`
  - Query parameters: `service`, `status`, `limit`, `offset`
  - Resp: `200 OK` con `[]IncidentRecord`
- `GET /v1/incidents/{id}`
  - Resp: `200 OK` con `IncidentRecord`
- `POST /v1/incidents/{id}/runbook`
  - Body: `RunbookExecutionRequest`
  - Resp: `200 OK` con `RunbookExecutionResult`
- `GET /healthz`
  - Resp: `200 OK` `{"status": "ok", "service": "incident-orchestrator"}`

```go
package api

import (
	"context"
	"net/http"

	"initiative-03/types"
)

// RunbookTrigger gestiona la ejecución de mitigaciones automatizadas o manuales.
type RunbookTrigger interface {
	ExecuteRunbook(ctx context.Context, req types.RunbookExecutionRequest) (*types.RunbookExecutionResult, error)
}

// HTTPHandler encapsula los endpoints REST HTTP del servicio.
type HTTPHandler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
	HandleIngestAlert(w http.ResponseWriter, r *http.Request)
	HandleGetIncident(w http.ResponseWriter, r *http.Request)
	HandleListIncidents(w http.ResponseWriter, r *http.Request)
	HandleTriggerRunbook(w http.ResponseWriter, r *http.Request)
	HandleHealthCheck(w http.ResponseWriter, r *http.Request)
}
```

---

## 4. Flujo de Interacción entre Capas

```
                  ┌──────────────────────┐
                  │ AnomalyAlert (HTTP)  │
                  └──────────┬───────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ api/ Layer (HTTP Handlers & JSON Deserialization)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ engine/ Layer (AlertDeduplicator & StateMachine)        │
│  - Chequea si existe incidente activo para el servicio  │
│  - Si existe: incrementa deduplicated_alerts_count      │
│  - Si no existe: crea nuevo IncidentRecord (OPEN)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ store/ Layer (IncidentRepository & AuditLogger)         │
│  - Persiste cambios en IncidentRecord                   │
│  - Escribe registro inmutable (IncidentAuditEvent)     │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ api/ Layer (RunbookTrigger - si aplica)                 │
│  - Actualiza estado a MITIGATING                        │
│  - Retorna IncidentRecord actualizado                    │
└─────────────────────────────────────────────────────────┘
```
