package store_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"initiative-03/store"
)

func TestMemoryStore_CRUD(t *testing.T) {
	s := store.NewMemoryStore()
	ctx := context.Background()

	now := time.Now().UTC()
	inc := &store.IncidentRecord{
		IncidentID:              "inc_1",
		Status:                  store.StatusOpen,
		Severity:                store.SeveritySev1,
		Service:                 "auth-service",
		DeduplicatedAlertsCount: 1,
		ActiveRunbook:           "rb_restart",
		OpenedAtUTC:             now,
		UpdatedAtUTC:             now,
	}

	// 1. Create
	err := s.Create(ctx, inc)
	if err != nil {
		t.Fatalf("expected no error on Create, got: %v", err)
	}

	// 2. Duplicate Create -> ErrAlreadyExists
	err = s.Create(ctx, inc)
	if !errors.Is(err, store.ErrAlreadyExists) {
		t.Fatalf("expected ErrAlreadyExists on duplicate Create, got: %v", err)
	}

	// 3. GetByID
	retrieved, err := s.GetByID(ctx, "inc_1")
	if err != nil {
		t.Fatalf("expected no error on GetByID, got: %v", err)
	}
	if retrieved.IncidentID != "inc_1" || retrieved.Status != store.StatusOpen {
		t.Fatalf("unexpected record retrieved: %+v", retrieved)
	}

	// Defensive copy verification
	retrieved.Status = store.StatusResolved
	retrieved2, _ := s.GetByID(ctx, "inc_1")
	if retrieved2.Status != store.StatusOpen {
		t.Fatalf("store state was modified by mutating returned pointer!")
	}

	// 4. Update
	retrieved.Status = store.StatusMitigating
	err = s.Update(ctx, retrieved)
	if err != nil {
		t.Fatalf("expected no error on Update, got: %v", err)
	}

	updated, err := s.GetByID(ctx, "inc_1")
	if err != nil {
		t.Fatalf("expected no error on GetByID, got: %v", err)
	}
	if updated.Status != store.StatusMitigating {
		t.Fatalf("expected status %s, got: %s", store.StatusMitigating, updated.Status)
	}

	// 5. GetByID non-existent -> ErrNotFound
	_, err = s.GetByID(ctx, "non_existent")
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for non existent ID, got: %v", err)
	}

	// 6. Update non-existent -> ErrNotFound
	nonExistentInc := &store.IncidentRecord{IncidentID: "non_existent"}
	err = s.Update(ctx, nonExistentInc)
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound on Update non existent ID, got: %v", err)
	}
}

func TestMemoryStore_ListFilteringAndPagination(t *testing.T) {
	s := store.NewMemoryStore()
	ctx := context.Background()

	incidents := []*store.IncidentRecord{
		{IncidentID: "inc_1", Service: "srv-a", Status: store.StatusOpen},
		{IncidentID: "inc_2", Service: "srv-a", Status: store.StatusMitigating},
		{IncidentID: "inc_3", Service: "srv-b", Status: store.StatusOpen},
		{IncidentID: "inc_4", Service: "srv-a", Status: store.StatusOpen},
		{IncidentID: "inc_5", Service: "srv-b", Status: store.StatusResolved},
	}

	for _, inc := range incidents {
		if err := s.Create(ctx, inc); err != nil {
			t.Fatalf("failed to create record %s: %v", inc.IncidentID, err)
		}
	}

	// Filter by Service
	list, err := s.List(ctx, store.StoreFilter{Service: "srv-a"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("expected 3 records for srv-a, got %d", len(list))
	}

	// Filter by Status
	list, err = s.List(ctx, store.StoreFilter{Status: store.StatusOpen})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("expected 3 OPEN records, got %d", len(list))
	}

	// Filter by Service & Status
	list, err = s.List(ctx, store.StoreFilter{Service: "srv-a", Status: store.StatusOpen})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 OPEN records for srv-a, got %d", len(list))
	}

	// Pagination: Offset and Limit
	list, err = s.List(ctx, store.StoreFilter{Service: "srv-a", Limit: 1, Offset: 1})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 record with Limit 1, Offset 1, got %d", len(list))
	}
	if list[0].IncidentID != "inc_2" {
		t.Fatalf("expected inc_2, got %s", list[0].IncidentID)
	}
}

