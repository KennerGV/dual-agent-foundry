package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"initiative-03/api"
	"initiative-03/engine"
	"initiative-03/store"
)

// EngineAdapter bridges engine.Engine to api.OrchestratorEngine
type EngineAdapter struct {
	Engine *engine.Engine
	Store  *store.MemoryStore
}

func (a *EngineAdapter) ProcessAlert(ctx context.Context, alert api.AnomalyAlert) (*api.IncidentRecord, error) {
	engAlert := engine.AnomalyAlert{
		AlertID:             alert.AlertID,
		DetectedAtUTC:       alert.DetectedAtUTC,
		SourceEventIDs:      alert.SourceEventIDs,
		SourceService:       alert.SourceService,
		AnomalyType:         alert.AnomalyType,
		ZScore:              alert.ZScore,
		Confidence:          alert.Confidence,
		RecommendedSeverity: engine.Severity(alert.RecommendedSeverity),
	}

	engInc, err := a.Engine.ProcessAlert(ctx, engAlert)
	if err != nil {
		return nil, err
	}

	apiInc := convertEngineIncidentToAPI(engInc)

	if a.Store != nil {
		stInc := convertAPIIncidentToStore(apiInc)
		_ = a.Store.Create(ctx, stInc)
		_ = a.Store.Update(ctx, stInc)
		_ = a.Store.AppendAudit(ctx, store.IncidentAuditEvent{
			EventID:      fmt.Sprintf("audit_alert_%s_%d", alert.AlertID, time.Now().UnixNano()),
			IncidentID:   engInc.IncidentID,
			EventType:    store.AuditAlertIngested,
			TimestampUTC: time.Now().UTC(),
			Details:      fmt.Sprintf("Alert %s ingested for service %s", alert.AlertID, alert.SourceService),
			Actor:        "alert_ingestor",
		})
	}

	return apiInc, nil
}

func (a *EngineAdapter) GetActiveIncident(ctx context.Context, service string) (*api.IncidentRecord, error) {
	engInc, err := a.Engine.GetActiveIncident(ctx, service)
	if err != nil {
		return nil, err
	}
	return convertEngineIncidentToAPI(engInc), nil
}

// StoreAdapter bridges store.MemoryStore to api.IncidentRepository
type StoreAdapter struct {
	Store *store.MemoryStore
}

func (s *StoreAdapter) Create(ctx context.Context, incident *api.IncidentRecord) error {
	stInc := convertAPIIncidentToStore(incident)
	return s.Store.Create(ctx, stInc)
}

func (s *StoreAdapter) GetByID(ctx context.Context, incidentID string) (*api.IncidentRecord, error) {
	stInc, err := s.Store.GetByID(ctx, incidentID)
	if err != nil {
		return nil, err
	}
	return convertStoreIncidentToAPI(stInc), nil
}

func (s *StoreAdapter) Update(ctx context.Context, incident *api.IncidentRecord) error {
	stInc := convertAPIIncidentToStore(incident)
	return s.Store.Update(ctx, stInc)
}

func (s *StoreAdapter) List(ctx context.Context, filter api.StoreFilter) ([]*api.IncidentRecord, error) {
	stFilter := store.StoreFilter{
		Service: filter.Service,
		Status:  store.IncidentStatus(filter.Status),
		Limit:   filter.Limit,
		Offset:  filter.Offset,
	}
	stList, err := s.Store.List(ctx, stFilter)
	if err != nil {
		return nil, err
	}
	res := make([]*api.IncidentRecord, len(stList))
	for i, st := range stList {
		res[i] = convertStoreIncidentToAPI(st)
	}
	return res, nil
}

type IntegrationRunbookTrigger struct {
	Engine *engine.Engine
	Store  *store.MemoryStore
}

