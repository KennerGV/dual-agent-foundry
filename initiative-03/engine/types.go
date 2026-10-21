package engine

import (
	"context"
	"errors"
	"time"
)

// Global data models (from CONTRACT.md)

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
	UpdatedAtUTC            time.Time      `json:"updated_at_utc"`
}

type AuditEventType string

const (
	AuditAlertIngested     AuditEventType = "ALERT_INGESTED"
	AuditStateTransition   AuditEventType = "STATE_TRANSITION"
	AuditRunbookTriggered  AuditEventType = "RUNBOOK_TRIGGERED"
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

type RunbookExecutionRequest struct {
	IncidentID  string `json:"incident_id"`
	RunbookID   string `json:"runbook_id"`
	TriggeredBy string `json:"triggered_by"`
}

type RunbookExecutionResult struct {
	ExecutionID string    `json:"execution_id"`
	IncidentID  string    `json:"incident_id"`
	RunbookID   string    `json:"runbook_id"`
	Status      string    `json:"status"`
	ExecutedAt  time.Time `json:"executed_at"`
	Message     string    `json:"message"`
}

// Engine errors and interfaces

var (
	ErrInvalidStateTransition = errors.New("transición de estado no permitida")
	ErrIncidentNotFound       = errors.New("incidente no encontrado")
)

// AlertDeduplicator evaluates if an incoming alert belongs to an existing active incident.
type AlertDeduplicator interface {
	Deduplicate(ctx context.Context, alert AnomalyAlert) (isDuplicate bool, existingIncidentID string, err error)
}

// StateMachine manages valid state transitions for an IncidentRecord.
type StateMachine interface {
	TransitionState(ctx context.Context, incidentID string, targetStatus IncidentStatus) (*IncidentRecord, error)
	EscalateSeverity(ctx context.Context, incidentID string, newSeverity Severity) (*IncidentRecord, error)
}

// OrchestratorEngine orchestrates the full pipeline of received alerts.
type OrchestratorEngine interface {
	ProcessAlert(ctx context.Context, alert AnomalyAlert) (*IncidentRecord, error)
	GetActiveIncident(ctx context.Context, service string) (*IncidentRecord, error)
}
