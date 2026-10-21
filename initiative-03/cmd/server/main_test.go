package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"initiative-03/api"
	"initiative-03/engine"
	"initiative-03/store"
)

func TestEngineAdapter(t *testing.T) {
	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()
	adapter := &EngineAdapter{Engine: eng, Store: memStore}

	alert := api.AnomalyAlert{
		AlertID:             "alt_test_01",
		DetectedAtUTC:       time.Now().UTC(),
		SourceEventIDs:      []string{"evt_1", "evt_2"},
		SourceService:       "test-service",
		AnomalyType:         "LATENCY_SPIKE",
		ZScore:              3.5,
		Confidence:          0.95,
		RecommendedSeverity: api.SeveritySev1,
	}

	// Test ProcessAlert
	inc, err := adapter.ProcessAlert(context.Background(), alert)
	if err != nil {
		t.Fatalf("unexpected error processing alert: %v", err)
	}
	if inc.Service != "test-service" {
		t.Errorf("expected service 'test-service', got '%s'", inc.Service)
	}
	if inc.Severity != api.SeveritySev1 {
		t.Errorf("expected severity SEV-1, got '%s'", inc.Severity)
	}
	if inc.ActiveRunbook == "" {
		t.Errorf("expected active runbook to be set")
	}

	// Verify it was saved in store
	stInc, err := memStore.GetByID(context.Background(), inc.IncidentID)
	if err != nil || stInc == nil {
		t.Fatalf("expected incident in store, got error: %v", err)
	}

	// Test GetActiveIncident
	active, err := adapter.GetActiveIncident(context.Background(), "test-service")
	if err != nil {
		t.Fatalf("unexpected error getting active incident: %v", err)
	}
	if active.IncidentID != inc.IncidentID {
		t.Errorf("expected incident ID %s, got %s", inc.IncidentID, active.IncidentID)
	}

	// Process another alert for same service to trigger update branch in ProcessAlert store logic
	alert2 := api.AnomalyAlert{
		AlertID:             "alt_test_02",
		DetectedAtUTC:       time.Now().UTC(),
		SourceService:       "test-service",
		AnomalyType:         "ERROR_RATE_HIGH",
		ZScore:              4.1,
		Confidence:          0.99,
		RecommendedSeverity: api.SeveritySev1,
	}
	inc2, err := adapter.ProcessAlert(context.Background(), alert2)
	if err != nil {
		t.Fatalf("unexpected error processing second alert: %v", err)
	}
	if inc2.DeduplicatedAlertsCount <= 1 {
		t.Errorf("expected deduplicated alerts count > 1, got %d", inc2.DeduplicatedAlertsCount)
	}
}

func TestStoreAdapter(t *testing.T) {
	memStore := store.NewMemoryStore()
	adapter := &StoreAdapter{Store: memStore}
	ctx := context.Background()

	now := time.Now().UTC()
	inc := &api.IncidentRecord{
		IncidentID:              "inc_store_test",
		Status:                  api.StatusOpen,
		Severity:                api.SeveritySev2,
		Service:                 "auth-service",
		DeduplicatedAlertsCount: 1,
		ActiveRunbook:           "rb_restart",
		OpenedAtUTC:             now,
		UpdatedAtUTC:            now,
	}

	// Create
	if err := adapter.Create(ctx, inc); err != nil {
		t.Fatalf("unexpected error creating incident: %v", err)
	}

	// GetByID
	fetched, err := adapter.GetByID(ctx, "inc_store_test")
	if err != nil {
		t.Fatalf("unexpected error getting incident: %v", err)
	}
	if fetched.Service != "auth-service" {
		t.Errorf("expected service auth-service, got %s", fetched.Service)
	}

	// Update
	fetched.Status = api.StatusMitigating
	if err := adapter.Update(ctx, fetched); err != nil {
		t.Fatalf("unexpected error updating incident: %v", err)
	}

	// List
	list, err := adapter.List(ctx, api.StoreFilter{Service: "auth-service", Limit: 10})
	if err != nil {
		t.Fatalf("unexpected error listing incidents: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 incident, got %d", len(list))
	}
	if list[0].Status != api.StatusMitigating {
		t.Errorf("expected status MITIGATING, got %s", list[0].Status)
	}
}

