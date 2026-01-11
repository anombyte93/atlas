package main

import "testing"

func TestTransitions(t *testing.T) {
	if _, ok := transition(StateQueued, EventClaim); !ok {
		t.Fatal("queued -> claim should be allowed")
	}
	if _, ok := transition(StateRunning, EventReportOK); !ok {
		t.Fatal("running -> report_ok should be allowed")
	}
	if _, ok := transition(StateRunning, EventLeaseExpire); !ok {
		t.Fatal("running -> lease_expire should be allowed")
	}
	if _, ok := transition(StateFailed, EventRetry); !ok {
		t.Fatal("failed -> retry should be allowed")
	}
	if _, ok := transition(StateCompleted, EventClaim); ok {
		t.Fatal("completed -> claim should not be allowed")
	}
}
