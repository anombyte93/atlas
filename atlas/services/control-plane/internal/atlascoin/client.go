package atlascoin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a minimal HTTP wrapper for the Atlas Coin Fastify API.
// All methods are context-aware and use short timeouts to avoid blocking
// the control-plane hot path. This file is standalone so we can mock
// the API easily in tests before wiring real calls.
type Client struct {
	baseURL string
	http    *http.Client
	auth    string
}

type Bounty struct {
	ID           string `json:"id"`
	Poster       string `json:"poster"`
	Template     string `json:"template"`
	EscrowAmount string `json:"escrowAmount"`
	Claimant     string `json:"claimant,omitempty"`
	StakeAmount  string `json:"stakeAmount,omitempty"`
	Settled      bool   `json:"settled,omitempty"`
}

type VerificationResult struct {
	Passed  bool     `json:"passed"`
	Details []string `json:"details,omitempty"`
}

type Challenge struct {
	BountyID string `json:"bountyId"`
	Stake    string `json:"stake"`
	Resolved bool   `json:"resolved,omitempty"`
	Success  bool   `json:"successful,omitempty"`
}

const defaultRequestTimeout = 10 * time.Second

// New creates a client with a 5s timeout HTTP client.
func New(baseURL, auth string) *Client {
	return &Client{
		baseURL: baseURL,
		http: &http.Client{
			Timeout: defaultRequestTimeout + (2 * time.Second), // allow for connect + TLS
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     60 * time.Second,
			},
		},
		auth: auth,
	}
}

func (c *Client) PostBounty(ctx context.Context, poster, template, escrow string) (*Bounty, error) {
	body := map[string]any{
		"poster":       poster,
		"template":     template,
		"escrowAmount": escrow,
	}
	var out Bounty
	if err := c.do(ctx, http.MethodPost, "/api/bounties", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) SubmitSolution(ctx context.Context, bountyID, claimant, stake string, evidence any) (*Bounty, error) {
	body := map[string]any{
		"claimant":    claimant,
		"stakeAmount": stake,
		"evidence":    evidence,
	}
	var out Bounty
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/bounties/%s/submit", bountyID), body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Verify(ctx context.Context, bountyID string, evidence any) (*VerificationResult, error) {
	var body any
	if evidence != nil {
		body = map[string]any{"evidence": evidence}
	}
	var out VerificationResult
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/bounties/%s/verify", bountyID), body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Challenge(ctx context.Context, bountyID, challenger, stake string) (*Challenge, error) {
	body := map[string]any{
		"challenger":  challenger,
		"stakeAmount": stake,
	}
	var out Challenge
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/bounties/%s/challenge", bountyID), body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) Settle(ctx context.Context, bountyID string) (*Bounty, error) {
	var out Bounty
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/api/bounties/%s/settle", bountyID), nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// do issues an HTTP request and decodes JSON into out when provided.
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, defaultRequestTimeout)
		defer cancel()
	}

	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.auth != "" {
		req.Header.Set("Authorization", "Bearer "+c.auth)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		_, _ = io.ReadAll(resp.Body) // Read body to avoid connection leak
		return fmt.Errorf("atlas-coin %s %s failed: %s", method, path, resp.Status)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
