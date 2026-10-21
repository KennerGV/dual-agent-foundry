package engine

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestEngineAlertDeduplicationAndLifecycle(t *testing.T) {
	ctx := context.Background()
	engine := NewEngine()

	alert1 := AnomalyAlert{
		AlertID:             "alt_001",
		DetectedAtUTC:       time.Now().UTC(),
		SourceService:       "payment-gateway",
		AnomalyType:         "LATENCY_SPIKE",
		ZScore:              4.5,
		Confidence:          0.95,
		RecommendedSeverity: SeveritySev3,
	}

	// 1. Process first alert -> create incident
	inc1, err := engine.ProcessAlert(ctx, alert1)
	if err != nil {
		t.Fatalf("unexpected error on ProcessAlert: %v", err)
	}
	if inc1.Status != StatusOpen {
		t.Errorf("expected status OPEN, got %s", inc1.Status)
	}
	if inc1.DeduplicatedAlertsCount != 1 {
		t.Errorf("expected count 1, got %d", inc1.DeduplicatedAlertsCount)
	}
	if inc1.Severity != SeveritySev3 {
		t.Errorf("expected severity SEV-3, got %s", inc1.Severity)
	}

	// 2. Test Deduplicate interface
	isDup, existingID, err := engine.Deduplicate(ctx, alert1)
	if err != nil {
		t.Fatalf("unexpected error on Deduplicate: %v", err)
	}
	if !isDup {
		t.Errorf("expected isDup = true")
	}
	if existingID != inc1.IncidentID {
		t.Errorf("expected existingID %s, got %s", inc1.IncidentID, existingID)
	}

	// 3. Process second alert for same service with higher severity -> deduplicate & escalate
	alert2 := AnomalyAlert{
		AlertID:             "alt_002",
		DetectedAtUTC:       time.Now().UTC(),
		SourceService:       "payment-gateway",
		AnomalyType:         "ERROR_SURGE",
		ZScore:              5.2,
		Confidence:          0.98,
		RecommendedSeverity: SeveritySev1,
	}

	inc2, err := engine.ProcessAlert(ctx, alert2)
	if err != nil {
		t.Fatalf("unexpected error on second ProcessAlert: %v", err)
	}
	if inc2.IncidentID != inc1.IncidentID {
		t.Errorf("expected same incident ID %s, got %s", inc1.IncidentID, inc2.IncidentID)
	}
	if inc2.DeduplicatedAlertsCount != 2 {
		t.Errorf("expected count 2, got %d", inc2.DeduplicatedAlertsCount)
	}
	if inc2.Severity != SeveritySev1 {
		t.Errorf("expected escalated severity SEV-1, got %s", inc2.Severity)
	}

	// 4. Test GetActiveIncident
	activeInc, err := engine.GetActiveIncident(ctx, "payment-gateway")
	if err != nil {
		t.Fatalf("unexpected error on GetActiveIncident: %v", err)
	}
	if activeInc.IncidentID != inc1.IncidentID {
		t.Errorf("expected active incident ID %s, got %s", inc1.IncidentID, activeInc.IncidentID)
	}
}

