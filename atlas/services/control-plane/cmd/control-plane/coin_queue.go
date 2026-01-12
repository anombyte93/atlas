package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"
)

type CoinJobKind string

const (
	JobPost   CoinJobKind = "post"
	JobSubmit CoinJobKind = "submit"
	JobSettle CoinJobKind = "settle"
)

type CoinJob struct {
	ID         string         `json:"id"`
	TaskID     string         `json:"task_id"`
	Kind       CoinJobKind    `json:"kind"`
	Payload    map[string]any `json:"payload"`
	Attempts   int            `json:"attempts"`
	MaxAttempt int            `json:"max_attempt,omitempty"` // For settle retries
	Status     string         `json:"status"`                // pending, running, done, failed
	LastError  string         `json:"last_error,omitempty"`
	NextRun    time.Time      `json:"next_run"`
	CreatedAt  time.Time      `json:"created_at"`
	RequestID  string         `json:"request_id,omitempty"`
}

type CoinQueue struct {
	mu     sync.Mutex
	jobs   map[string]*CoinJob
	logRef string
}

// getStringPayload extracts a string value from a job payload with validation.
func getStringPayload(payload map[string]any, key string) (string, error) {
	if payload == nil {
		return "", fmt.Errorf("payload is nil; missing %q", key)
	}
	val, ok := payload[key]
	if !ok {
		return "", fmt.Errorf("payload missing key %q", key)
	}
	strVal, ok := val.(string)
	if !ok {
		return "", fmt.Errorf("payload key %q must be a string", key)
	}
	return strVal, nil
}

// getBoolPayload extracts a bool value from a job payload with validation.
func getBoolPayload(payload map[string]any, key string) (bool, error) {
	if payload == nil {
		return false, fmt.Errorf("payload is nil; missing %q", key)
	}
	val, ok := payload[key]
	if !ok {
		return false, fmt.Errorf("payload missing key %q", key)
	}
	boolVal, ok := val.(bool)
	if !ok {
		return false, fmt.Errorf("payload key %q must be a bool", key)
	}
	return boolVal, nil
}

func NewCoinQueue(logPath string) *CoinQueue {
	q := &CoinQueue{
		jobs:   map[string]*CoinJob{},
		logRef: logPath,
	}
	q.load()
	return q
}

func (q *CoinQueue) load() {
	if q.logRef == "" {
		return
	}
	data, err := os.ReadFile(q.logRef)
	if err != nil {
		return
	}
	var entries []*CoinJob
	if err := json.Unmarshal(data, &entries); err != nil {
		return
	}
	for _, j := range entries {
		q.jobs[j.ID] = j
	}
}

func (q *CoinQueue) persist() {
	if q.logRef == "" {
		return
	}
	entries := make([]*CoinJob, 0, len(q.jobs))
	for _, j := range q.jobs {
		entries = append(entries, j)
	}
	b, _ := json.MarshalIndent(entries, "", "  ")
	_ = os.WriteFile(q.logRef, b, 0o644)
}

func (q *CoinQueue) Enqueue(job *CoinJob) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if job.RequestID == "" {
		job.RequestID = job.ID
	}
	if job.MaxAttempt == 0 {
		job.MaxAttempt = 5 // Default max attempts
	}
	q.jobs[job.ID] = job
	q.persist()
}

func (q *CoinQueue) Mark(job *CoinJob) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.jobs[job.ID] = job
	q.persist()
}

func (q *CoinQueue) Due(now time.Time) []*CoinJob {
	q.mu.Lock()
	defer q.mu.Unlock()
	out := []*CoinJob{}
	for _, j := range q.jobs {
		if j.Status == "done" {
			continue
		}
		if now.After(j.NextRun) {
			out = append(out, j)
		}
	}
	return out
}

// WorkerLoop processes due jobs with retry/backoff. It runs forever.
func (q *CoinQueue) WorkerLoop(coin CoinIntegration, cfg Config) {
	workerCount := runtime.NumCPU()
	if workerCount < 2 {
		workerCount = 2
	}
	if workerCount > 8 {
		workerCount = 8
	}

	jobCh := make(chan *CoinJob, workerCount*2)
	for i := 0; i < workerCount; i++ {
		go func() {
			for job := range jobCh {
				q.handle(job, coin, cfg)
			}
		}()
	}

	ticker := time.NewTicker(2 * time.Second)
	for now := range ticker.C {
		for _, job := range q.Due(now) {
			if q.claim(job) {
				jobCh <- job
			}
		}
	}
}

