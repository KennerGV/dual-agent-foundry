package engine

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// Engine is a thread-safe incident orchestrator engine, state machine, and deduplicator.
type Engine struct {
	mu            sync.RWMutex
	incidents     map[string]*IncidentRecord // incidentID -> IncidentRecord
	activeService map[string]string         // service -> active incidentID
	idCounter     uint64
}

// NewEngine constructs a new Engine instance.
func NewEngine() *Engine {
	return &Engine{
		incidents:     make(map[string]*IncidentRecord),
		activeService: make(map[string]string),
	}
}

// Deduplicate checks whether an incoming alert belongs to an active incident for the source service.
func (e *Engine) Deduplicate(ctx context.Context, alert AnomalyAlert) (bool, string, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	incidentID, found := e.activeService[alert.SourceService]
	if !found {
		return false, "", nil
	}

	inc, exists := e.incidents[incidentID]
	if !exists {
		return false, "", nil
	}

	if inc.Status == StatusOpen || inc.Status == StatusMitigating {
		return true, inc.IncidentID, nil
	}

	return false, "", nil
}

// TransitionState manages valid state transitions for an IncidentRecord.
func (e *Engine) TransitionState(ctx context.Context, incidentID string, targetStatus IncidentStatus) (*IncidentRecord, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	inc, exists := e.incidents[incidentID]
	if !exists {
		return nil, ErrIncidentNotFound
	}

	if !isValidTransition(inc.Status, targetStatus) {
		return nil, ErrInvalidStateTransition
	}

	inc.Status = targetStatus
	inc.UpdatedAtUTC = time.Now().UTC()

	// If resolved or closed, remove from activeService mapping
	if targetStatus == StatusResolved || targetStatus == StatusClosed {
		if activeID, found := e.activeService[inc.Service]; found && activeID == incidentID {
			delete(e.activeService, inc.Service)
		}
	} else if targetStatus == StatusOpen || targetStatus == StatusMitigating {
		e.activeService[inc.Service] = incidentID
	}

	recordCopy := *inc
	return &recordCopy, nil
}

// EscalateSeverity updates severity if valid. Higher rank takes precedence or valid update.
func (e *Engine) EscalateSeverity(ctx context.Context, incidentID string, newSeverity Severity) (*IncidentRecord, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	inc, exists := e.incidents[incidentID]
	if !exists {
		return nil, ErrIncidentNotFound
	}

	if !isValidSeverity(newSeverity) {
		return nil, fmt.Errorf("severidad no válida: %s", newSeverity)
	}

	// Update severity if higher or different
	if severityRank(newSeverity) >= severityRank(inc.Severity) {
		inc.Severity = newSeverity
		inc.UpdatedAtUTC = time.Now().UTC()
	}

	recordCopy := *inc
	return &recordCopy, nil
}

// ProcessAlert orchestrates incoming alert deduplication and incident creation/updating.
func (e *Engine) ProcessAlert(ctx context.Context, alert AnomalyAlert) (*IncidentRecord, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Check for active incident for the service
	if activeID, found := e.activeService[alert.SourceService]; found {
		if inc, exists := e.incidents[activeID]; exists && (inc.Status == StatusOpen || inc.Status == StatusMitigating) {
			inc.DeduplicatedAlertsCount++
			inc.UpdatedAtUTC = time.Now().UTC()

			// Escalate severity if recommended severity is higher
			if isValidSeverity(alert.RecommendedSeverity) && severityRank(alert.RecommendedSeverity) > severityRank(inc.Severity) {
				inc.Severity = alert.RecommendedSeverity
			}

			recordCopy := *inc
			return &recordCopy, nil
		}
	}

	// Create new incident
	seq := atomic.AddUint64(&e.idCounter, 1)
	now := time.Now().UTC()
	sev := alert.RecommendedSeverity
	if !isValidSeverity(sev) {
		sev = SeveritySev3
	}

	incID := fmt.Sprintf("inc_%d_%04d", now.Unix(), seq)
	inc := &IncidentRecord{
		IncidentID:              incID,
		Status:                  StatusOpen,
		Severity:                sev,
		Service:                 alert.SourceService,
		DeduplicatedAlertsCount: 1,
		OpenedAtUTC:             now,
		UpdatedAtUTC:            now,
	}

	e.incidents[incID] = inc
	e.activeService[alert.SourceService] = incID

	recordCopy := *inc
	return &recordCopy, nil
}

// GetActiveIncident returns the active incident for a service if present.
func (e *Engine) GetActiveIncident(ctx context.Context, service string) (*IncidentRecord, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	activeID, found := e.activeService[service]
	if !found {
		return nil, ErrIncidentNotFound
	}

	inc, exists := e.incidents[activeID]
	if !exists || (inc.Status != StatusOpen && inc.Status != StatusMitigating) {
		return nil, ErrIncidentNotFound
	}

	recordCopy := *inc
	return &recordCopy, nil
}

// Helpers for state transitions and severity ranks

func isValidTransition(from, to IncidentStatus) bool {
	if from == to {
		return false
	}

	switch from {
	case StatusOpen:
		return to == StatusMitigating || to == StatusResolved || to == StatusClosed
	case StatusMitigating:
		return to == StatusResolved || to == StatusClosed
	case StatusResolved:
		return to == StatusClosed || to == StatusOpen
	case StatusClosed:
		return false // Closed is a terminal state
	default:
		return false
	}
}

func isValidSeverity(s Severity) bool {
	return s == SeveritySev1 || s == SeveritySev2 || s == SeveritySev3
}

func severityRank(s Severity) int {
	switch s {
	case SeveritySev1:
		return 3
	case SeveritySev2:
		return 2
	case SeveritySev3:
		return 1
	default:
		return 0
	}
}

// Ensure interface implementations
var (
	_ AlertDeduplicator  = (*Engine)(nil)
	_ StateMachine       = (*Engine)(nil)
	_ OrchestratorEngine = (*Engine)(nil)
)