func (t *IntegrationRunbookTrigger) ExecuteRunbook(ctx context.Context, req api.RunbookExecutionRequest) (*api.RunbookExecutionResult, error) {
	now := time.Now().UTC()
	result := &api.RunbookExecutionResult{
		ExecutionID: fmt.Sprintf("exec_%d", now.UnixNano()),
		IncidentID:  req.IncidentID,
		RunbookID:   req.RunbookID,
		Status:      "SUCCESS",
		ExecutedAt:  now,
		Message:     fmt.Sprintf("Runbook %s executed for incident %s", req.RunbookID, req.IncidentID),
	}

	if t.Engine != nil {
		_, _ = t.Engine.TransitionState(ctx, req.IncidentID, engine.StatusMitigating)
	}

	if t.Store != nil {
		stInc, err := t.Store.GetByID(ctx, req.IncidentID)
		if err == nil && stInc != nil {
			stInc.Status = store.StatusMitigating
			stInc.ActiveRunbook = req.RunbookID
			stInc.UpdatedAtUTC = now
			_ = t.Store.Update(ctx, stInc)
			_ = t.Store.AppendAudit(ctx, store.IncidentAuditEvent{
				EventID:      fmt.Sprintf("audit_rb_%d", now.UnixNano()),
				IncidentID:   req.IncidentID,
				EventType:    store.AuditRunbookTriggered,
				TimestampUTC: now,
				Details:      fmt.Sprintf("Runbook %s triggered by %s", req.RunbookID, req.TriggeredBy),
				Actor:        req.TriggeredBy,
			})
		}
	}

	return result, nil
}

func convertEngineIncidentToAPI(inc *engine.IncidentRecord) *api.IncidentRecord {
	if inc == nil {
		return nil
	}
	return &api.IncidentRecord{
		IncidentID:              inc.IncidentID,
		Status:                  api.IncidentStatus(inc.Status),
		Severity:                api.Severity(inc.Severity),
		Service:                 inc.Service,
		DeduplicatedAlertsCount: inc.DeduplicatedAlertsCount,
		ActiveRunbook:           inc.ActiveRunbook,
		OpenedAtUTC:             inc.OpenedAtUTC,
		UpdatedAtUTC:            inc.UpdatedAtUTC,
	}
}

func convertAPIIncidentToStore(inc *api.IncidentRecord) *store.IncidentRecord {
	if inc == nil {
		return nil
	}
	return &store.IncidentRecord{
		IncidentID:              inc.IncidentID,
		Status:                  store.IncidentStatus(inc.Status),
		Severity:                store.Severity(inc.Severity),
		Service:                 inc.Service,
		DeduplicatedAlertsCount: inc.DeduplicatedAlertsCount,
		ActiveRunbook:           inc.ActiveRunbook,
		OpenedAtUTC:             inc.OpenedAtUTC,
		UpdatedAtUTC:            inc.UpdatedAtUTC,
	}
}

func convertStoreIncidentToAPI(inc *store.IncidentRecord) *api.IncidentRecord {
	if inc == nil {
		return nil
	}
	return &api.IncidentRecord{
		IncidentID:              inc.IncidentID,
		Status:                  api.IncidentStatus(inc.Status),
		Severity:                api.Severity(inc.Severity),
		Service:                 inc.Service,
		DeduplicatedAlertsCount: inc.DeduplicatedAlertsCount,
		ActiveRunbook:           inc.ActiveRunbook,
		OpenedAtUTC:             inc.OpenedAtUTC,
		UpdatedAtUTC:            inc.UpdatedAtUTC,
	}
}

