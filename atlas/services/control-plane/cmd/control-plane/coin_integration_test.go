package main

import (
	"context"
	"testing"
	"time"

	"atlas-control-plane/internal/atlascoin"
)

type fakeCoinClient struct {
	postCalls    int
	submitCalls  int
	verifyCalls  int
	settleCalls  int
	lastBountyID string
	failVerify   bool
}

func (f *fakeCoinClient) PostBounty(ctx context.Context, poster, template, escrowAmount string) (*atlascoin.Bounty, error) {
	f.postCalls++
	return &atlascoin.Bounty{ID: "B1", Poster: poster, Template: template, EscrowAmount: escrowAmount}, nil
}

func (f *fakeCoinClient) SubmitSolution(ctx context.Context, bountyID, claimant, stakeAmount string, evidence any) (*atlascoin.Bounty, error) {
	f.submitCalls++
	f.lastBountyID = bountyID
	return &atlascoin.Bounty{ID: bountyID, Claimant: claimant, StakeAmount: stakeAmount}, nil
}

func (f *fakeCoinClient) Verify(ctx context.Context, bountyID string, evidence any) (*atlascoin.VerificationResult, error) {
	f.verifyCalls++
	f.lastBountyID = bountyID
	if f.failVerify {
		return &atlascoin.VerificationResult{Passed: false, Details: []string{"fail"}}, nil
	}
	return &atlascoin.VerificationResult{Passed: true, Details: []string{"ok"}}, nil
}

func (f *fakeCoinClient) Settle(ctx context.Context, bountyID string) (*atlascoin.Bounty, error) {
	f.settleCalls++
	f.lastBountyID = bountyID
	return &atlascoin.Bounty{ID: bountyID, Settled: true}, nil
}

func TestCoinHooksInvokeClient(t *testing.T) {
	fake := &fakeCoinClient{}
	coin := CoinIntegration{
		enabled:  true,
		client:   fake,
		poster:   "system",
		reward:   50,
		stakePct: 10,
		timeout:  500 * time.Millisecond,
	}

	task := Task{ID: "T1", Type: "ci"}

	bid, err := coinPostBounty(context.Background(), coin, task, Config{})
	if err != nil {
		t.Fatalf("post bounty err: %v", err)
	}
	if bid == "" || fake.postCalls != 1 {
		t.Fatalf("expected post bounty called once, got %d", fake.postCalls)
	}
	task.CoinBountyID = bid

	if err := coinSubmitSolution(context.Background(), coin, &task, "agent-1"); err != nil {
		t.Fatalf("submit solution err: %v", err)
	}
	if fake.submitCalls != 1 {
		t.Fatalf("expected submit called once, got %d", fake.submitCalls)
	}

	if err := coinSettle(context.Background(), coin, &task, true); err != nil {
		t.Fatalf("settle err: %v", err)
	}
	if fake.verifyCalls != 1 || fake.settleCalls != 1 {
		t.Fatalf("verify %d settle %d", fake.verifyCalls, fake.settleCalls)
	}
}
