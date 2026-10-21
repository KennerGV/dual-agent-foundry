package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrNotFound      = errors.New("incident not found")
	ErrAlreadyExists = errors.New("incident already exists")
)

type RunbookTrigger interface {
	ExecuteRunbook(ctx context.Context, req RunbookExecutionRequest) (*RunbookExecutionResult, error)
}

type OrchestratorEngine interface {
	ProcessAlert(ctx context.Context, alert AnomalyAlert) (*IncidentRecord, error)
	GetActiveIncident(ctx context.Context, service string) (*IncidentRecord, error)
}

type IncidentRepository interface {
	Create(ctx context.Context, incident *IncidentRecord) error
	GetByID(ctx context.Context, incidentID string) (*IncidentRecord, error)
	Update(ctx context.Context, incident *IncidentRecord) error
	List(ctx context.Context, filter StoreFilter) ([]*IncidentRecord, error)
}

type HTTPHandler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
	HandleIngestAlert(w http.ResponseWriter, r *http.Request)
	HandleGetIncident(w http.ResponseWriter, r *http.Request)
	HandleListIncidents(w http.ResponseWriter, r *http.Request)
	HandleTriggerRunbook(w http.ResponseWriter, r *http.Request)
	HandleHealthCheck(w http.ResponseWriter, r *http.Request)
}

type Handler struct {
	mux            *http.ServeMux
	engine         OrchestratorEngine
	repo           IncidentRepository
	runbookTrigger RunbookTrigger
	fallbackMu     sync.RWMutex
	fallbackStore  map[string]*IncidentRecord
}

func NewHandler(engine OrchestratorEngine, repo IncidentRepository, trigger RunbookTrigger) *Handler {
	h := &Handler{
		mux:            http.NewServeMux(),
		engine:         engine,
		repo:           repo,
		runbookTrigger: trigger,
		fallbackStore:  make(map[string]*IncidentRecord),
	}

	h.mux.HandleFunc("POST /v1/alerts", h.HandleIngestAlert)
	h.mux.HandleFunc("GET /v1/incidents", h.HandleListIncidents)
	h.mux.HandleFunc("GET /v1/incidents/{id}", h.HandleGetIncident)
	h.mux.HandleFunc("POST /v1/incidents/{id}/runbook", h.HandleTriggerRunbook)
	h.mux.HandleFunc("GET /healthz", h.HandleHealthCheck)

	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) HandleIngestAlert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var alert AnomalyAlert
	if err := json.NewDecoder(r.Body).Decode(&alert); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	if alert.AlertID == "" || alert.SourceService == "" {
		writeJSONError(w, http.StatusBadRequest, "alert_id and source_service are required")
		return
	}

	var incident *IncidentRecord
	var err error

	if h.engine != nil {
		incident, err = h.engine.ProcessAlert(r.Context(), alert)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to process alert: %v", err))
			return
		}
	} else {
		now := time.Now().UTC()
		severity := alert.RecommendedSeverity
		if severity == "" {
			severity = SeveritySev2
		}
		incID := fmt.Sprintf("inc_%s", alert.AlertID)

		h.fallbackMu.Lock()
		if existing, ok := h.fallbackStore[incID]; ok {
			existing.DeduplicatedAlertsCount++
			existing.UpdatedAtUTC = now
			incident = existing
		} else {
			incident = &IncidentRecord{
				IncidentID:              incID,
				Status:                  StatusOpen,
				Severity:                severity,
				Service:                 alert.SourceService,
				DeduplicatedAlertsCount: 1,
				OpenedAtUTC:             now,
				UpdatedAtUTC:            now,
			}
			h.fallbackStore[incID] = incident
		}
		h.fallbackMu.Unlock()

		if h.repo != nil {
			_ = h.repo.Create(r.Context(), incident)
		}
	}

	writeJSONResponse(w, http.StatusAccepted, incident)
}

func (h *Handler) HandleListIncidents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	q := r.URL.Query()
	service := q.Get("service")
	status := IncidentStatus(q.Get("status"))

	limit := 10
	if lStr := q.Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if oStr := q.Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	var results []*IncidentRecord

	if h.repo != nil {
		var err error
		results, err = h.repo.List(r.Context(), StoreFilter{
			Service: service,
			Status:  status,
			Limit:   limit,
			Offset:  offset,
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list incidents: %v", err))
			return
		}
	} else {
		h.fallbackMu.RLock()
		for _, inc := range h.fallbackStore {
			if service != "" && inc.Service != service {
				continue
			}
			if status != "" && inc.Status != status {
				continue
			}
			results = append(results, inc)
		}
		h.fallbackMu.RUnlock()

		if offset < len(results) {
			results = results[offset:]
		} else {
			results = []*IncidentRecord{}
		}

		if len(results) > limit {
			results = results[:limit]
		}
	}

	if results == nil {
		results = []*IncidentRecord{}
	}

	writeJSONResponse(w, http.StatusOK, results)
}

func (h *Handler) HandleGetIncident(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id := extractIncidentID(r)
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "incident ID is required")
		return
	}

	var incident *IncidentRecord
	var err error

	if h.repo != nil {
		incident, err = h.repo.GetByID(r.Context(), id)
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "incident not found")
			return
		}
	} else {
		h.fallbackMu.RLock()
		inc, ok := h.fallbackStore[id]
		h.fallbackMu.RUnlock()

		if !ok {
			writeJSONError(w, http.StatusNotFound, "incident not found")
			return
		}
		incident = inc
	}

	writeJSONResponse(w, http.StatusOK, incident)
}

func (h *Handler) HandleTriggerRunbook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id := extractIncidentID(r)

	var req RunbookExecutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	if req.IncidentID == "" {
		req.IncidentID = id
	}

	if req.RunbookID == "" || req.IncidentID == "" {
		writeJSONError(w, http.StatusBadRequest, "runbook_id and incident_id are required")
		return
	}

	var result *RunbookExecutionResult
	var err error

	if h.runbookTrigger != nil {
		result, err = h.runbookTrigger.ExecuteRunbook(r.Context(), req)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, fmt.Sprintf("failed to execute runbook: %v", err))
			return
		}
	} else {
		now := time.Now().UTC()
		result = &RunbookExecutionResult{
			ExecutionID: fmt.Sprintf("exec_%d", now.UnixNano()),
			IncidentID:  req.IncidentID,
			RunbookID:   req.RunbookID,
			Status:      "EXECUTING",
			ExecutedAt:  now,
			Message:     fmt.Sprintf("Runbook %s triggered successfully for incident %s", req.RunbookID, req.IncidentID),
		}

		h.fallbackMu.Lock()
		if inc, ok := h.fallbackStore[req.IncidentID]; ok {
			inc.Status = StatusMitigating
			inc.ActiveRunbook = req.RunbookID
			inc.UpdatedAtUTC = now
		}
		h.fallbackMu.Unlock()
	}

	writeJSONResponse(w, http.StatusOK, result)
}

func (h *Handler) HandleHealthCheck(w http.ResponseWriter, r *http.Request) {
	resp := map[string]string{
		"status":  "ok",
		"service": "incident-orchestrator",
	}
	writeJSONResponse(w, http.StatusOK, resp)
}

func extractIncidentID(r *http.Request) string {
	if id := r.PathValue("id"); id != "" {
		return id
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/incidents/")
	parts := strings.Split(path, "/")
	if len(parts) > 0 && parts[0] != "" {
		return parts[0]
	}
	return ""
}

func writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