func TestEndToEndLifecycleAndAuditIntegration(t *testing.T) {
	ctx := context.Background()
	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()

	engAdapter := &EngineAdapter{Engine: eng, Store: memStore}
	storeAdapter := &StoreAdapter{Store: memStore}
	trigger := &IntegrationRunbookTrigger{Engine: eng, Store: memStore}

	handler := api.NewHandler(engAdapter, storeAdapter, trigger)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Ingest alert -> creating new incident
	alert1 := api.AnomalyAlert{
		AlertID:             "alt_e2e_001",
		DetectedAtUTC:       time.Now().UTC(),
		SourceEventIDs:      []string{"evt_101"},
		SourceService:       "order-service",
		AnomalyType:         "LATENCY_SPIKE",
		ZScore:              3.8,
		Confidence:          0.91,
		RecommendedSeverity: api.SeveritySev3,
	}
	b1, _ := json.Marshal(alert1)
	resp1, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b1))
	if err != nil {
		t.Fatalf("failed to post alert1: %v", err)
	}
	defer resp1.Body.Close()

	if resp1.StatusCode != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d", resp1.StatusCode)
	}

	var inc1 api.IncidentRecord
	if err := json.NewDecoder(resp1.Body).Decode(&inc1); err != nil {
		t.Fatalf("failed to decode incident response: %v", err)
	}

	if inc1.Service != "order-service" || inc1.Status != api.StatusOpen || inc1.DeduplicatedAlertsCount != 1 {
		t.Errorf("unexpected incident record: %+v", inc1)
	}

	// 2. Ingest higher severity alert for same service -> deduplication & severity escalation
	alert2 := api.AnomalyAlert{
		AlertID:             "alt_e2e_002",
		DetectedAtUTC:       time.Now().UTC(),
		SourceEventIDs:      []string{"evt_102"},
		SourceService:       "order-service",
		AnomalyType:         "ERROR_SURGE",
		ZScore:              5.1,
		Confidence:          0.97,
		RecommendedSeverity: api.SeveritySev1,
	}
	b2, _ := json.Marshal(alert2)
	resp2, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b2))
	if err != nil {
		t.Fatalf("failed to post alert2: %v", err)
	}
	defer resp2.Body.Close()

	var inc2 api.IncidentRecord
	_ = json.NewDecoder(resp2.Body).Decode(&inc2)

	if inc2.IncidentID != inc1.IncidentID {
		t.Errorf("expected same incident ID %s, got %s", inc1.IncidentID, inc2.IncidentID)
	}
	if inc2.DeduplicatedAlertsCount != 2 {
		t.Errorf("expected alert count 2, got %d", inc2.DeduplicatedAlertsCount)
	}
	if inc2.Severity != api.SeveritySev1 {
		t.Errorf("expected escalated severity SEV-1, got %s", inc2.Severity)
	}

	// 3. Trigger Runbook -> status MITIGATING
	rbReq := api.RunbookExecutionRequest{
		IncidentID:  inc1.IncidentID,
		RunbookID:   "rb_scale_order_pods",
		TriggeredBy: "auto_scaler",
	}
	rbBody, _ := json.Marshal(rbReq)
	rbResp, err := http.Post(ts.URL+fmt.Sprintf("/v1/incidents/%s/runbook", inc1.IncidentID), "application/json", bytes.NewBuffer(rbBody))
	if err != nil {
		t.Fatalf("failed to trigger runbook: %v", err)
	}
	defer rbResp.Body.Close()

	if rbResp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rbResp.StatusCode)
	}

	// 4. State Machine Transitions through Engine directly and verify in Store
	_, err = eng.TransitionState(ctx, inc1.IncidentID, engine.StatusResolved)
	if err != nil {
		t.Fatalf("failed to transition to RESOLVED: %v", err)
	}

	stInc, err := memStore.GetByID(ctx, inc1.IncidentID)
	if err != nil {
		t.Fatalf("store GetByID failed: %v", err)
	}
	stInc.Status = store.StatusResolved
	_ = memStore.Update(ctx, stInc)

	_, err = eng.TransitionState(ctx, inc1.IncidentID, engine.StatusClosed)
	if err != nil {
		t.Fatalf("failed to transition to CLOSED: %v", err)
	}
	stInc.Status = store.StatusClosed
	_ = memStore.Update(ctx, stInc)

	// Verify terminal state: CLOSED -> OPEN should fail
	_, err = eng.TransitionState(ctx, inc1.IncidentID, engine.StatusOpen)
	if err != engine.ErrInvalidStateTransition {
		t.Errorf("expected ErrInvalidStateTransition from CLOSED, got %v", err)
	}

	// 5. Verify Immutable Audit Logs
	audits, err := memStore.GetAuditLogs(ctx, inc1.IncidentID)
	if err != nil {
		t.Fatalf("failed to get audit logs: %v", err)
	}
	if len(audits) < 3 {
		t.Errorf("expected at least 3 audit log entries, got %d", len(audits))
	}

	// 6. Test Store Listing and Filtering
	incList, err := storeAdapter.List(ctx, api.StoreFilter{
		Service: "order-service",
		Status:  api.StatusClosed,
		Limit:   10,
	})
	if err != nil {
		t.Fatalf("failed to list store incidents: %v", err)
	}
	if len(incList) != 1 || incList[0].IncidentID != inc1.IncidentID {
		t.Errorf("unexpected store list result: %+v", incList)
	}
}
