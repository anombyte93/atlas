package atlascoin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostBounty(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/bounties" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body["poster"] != "alice" || body["template"] != "ci" || body["escrowAmount"] != "100" {
			t.Fatalf("bad payload: %#v", body)
		}
		_ = json.NewEncoder(w).Encode(Bounty{ID: "BOUNTY-1", Poster: "alice", Template: "ci", EscrowAmount: "100"})
	}))
	defer ts.Close()

	client := New(ts.URL, "")
	ctx := context.Background()
	out, err := client.PostBounty(ctx, "alice", "ci", "100")
	if err != nil {
		t.Fatalf("PostBounty error: %v", err)
	}
	if out.ID != "BOUNTY-1" {
		t.Fatalf("unexpected id: %s", out.ID)
	}
}

func TestSubmitSolutionAndFailOnHttpError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer ts.Close()

	client := New(ts.URL, "")
	err := expectError(client.SubmitSolution(context.Background(), "BOUNTY-1", "bob", "50", map[string]string{"evidence": "ok"}))
	if err == nil || !strings.Contains(err.Error(), "failed") {
		t.Fatalf("expected error, got %v", err)
	}
}

func TestVerifySendsEvidence(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/bounties/BOUNTY-2/verify" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if _, ok := body["evidence"]; !ok {
			t.Fatalf("expected evidence in body, got %#v", body)
		}
		_ = json.NewEncoder(w).Encode(VerificationResult{Passed: true})
	}))
	defer ts.Close()

	client := New(ts.URL, "")
	if _, err := client.Verify(context.Background(), "BOUNTY-2", map[string]any{"ci_passed": true}); err != nil {
		t.Fatalf("verify failed: %v", err)
	}
}

func expectError[T any](_ *T, err error) error {
	return err
}