func TestMemoryStore_AuditLog(t *testing.T) {
	s := store.NewMemoryStore()
	ctx := context.Background()

	now := time.Now().UTC()
	event1 := store.IncidentAuditEvent{
		EventID:      "evt_1",
		IncidentID:   "inc_100",
		EventType:    store.AuditAlertIngested,
		TimestampUTC: now,
		Details:      "Alert ingested",
		Actor:        "system",
	}
	event2 := store.IncidentAuditEvent{
		EventID:      "evt_2",
		IncidentID:   "inc_100",
		EventType:    store.AuditStateTransition,
		TimestampUTC: now.Add(time.Second),
		Details:      "Transition to MITIGATING",
		Actor:        "operator",
	}

	// Non-existent audit logs return empty slice
	logs, err := s.GetAuditLogs(ctx, "inc_100")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(logs) != 0 {
		t.Fatalf("expected empty logs slice, got %d items", len(logs))
	}

	// Append audit events
	if err := s.AppendAudit(ctx, event1); err != nil {
		t.Fatalf("failed to append event1: %v", err)
	}
	if err := s.AppendAudit(ctx, event2); err != nil {
		t.Fatalf("failed to append event2: %v", err)
	}

	logs, err = s.GetAuditLogs(ctx, "inc_100")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("expected 2 audit logs, got %d", len(logs))
	}
	if logs[0].EventID != "evt_1" || logs[1].EventID != "evt_2" {
		t.Fatalf("unexpected audit log events: %+v", logs)
	}
}

func TestMemoryStore_CancelledContext(t *testing.T) {
	s := store.NewMemoryStore()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	inc := &store.IncidentRecord{IncidentID: "inc_canceled"}

	if err := s.Create(ctx, inc); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on Create, got: %v", err)
	}
	if _, err := s.GetByID(ctx, "inc_canceled"); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on GetByID, got: %v", err)
	}
	if err := s.Update(ctx, inc); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on Update, got: %v", err)
	}
	if _, err := s.List(ctx, store.StoreFilter{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on List, got: %v", err)
	}
	if err := s.AppendAudit(ctx, store.IncidentAuditEvent{IncidentID: "inc_canceled"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on AppendAudit, got: %v", err)
	}
	if _, err := s.GetAuditLogs(ctx, "inc_canceled"); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled on GetAuditLogs, got: %v", err)
	}
}

func TestMemoryStore_Concurrency(t *testing.T) {
	s := store.NewMemoryStore()
	ctx := context.Background()

	var wg sync.WaitGroup
	workers := 20
	iterations := 50

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for j := 0; j < iterations; j++ {
				incID := fmt.Sprintf("inc_%d_%d", workerID, j)
				inc := &store.IncidentRecord{
					IncidentID: incID,
					Service:    fmt.Sprintf("srv_%d", workerID%3),
					Status:     store.StatusOpen,
				}

				_ = s.Create(ctx, inc)
				inc.Status = store.StatusMitigating
				_ = s.Update(ctx, inc)

				_, _ = s.GetByID(ctx, incID)
				_, _ = s.List(ctx, store.StoreFilter{Service: fmt.Sprintf("srv_%d", workerID%3)})

				auditEvt := store.IncidentAuditEvent{
					EventID:    fmt.Sprintf("evt_%d_%d", workerID, j),
					IncidentID: incID,
					Actor:      "worker",
				}
				_ = s.AppendAudit(ctx, auditEvt)
				_, _ = s.GetAuditLogs(ctx, incID)
			}
		}(i)
	}

	wg.Wait()
}
