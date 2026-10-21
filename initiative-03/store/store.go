package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("recurso no encontrado en store")
	ErrAlreadyExists = errors.New("incidente ya existente con esa ID")
)

type Severity string

const (
	SeveritySev1 Severity = "SEV-1"
	SeveritySev2 Severity = "SEV-2"
	SeveritySev3 Severity = "SEV-3"
)

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

type StoreFilter struct {
	Service string
	Status  IncidentStatus
	Limit   int
	Offset  int
}

// IncidentRepository abstrae el almacenamiento y consulta de incidentes.
type IncidentRepository interface {
	Create(ctx context.Context, incident *IncidentRecord) error
	GetByID(ctx context.Context, incidentID string) (*IncidentRecord, error)
	Update(ctx context.Context, incident *IncidentRecord) error
	List(ctx context.Context, filter StoreFilter) ([]*IncidentRecord, error)
}

// AuditLogger proporciona almacenamiento de solo apéndice (append-only) para auditoría.
type AuditLogger interface {
	AppendAudit(ctx context.Context, event IncidentAuditEvent) error
	GetAuditLogs(ctx context.Context, incidentID string) ([]IncidentAuditEvent, error)
}