func (q *CoinQueue) claim(job *CoinJob) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if existing, ok := q.jobs[job.ID]; ok {
		if existing.Status == "running" {
			return false
		}
		existing.Attempts++
		existing.Status = "running"
		existing.LastError = ""
		existing.NextRun = time.Time{}
		q.persist()
		return true
	}
	return false
}

func (q *CoinQueue) handle(job *CoinJob, coin CoinIntegration, cfg Config) {
	start := time.Now()

	err := q.dispatch(job, coin, cfg)
	if err != nil {
		job.LastError = err.Error()
		maxAttempts := job.MaxAttempt
		if maxAttempts == 0 {
			maxAttempts = 5
		}
		if job.Attempts >= maxAttempts {
			job.Status = "failed"
		} else {
			job.Status = "pending"
			job.NextRun = time.Now().Add(time.Duration(job.Attempts) * time.Second)
		}
		q.Mark(job)
		return
	}
	job.Status = "done"
	job.LastError = ""
	job.NextRun = time.Time{}
	q.Mark(job)

	if perfMetrics != nil {
		perfMetrics.Observe("coin_queue_job_runtime", time.Since(start), slowJobThreshold)
	}
}

func (q *CoinQueue) dispatch(job *CoinJob, coin CoinIntegration, cfg Config) error {
	ctx, cancel := context.WithTimeout(context.Background(), coinRequestTimeout)
	defer cancel()

	switch job.Kind {
	case JobPost:
		tid, err := getStringPayload(job.Payload, "task_id")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		poster, err := getStringPayload(job.Payload, "poster")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		template, err := getStringPayload(job.Payload, "template")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		escrowAmount, err := getStringPayload(job.Payload, "escrowAmount")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		opStart := time.Now()
		_, err = coin.client.PostBounty(ctx, poster, template, escrowAmount)
		if perfMetrics != nil {
			perfMetrics.Observe("coin_http_post_bounty", time.Since(opStart), slowJobThreshold)
		}
		if err != nil {
			return err
		}
		// best-effort: update task in memory if exists
		if tid != "" {
			updateCoinStatus(tid, "posted", "", "")
		}
		return nil
	case JobSubmit:
		bid, err := getStringPayload(job.Payload, "bounty_id")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		agent, err := getStringPayload(job.Payload, "agent")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		stake, err := getStringPayload(job.Payload, "stake")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		opStart := time.Now()
		_, err = coin.client.SubmitSolution(ctx, bid, agent, stake, job.Payload)
		if perfMetrics != nil {
			perfMetrics.Observe("coin_http_submit_solution", time.Since(opStart), slowJobThreshold)
		}
		if err != nil {
			return err
		}
		updateCoinStatus(job.TaskID, "submitted", "", bid)
		return nil
	case JobSettle:
		bid, err := getStringPayload(job.Payload, "bounty_id")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		success, err := getBoolPayload(job.Payload, "success")
		if err != nil {
			return fmt.Errorf("job %s: %w", job.ID, err)
		}
		evidence := map[string]any{"ci_passed": success}
		opStart := time.Now()
		res, err := coin.client.Verify(ctx, bid, evidence)
		if perfMetrics != nil {
			perfMetrics.Observe("coin_http_verify", time.Since(opStart), slowJobThreshold)
		}
		if err != nil {
			return err
		} else if res != nil && !res.Passed {
			return fmt.Errorf("verify failed bounty %s", bid)
		}
		opStart = time.Now()
		_, err = coin.client.Settle(ctx, bid)
		if perfMetrics != nil {
			perfMetrics.Observe("coin_http_settle", time.Since(opStart), slowJobThreshold)
		}
		if err == nil {
			updateCoinStatus(job.TaskID, "settled", "", bid)
		}
		return err
	default:
		return fmt.Errorf("unknown coin job kind: %s", job.Kind)
	}
}