func TestRunbookRunner(t *testing.T) {
	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()
	runner := &RunbookRunner{Engine: eng, Store: memStore}
	ctx := context.Background()

	// First create an active incident in engine and store
	alert := engine.AnomalyAlert{
		AlertID:             "alt_rb_01",
		SourceService:       "billing-service",
		RecommendedSeverity: engine.SeveritySev1,
	}
	engInc, err := eng.ProcessAlert(ctx, alert)
	if err != nil {
		t.Fatalf("failed to process alert: %v", err)
	}

	now := time.Now().UTC()
	_ = memStore.Create(ctx, &store.IncidentRecord{
		IncidentID:    engInc.IncidentID,
		Status:        store.StatusOpen,
		Severity:      store.SeveritySev1,
		Service:       "billing-service",
		ActiveRunbook: "rb_initial",
		OpenedAtUTC:   now,
		UpdatedAtUTC:  now,
	})

	// Execute Runbook 1st time (transition Open -> Mitigating)
	req := api.RunbookExecutionRequest{
		IncidentID:  engInc.IncidentID,
		RunbookID:   "rb_scale_up",
		TriggeredBy: "auto-remediator",
	}
	res, err := runner.ExecuteRunbook(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error executing runbook: %v", err)
	}
	if res.Status != "SUCCESS" {
		t.Errorf("expected status SUCCESS, got %s", res.Status)
	}

	// Verify store was updated to StatusMitigating
	stInc, err := memStore.GetByID(ctx, engInc.IncidentID)
	if err != nil || stInc.Status != store.StatusMitigating {
		t.Errorf("expected store status MITIGATING, got %v, err: %v", stInc.Status, err)
	}

	// Execute Runbook 2nd time (transition Mitigating -> Resolved)
	_, err = runner.ExecuteRunbook(ctx, req)
	if err != nil {
		t.Fatalf("unexpected error on second runbook execution: %v", err)
	}
	stInc, err = memStore.GetByID(ctx, engInc.IncidentID)
	if err != nil || stInc.Status != store.StatusResolved {
		t.Errorf("expected store status RESOLVED, got %v, err: %v", stInc.Status, err)
	}
}

func TestServerHTTPHandlerIntegration(t *testing.T) {
	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()

	handler := api.NewHandler(
		&EngineAdapter{Engine: eng, Store: memStore},
		&StoreAdapter{Store: memStore},
		&RunbookRunner{Engine: eng, Store: memStore},
	)

	server := httptest.NewServer(handler)
	defer server.Close()

	client := server.Client()

	// 1. GET /healthz
	resp, err := client.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("healthcheck request failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected HTTP 200 healthz, got %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// 2. POST /v1/alerts
	alertReq := api.AnomalyAlert{
		AlertID:             "alt_http_01",
		DetectedAtUTC:       time.Now().UTC(),
		SourceService:       "cart-service",
		AnomalyType:         "HIGH_MEMORY",
		ZScore:              3.2,
		Confidence:          0.91,
		RecommendedSeverity: api.SeveritySev2,
	}
	body, _ := json.Marshal(alertReq)
	resp, err = client.Post(server.URL+"/v1/alerts", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("ingest alert failed: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("expected HTTP 202, got %d", resp.StatusCode)
	}
	var createdInc api.IncidentRecord
	if err := json.NewDecoder(resp.Body).Decode(&createdInc); err != nil {
		t.Fatalf("failed decoding created incident: %v", err)
	}
	_ = resp.Body.Close()

	// 3. GET /v1/incidents
	resp, err = client.Get(server.URL + "/v1/incidents?service=cart-service")
	if err != nil {
		t.Fatalf("list incidents failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}
	var incidents []*api.IncidentRecord
	if err := json.NewDecoder(resp.Body).Decode(&incidents); err != nil {
		t.Fatalf("failed decoding incident list: %v", err)
	}
	_ = resp.Body.Close()
	if len(incidents) != 1 {
		t.Fatalf("expected 1 incident listed, got %d", len(incidents))
	}

	// 4. GET /v1/incidents/{id}
	resp, err = client.Get(server.URL + "/v1/incidents/" + createdInc.IncidentID)
	if err != nil {
		t.Fatalf("get incident failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}
	var singleInc api.IncidentRecord
	if err := json.NewDecoder(resp.Body).Decode(&singleInc); err != nil {
		t.Fatalf("failed decoding single incident: %v", err)
	}
	_ = resp.Body.Close()
	if singleInc.IncidentID != createdInc.IncidentID {
		t.Errorf("expected incident ID %s, got %s", createdInc.IncidentID, singleInc.IncidentID)
	}

	// 5. POST /v1/incidents/{id}/runbook
	rbReq := api.RunbookExecutionRequest{
		RunbookID:   "rb_clear_cache",
		TriggeredBy: "admin",
	}
	rbBody, _ := json.Marshal(rbReq)
	resp, err = client.Post(server.URL+"/v1/incidents/"+createdInc.IncidentID+"/runbook", "application/json", bytes.NewReader(rbBody))
	if err != nil {
		t.Fatalf("trigger runbook failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}
	var rbRes api.RunbookExecutionResult
	if err := json.NewDecoder(resp.Body).Decode(&rbRes); err != nil {
		t.Fatalf("failed decoding runbook response: %v", err)
	}
	_ = resp.Body.Close()
	if rbRes.Status != "SUCCESS" {
		t.Errorf("expected runbook execution SUCCESS, got %s", rbRes.Status)
	}
}
