package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type mockEngine struct {
	processFunc func(ctx context.Context, alert AnomalyAlert) (*IncidentRecord, error)
}

func (m *mockEngine) ProcessAlert(ctx context.Context, alert AnomalyAlert) (*IncidentRecord, error) {
	if m.processFunc != nil {
		return m.processFunc(ctx, alert)
	}
	return &IncidentRecord{
		IncidentID:              "inc_mock_123",
		Status:                  StatusOpen,
		Severity:                alert.RecommendedSeverity,
		Service:                 alert.SourceService,
		DeduplicatedAlertsCount: 1,
		OpenedAtUTC:             time.Now().UTC(),
		UpdatedAtUTC:            time.Now().UTC(),
	}, nil
}

func (m *mockEngine) GetActiveIncident(ctx context.Context, service string) (*IncidentRecord, error) {
	return nil, nil
}

type mockTrigger struct {
	executeFunc func(ctx context.Context, req RunbookExecutionRequest) (*RunbookExecutionResult, error)
}

func (m *mockTrigger) ExecuteRunbook(ctx context.Context, req RunbookExecutionRequest) (*RunbookExecutionResult, error) {
	if m.executeFunc != nil {
		return m.executeFunc(ctx, req)
	}
	return &RunbookExecutionResult{
		ExecutionID: "exec_mock_456",
		IncidentID:  req.IncidentID,
		RunbookID:   req.RunbookID,
		Status:      "SUCCESS",
		ExecutedAt:  time.Now().UTC(),
		Message:     "Mock runbook executed",
	}, nil
}

func TestHealthCheck(t *testing.T) {
	handler := NewHandler(nil, nil, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/healthz")
	if err != nil {
		t.Fatalf("failed to make request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var data map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	if data["status"] != "ok" || data["service"] != "incident-orchestrator" {
		t.Errorf("unexpected healthz response: %v", data)
	}
}

func TestIngestAlert_ValidAndDuplicate(t *testing.T) {
	handler := NewHandler(nil, nil, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	alertPayload := AnomalyAlert{
		AlertID:             "alt_test_001",
		DetectedAtUTC:       time.Now().UTC(),
		SourceEventIDs:      []string{"evt_1"},
		SourceService:       "payment-gateway-prod",
		AnomalyType:         "LATENCY_SPIKE",
		ZScore:              4.5,
		Confidence:          0.95,
		RecommendedSeverity: SeveritySev1,
	}

	body, _ := json.Marshal(alertPayload)
	resp, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("POST /v1/alerts failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("expected 202 Accepted, got %d", resp.StatusCode)
	}

	var inc IncidentRecord
	if err := json.NewDecoder(resp.Body).Decode(&inc); err != nil {
		t.Fatalf("failed to decode incident record: %v", err)
	}

	if inc.IncidentID != "inc_alt_test_001" {
		t.Errorf("expected IncidentID inc_alt_test_001, got %s", inc.IncidentID)
	}
	if inc.DeduplicatedAlertsCount != 1 {
		t.Errorf("expected DeduplicatedAlertsCount 1, got %d", inc.DeduplicatedAlertsCount)
	}

	// Post same alert again to test deduplication count
	resp2, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("POST /v1/alerts duplicate failed: %v", err)
	}
	defer resp2.Body.Close()

	var inc2 IncidentRecord
	if err := json.NewDecoder(resp2.Body).Decode(&inc2); err != nil {
		t.Fatalf("failed to decode duplicate incident record: %v", err)
	}
	if inc2.DeduplicatedAlertsCount != 2 {
		t.Errorf("expected DeduplicatedAlertsCount 2 on deduplication, got %d", inc2.DeduplicatedAlertsCount)
	}
}

func TestIngestAlert_Invalid(t *testing.T) {
	handler := NewHandler(nil, nil, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	// Malformed JSON
	resp, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBufferString("{invalid_json"))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for malformed JSON, got %d", resp.StatusCode)
	}

	// Missing required fields
	invalidAlert := map[string]string{"confidence": "0.8"}
	body, _ := json.Marshal(invalidAlert)
	resp2, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp2.Body.Close()

	if resp2.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for missing fields, got %d", resp2.StatusCode)
	}
}

