package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"initiative-03/api"
	"initiative-03/engine"
	"initiative-03/store"
)

func TestHighConcurrencyRaceSuite(t *testing.T) {
	ctx := context.Background()

	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()

	engAdapter := &EngineAdapter{Engine: eng, Store: memStore}
	storeAdapter := &StoreAdapter{Store: memStore}
	trigger := &IntegrationRunbookTrigger{Engine: eng, Store: memStore}

	handler := api.NewHandler(engAdapter, storeAdapter, trigger)
	ts := httptest.NewServer(handler)
	defer ts.Close()

	const (
		numRoutines   = 40
		opsPerRoutine = 15
	)

	var wg sync.WaitGroup
	wg.Add(numRoutines)

	services := []string{"payment-gw", "user-auth", "catalog-api", "checkout-svc", "notification"}

	for i := 0; i < numRoutines; i++ {
		go func(routineIdx int) {
			defer wg.Done()

			service := services[routineIdx%len(services)]
			client := ts.Client()

			for j := 0; j < opsPerRoutine; j++ {
				alertID := fmt.Sprintf("alt_conc_%d_%d", routineIdx, j)

				// 1. Concurrent Alert Ingestion via HTTP API
				alertReq := api.AnomalyAlert{
					AlertID:             alertID,
					DetectedAtUTC:       time.Now().UTC(),
					SourceService:       service,
					AnomalyType:         "RACE_TEST_ANOMALY",
					ZScore:              float64(3 + (j % 5)),
					Confidence:          0.95,
					RecommendedSeverity: api.Severity(fmt.Sprintf("SEV-%d", (j%3)+1)),
				}

				body, _ := json.Marshal(alertReq)
				resp, err := client.Post(ts.URL+"/v1/alerts", "application/json", bytes.NewBuffer(body))
				if err == nil {
					var inc api.IncidentRecord
					if json.NewDecoder(resp.Body).Decode(&inc) == nil && inc.IncidentID != "" {
						_ = resp.Body.Close()

						// 2. Concurrent Runbook Execution for returned incident
						rbReq := api.RunbookExecutionRequest{
							IncidentID:  inc.IncidentID,
							RunbookID:   fmt.Sprintf("rb_%s_mitigate", service),
							TriggeredBy: fmt.Sprintf("worker_%d", routineIdx),
						}
						rbBody, _ := json.Marshal(rbReq)
						rbResp, rbErr := client.Post(fmt.Sprintf("%s/v1/incidents/%s/runbook", ts.URL, inc.IncidentID), "application/json", bytes.NewBuffer(rbBody))
						if rbErr == nil {
							_ = rbResp.Body.Close()
						}

						// 3. Concurrent Incident Read via API
						getResp, getErr := client.Get(fmt.Sprintf("%s/v1/incidents/%s", ts.URL, inc.IncidentID))
						if getErr == nil {
							_ = getResp.Body.Close()
						}
					} else {
						_ = resp.Body.Close()
					}
				}

				// 4. Concurrent List API call with query filters
				listResp, lErr := client.Get(fmt.Sprintf("%s/v1/incidents?service=%s&limit=5", ts.URL, service))
				if lErr == nil {
					_ = listResp.Body.Close()
				}

				// 5. Concurrent Direct Engine and Store Calls
				engAlert := engine.AnomalyAlert{
					AlertID:             alertID,
					SourceService:       service,
					RecommendedSeverity: engine.SeveritySev2,
				}
				engInc, processErr := eng.ProcessAlert(ctx, engAlert)
				if processErr == nil && engInc != nil {
					_, _, _ = eng.Deduplicate(ctx, engAlert)
					_, _ = eng.GetActiveIncident(ctx, service)
					_, _ = eng.EscalateSeverity(ctx, engInc.IncidentID, engine.SeveritySev1)
					if j%3 == 0 {
						_, _ = eng.TransitionState(ctx, engInc.IncidentID, engine.StatusResolved)
					}
				}

				// 6. Concurrent Direct Audit Logging and Reading
				auditEvent := store.IncidentAuditEvent{
					EventID:      fmt.Sprintf("evt_direct_%d_%d", routineIdx, j),
					IncidentID:   fmt.Sprintf("inc_direct_%d", routineIdx),
					EventType:    store.AuditAlertIngested,
					TimestampUTC: time.Now().UTC(),
					Details:      "direct concurrency audit write",
					Actor:        "concurrency_tester",
				}
				_ = memStore.AppendAudit(ctx, auditEvent)
				_, _ = memStore.GetAuditLogs(ctx, auditEvent.IncidentID)

				// 7. Concurrent Health Check API Call
				hResp, hErr := client.Get(ts.URL + "/healthz")
				if hErr == nil {
					_ = hResp.Body.Close()
				}
			}
		}(i)
	}

	wg.Wait()
}
