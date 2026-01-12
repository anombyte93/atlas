package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"atlas-control-plane/internal/atlascoin"
)

type flappingCoinClient struct {
	failCount int
}

func (f *flappingCoinClient) PostBounty(ctx context.Context, poster, template, escrowAmount string) (*atlascoin.Bounty, error) {
	if f.failCount > 0 {
		f.failCount--
		return nil, errors.New("flap")
	}
	return &atlascoin.Bounty{ID: "B2", Poster: poster}, nil
}
func (f *flappingCoinClient) SubmitSolution(ctx context.Context, bountyID, claimant, stakeAmount string, evidence any) (*atlascoin.Bounty, error) {
	if f.failCount > 0 {
		f.failCount--
		return nil, errors.New("flap")
	}
	return &atlascoin.Bounty{ID: bountyID, Claimant: claimant}, nil
}
func (f *flappingCoinClient) Verify(ctx context.Context, bountyID string, evidence any) (*atlascoin.VerificationResult, error) {
	if f.failCount > 0 {
		f.failCount--
		return nil, errors.New("flap")
	}
	return &atlascoin.VerificationResult{Passed: true}, nil
}
func (f *flappingCoinClient) Settle(ctx context.Context, bountyID string) (*atlascoin.Bounty, error) {
	if f.failCount > 0 {
		f.failCount--
		return nil, errors.New("flap")
	}
	return &atlascoin.Bounty{ID: bountyID, Settled: true}, nil
}

func TestCoinRetriesSucceedAfterFlap(t *testing.T) {
	f := &flappingCoinClient{failCount: 2}
	coin := CoinIntegration{enabled: true, client: f, poster: "sys", reward: 10, stakePct: 10, timeout: 500 * time.Millisecond}
	task := Task{ID: "T2", Type: "ci"}

	bid, err := coinPostBounty(context.Background(), coin, task, Config{})
	if err != nil || bid == "" {
		t.Fatalf("post bounty failed after retries: %v", err)
	}

	task.CoinBountyID = bid
	f.failCount = 1
	if err := coinSubmitSolution(context.Background(), coin, &task, "agent"); err != nil {
		t.Fatalf("submit failed after retries: %v", err)
	}

	f.failCount = 1
	if err := coinSettle(context.Background(), coin, &task, true); err != nil {
		t.Fatalf("settle failed after retries: %v", err)
	}
}