func TestStateMachineTransitions(t *testing.T) {
	ctx := context.Background()
	engine := NewEngine()

	alert := AnomalyAlert{
		AlertID:             "alt_100",
		SourceService:       "auth-service",
		RecommendedSeverity: SeveritySev2,
	}

	inc, err := engine.ProcessAlert(ctx, alert)
	if err != nil {
		t.Fatalf("failed to process alert: %v", err)
	}

	// OPEN -> MITIGATING (Valid)
	inc, err = engine.TransitionState(ctx, inc.IncidentID, StatusMitigating)
	if err != nil {
		t.Fatalf("expected valid transition OPEN -> MITIGATING, got err: %v", err)
	}
	if inc.Status != StatusMitigating {
		t.Errorf("expected status MITIGATING, got %s", inc.Status)
	}

	// MITIGATING -> MITIGATING (Invalid - same state)
	_, err = engine.TransitionState(ctx, inc.IncidentID, StatusMitigating)
	if err != ErrInvalidStateTransition {
		t.Errorf("expected ErrInvalidStateTransition, got %v", err)
	}

	// MITIGATING -> RESOLVED (Valid)
	inc, err = engine.TransitionState(ctx, inc.IncidentID, StatusResolved)
	if err != nil {
		t.Fatalf("expected valid transition MITIGATING -> RESOLVED, got err: %v", err)
	}

	// Active incident should no longer be returned for auth-service
	_, err = engine.GetActiveIncident(ctx, "auth-service")
	if err != ErrIncidentNotFound {
		t.Errorf("expected ErrIncidentNotFound after RESOLVED, got %v", err)
	}

	// RESOLVED -> CLOSED (Valid)
	inc, err = engine.TransitionState(ctx, inc.IncidentID, StatusClosed)
	if err != nil {
		t.Fatalf("expected valid transition RESOLVED -> CLOSED, got err: %v", err)
	}

	// CLOSED -> OPEN (Invalid - terminal state)
	_, err = engine.TransitionState(ctx, inc.IncidentID, StatusOpen)
	if err != ErrInvalidStateTransition {
		t.Errorf("expected ErrInvalidStateTransition from CLOSED state, got %v", err)
	}
}

func TestSeverityEscalation(t *testing.T) {
	ctx := context.Background()
	engine := NewEngine()

	inc, err := engine.ProcessAlert(ctx, AnomalyAlert{
		SourceService:       "db-primary",
		RecommendedSeverity: SeveritySev3,
	})
	if err != nil {
		t.Fatalf("failed to process alert: %v", err)
	}

	// Escalate to SEV-2
	inc, err = engine.EscalateSeverity(ctx, inc.IncidentID, SeveritySev2)
	if err != nil {
		t.Fatalf("unexpected error on severity escalation: %v", err)
	}
	if inc.Severity != SeveritySev2 {
		t.Errorf("expected SEV-2, got %s", inc.Severity)
	}

	// Attempt downgrade to SEV-3 (rank prevents downgrade)
	inc, err = engine.EscalateSeverity(ctx, inc.IncidentID, SeveritySev3)
	if err != nil {
		t.Fatalf("unexpected error on severity downgrade attempt: %v", err)
	}
	if inc.Severity != SeveritySev2 {
		t.Errorf("expected severity to remain SEV-2, got %s", inc.Severity)
	}

	// Non-existent incident ID
	_, err = engine.EscalateSeverity(ctx, "non-existent-id", SeveritySev1)
	if err != ErrIncidentNotFound {
		t.Errorf("expected ErrIncidentNotFound, got %v", err)
	}
}

func TestEngineConcurrency(t *testing.T) {
	ctx := context.Background()
	engine := NewEngine()

	const numGoroutines = 50
	const numAlertsPerGoroutine = 20

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(routineID int) {
			defer wg.Done()
			service := fmt.Sprintf("service-%d", routineID%5) // 5 services shared across routines

			for j := 0; j < numAlertsPerGoroutine; j++ {
				alert := AnomalyAlert{
					AlertID:             fmt.Sprintf("alt_%d_%d", routineID, j),
					SourceService:       service,
					AnomalyType:         "CONCURRENCY_TEST",
					RecommendedSeverity: SeveritySev2,
				}

				inc, err := engine.ProcessAlert(ctx, alert)
				if err != nil {
					t.Errorf("ProcessAlert error: %v", err)
					return
				}

				// Deduplicate check
				engine.Deduplicate(ctx, alert)

				// Get active incident
				engine.GetActiveIncident(ctx, service)

				// Occasional state transition
				if j%5 == 0 {
					engine.TransitionState(ctx, inc.IncidentID, StatusMitigating)
				}
			}
		}(i)
	}

	wg.Wait()
}
