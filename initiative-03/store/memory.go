package store

import (
	"context"
	"sync"
)

// MemoryStore proporciona una implementación thread-safe en memoria
// de IncidentRepository y AuditLogger.
type MemoryStore struct {
	mu        sync.RWMutex
	incidents map[string]*IncidentRecord
	order     []string
	auditLogs map[string][]IncidentAuditEvent
}

// NewMemoryStore crea e inicializa una nueva instancia de MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		incidents: make(map[string]*IncidentRecord),
		order:     make([]string, 0),
		auditLogs: make(map[string][]IncidentAuditEvent),
	}
}

func cloneIncident(rec *IncidentRecord) *IncidentRecord {
	if rec == nil {
		return nil
	}
	cp := *rec
	return &cp
}

func (s *MemoryStore) Create(ctx context.Context, incident *IncidentRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if incident == nil || incident.IncidentID == "" {
		return ErrAlreadyExists
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.incidents[incident.IncidentID]; exists {
		return ErrAlreadyExists
	}

	s.incidents[incident.IncidentID] = cloneIncident(incident)
	s.order = append(s.order, incident.IncidentID)
	return nil
}

func (s *MemoryStore) GetByID(ctx context.Context, incidentID string) (*IncidentRecord, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	rec, exists := s.incidents[incidentID]
	if !exists {
		return nil, ErrNotFound
	}

	return cloneIncident(rec), nil
}

func (s *MemoryStore) Update(ctx context.Context, incident *IncidentRecord) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if incident == nil || incident.IncidentID == "" {
		return ErrNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.incidents[incident.IncidentID]; !exists {
		return ErrNotFound
	}

	s.incidents[incident.IncidentID] = cloneIncident(incident)
	return nil
}

func (s *MemoryStore) List(ctx context.Context, filter StoreFilter) ([]*IncidentRecord, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*IncidentRecord, 0)
	matchedCount := 0

	for _, id := range s.order {
		rec := s.incidents[id]
		if rec == nil {
			continue
		}

		if filter.Service != "" && rec.Service != filter.Service {
			continue
		}
		if filter.Status != "" && rec.Status != filter.Status {
			continue
		}

		if matchedCount < filter.Offset {
			matchedCount++
			continue
		}

		if filter.Limit > 0 && len(result) >= filter.Limit {
			break
		}

		result = append(result, cloneIncident(rec))
		matchedCount++
	}

	return result, nil
}

func (s *MemoryStore) AppendAudit(ctx context.Context, event IncidentAuditEvent) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.auditLogs[event.IncidentID] = append(s.auditLogs[event.IncidentID], event)
	return nil
}

func (s *MemoryStore) GetAuditLogs(ctx context.Context, incidentID string) ([]IncidentAuditEvent, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	logs, exists := s.auditLogs[incidentID]
	if !exists || len(logs) == 0 {
		return []IncidentAuditEvent{}, nil
	}

	cp := make([]IncidentAuditEvent, len(logs))
	copy(cp, logs)
	return cp, nil
}
