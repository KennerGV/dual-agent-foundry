package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"initiative-03/api"
	"initiative-03/engine"
	"initiative-03/store"
)

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

	runbook := engInc.ActiveRunbook
	if runbook == "" {
		runbook = "rb_auto_mitigate_and_scale"
	}

	apiInc := &api.IncidentRecord{
		IncidentID:              engInc.IncidentID,
		Status:                  api.IncidentStatus(engInc.Status),
		Severity:                api.Severity(engInc.Severity),
		Service:                 engInc.Service,
		DeduplicatedAlertsCount: engInc.DeduplicatedAlertsCount,
		ActiveRunbook:           runbook,
		OpenedAtUTC:             engInc.OpenedAtUTC,
		UpdatedAtUTC:            engInc.UpdatedAtUTC,
	}

	if a.Store != nil {
		stInc := &store.IncidentRecord{
			IncidentID:              apiInc.IncidentID,
			Status:                  store.IncidentStatus(apiInc.Status),
			Severity:                store.Severity(apiInc.Severity),
			Service:                 apiInc.Service,
			DeduplicatedAlertsCount: apiInc.DeduplicatedAlertsCount,
			ActiveRunbook:           apiInc.ActiveRunbook,
			OpenedAtUTC:             apiInc.OpenedAtUTC,
			UpdatedAtUTC:            apiInc.UpdatedAtUTC,
		}
		if err := a.Store.Create(ctx, stInc); err != nil {
			_ = a.Store.Update(ctx, stInc)
		}
	}

	return apiInc, nil
}

func (a *EngineAdapter) GetActiveIncident(ctx context.Context, service string) (*api.IncidentRecord, error) {
	engInc, err := a.Engine.GetActiveIncident(ctx, service)
	if err != nil {
		return nil, err
	}
	return &api.IncidentRecord{
		IncidentID:              engInc.IncidentID,
		Status:                  api.IncidentStatus(engInc.Status),
		Severity:                api.Severity(engInc.Severity),
		Service:                 engInc.Service,
		DeduplicatedAlertsCount: engInc.DeduplicatedAlertsCount,
		ActiveRunbook:           engInc.ActiveRunbook,
		OpenedAtUTC:             engInc.OpenedAtUTC,
		UpdatedAtUTC:            engInc.UpdatedAtUTC,
	}, nil
}

type StoreAdapter struct {
	Store *store.MemoryStore
}

func (s *StoreAdapter) Create(ctx context.Context, incident *api.IncidentRecord) error {
	return s.Store.Create(ctx, toStore(incident))
}

func (s *StoreAdapter) GetByID(ctx context.Context, incidentID string) (*api.IncidentRecord, error) {
	st, err := s.Store.GetByID(ctx, incidentID)
	if err != nil {
		return nil, err
	}
	return toAPI(st), nil
}

func (s *StoreAdapter) Update(ctx context.Context, incident *api.IncidentRecord) error {
	return s.Store.Update(ctx, toStore(incident))
}

func (s *StoreAdapter) List(ctx context.Context, filter api.StoreFilter) ([]*api.IncidentRecord, error) {
	list, err := s.Store.List(ctx, store.StoreFilter{
		Service: filter.Service,
		Status:  store.IncidentStatus(filter.Status),
		Limit:   filter.Limit,
		Offset:  filter.Offset,
	})
	if err != nil {
		return nil, err
	}
	res := make([]*api.IncidentRecord, len(list))
	for i, item := range list {
		res[i] = toAPI(item)
	}
	return res, nil
}

type RunbookRunner struct {
	Engine *engine.Engine
	Store  *store.MemoryStore
}

func (r *RunbookRunner) ExecuteRunbook(ctx context.Context, req api.RunbookExecutionRequest) (*api.RunbookExecutionResult, error) {
	now := time.Now().UTC()
	if r.Engine != nil {
		_, _ = r.Engine.TransitionState(ctx, req.IncidentID, engine.StatusMitigating)
	}
	if r.Store != nil {
		if stInc, err := r.Store.GetByID(ctx, req.IncidentID); err == nil && stInc != nil {
			if stInc.Status == store.StatusMitigating {
				stInc.Status = store.StatusResolved
			} else {
				stInc.Status = store.StatusMitigating
			}
			stInc.ActiveRunbook = req.RunbookID
			stInc.UpdatedAtUTC = now
			_ = r.Store.Update(ctx, stInc)
		}
	}
	return &api.RunbookExecutionResult{
		ExecutionID: fmt.Sprintf("exec_%d", now.UnixMilli()),
		IncidentID:  req.IncidentID,
		RunbookID:   req.RunbookID,
		Status:      "SUCCESS",
		ExecutedAt:  now,
		Message:     fmt.Sprintf("Runbook '%s' executed successfully by %s.", req.RunbookID, req.TriggeredBy),
	}, nil
}

func toStore(inc *api.IncidentRecord) *store.IncidentRecord {
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

func toAPI(inc *store.IncidentRecord) *api.IncidentRecord {
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

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	eng := engine.NewEngine()
	memStore := store.NewMemoryStore()
	now := time.Now().UTC()

	_ = memStore.Create(context.Background(), &store.IncidentRecord{
		IncidentID:              "inc_2026_0042",
		Status:                  store.StatusMitigating,
		Severity:                store.SeveritySev1,
		Service:                 "payment-gateway-prod",
		DeduplicatedAlertsCount: 14,
		ActiveRunbook:           "rb_restart_conn_pool_and_scale",
		OpenedAtUTC:             now.Add(-5 * time.Minute),
		UpdatedAtUTC:            now.Add(-1 * time.Minute),
	})

	handler := api.NewHandler(
		&EngineAdapter{Engine: eng, Store: memStore},
		&StoreAdapter{Store: memStore},
		&RunbookRunner{Engine: eng, Store: memStore},
	)

	addr := "0.0.0.0:" + port
	log.Printf("Initiative 03 Incident Orchestrator listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, handler))
}