func TestGetAndListIncidents(t *testing.T) {
	handler := NewHandler(nil, nil, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Ingest alert for payment service
	alert1 := AnomalyAlert{
		AlertID:             "alt_payment_1",
		SourceService:       "payment-gateway",
		RecommendedSeverity: SeveritySev1,
	}
	b1, _ := json.Marshal(alert1)
	r1, _ := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b1))
	r1.Body.Close()

	// 2. Ingest alert for auth service
	alert2 := AnomalyAlert{
		AlertID:             "alt_auth_1",
		SourceService:       "auth-service",
		RecommendedSeverity: SeveritySev2,
	}
	b2, _ := json.Marshal(alert2)
	r2, _ := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b2))
	r2.Body.Close()

	// 3. GET /v1/incidents/inc_alt_payment_1
	getResp, err := http.Get(ts.URL + "/v1/incidents/inc_alt_payment_1")
	if err != nil {
		t.Fatalf("GET /v1/incidents/inc_alt_payment_1 failed: %v", err)
	}
	defer getResp.Body.Close()

	if getResp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK, got %d", getResp.StatusCode)
	}
	var singleInc IncidentRecord
	if err := json.NewDecoder(getResp.Body).Decode(&singleInc); err != nil {
		t.Fatalf("failed to decode single incident: %v", err)
	}
	if singleInc.Service != "payment-gateway" {
		t.Errorf("expected service payment-gateway, got %s", singleInc.Service)
	}

	// 4. GET /v1/incidents/nonexistent
	notFoundResp, _ := http.Get(ts.URL + "/v1/incidents/nonexistent_id")
	notFoundResp.Body.Close()
	if notFoundResp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 Not Found, got %d", notFoundResp.StatusCode)
	}

	// 5. GET /v1/incidents (list all)
	listResp, err := http.Get(ts.URL + "/v1/incidents")
	if err != nil {
		t.Fatalf("GET /v1/incidents failed: %v", err)
	}
	defer listResp.Body.Close()

	var listIncidents []IncidentRecord
	if err := json.NewDecoder(listResp.Body).Decode(&listIncidents); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if len(listIncidents) != 2 {
		t.Errorf("expected 2 incidents in list, got %d", len(listIncidents))
	}

	// 6. GET /v1/incidents?service=auth-service
	filterResp, err := http.Get(ts.URL + "/v1/incidents?service=auth-service")
	if err != nil {
		t.Fatalf("GET /v1/incidents with filter failed: %v", err)
	}
	defer filterResp.Body.Close()

	var filteredIncidents []IncidentRecord
	if err := json.NewDecoder(filterResp.Body).Decode(&filteredIncidents); err != nil {
		t.Fatalf("failed to decode filtered list: %v", err)
	}
	if len(filteredIncidents) != 1 || filteredIncidents[0].Service != "auth-service" {
		t.Errorf("unexpected filtered list: %v", filteredIncidents)
	}
}

func TestTriggerRunbook(t *testing.T) {
	handler := NewHandler(nil, nil, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	// Ingest alert first
	alert := AnomalyAlert{
		AlertID:             "alt_rb_1",
		SourceService:       "database-prod",
		RecommendedSeverity: SeveritySev1,
	}
	b, _ := json.Marshal(alert)
	r, _ := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b))
	r.Body.Close()

	// Trigger runbook
	reqPayload := RunbookExecutionRequest{
		RunbookID:   "rb_restart_conn_pool",
		TriggeredBy: "auto_responder",
	}
	rbBody, _ := json.Marshal(reqPayload)
	resp, err := http.Post(ts.URL+"/v1/incidents/inc_alt_rb_1/runbook", "application/json", bytes.NewBuffer(rbBody))
	if err != nil {
		t.Fatalf("POST runbook trigger failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK, got %d", resp.StatusCode)
	}

	var res RunbookExecutionResult
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode runbook execution result: %v", err)
	}

	if res.IncidentID != "inc_alt_rb_1" {
		t.Errorf("expected IncidentID inc_alt_rb_1, got %s", res.IncidentID)
	}
	if res.RunbookID != "rb_restart_conn_pool" {
		t.Errorf("expected RunbookID rb_restart_conn_pool, got %s", res.RunbookID)
	}

	// Verify incident state transitioned to MITIGATING
	getResp, _ := http.Get(ts.URL + "/v1/incidents/inc_alt_rb_1")
	defer getResp.Body.Close()

	var inc IncidentRecord
	_ = json.NewDecoder(getResp.Body).Decode(&inc)
	if inc.Status != StatusMitigating {
		t.Errorf("expected status MITIGATING, got %s", inc.Status)
	}
	if inc.ActiveRunbook != "rb_restart_conn_pool" {
		t.Errorf("expected active runbook rb_restart_conn_pool, got %s", inc.ActiveRunbook)
	}
}

func TestMockEngineAndTrigger(t *testing.T) {
	engine := &mockEngine{}
	trigger := &mockTrigger{}
	handler := NewHandler(engine, nil, trigger)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	// Test alert ingestion via engine mock
	alert := AnomalyAlert{AlertID: "alt_mock", SourceService: "test_service"}
	b, _ := json.Marshal(alert)
	resp, err := http.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(b))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("expected 202 Accepted, got %d", resp.StatusCode)
	}

	// Test runbook execution via trigger mock
	rbReq := RunbookExecutionRequest{RunbookID: "rb_mock", TriggeredBy: "user"}
	rbBody, _ := json.Marshal(rbReq)
	rbResp, err := http.Post(ts.URL+"/v1/incidents/inc_mock_123/runbook", "application/json", bytes.NewBuffer(rbBody))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer rbResp.Body.Close()

	if rbResp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 OK, got %d", rbResp.StatusCode)
	}

	var res RunbookExecutionResult
	_ = json.NewDecoder(rbResp.Body).Decode(&res)
	if res.ExecutionID != "exec_mock_456" || res.Status != "SUCCESS" {
		t.Errorf("unexpected mock runbook result: %v", res)
	}
}
