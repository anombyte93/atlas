package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
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
	Status     string         `json:"status"` // pending, running, done, failed
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
	ticker := time.NewTicker(2 * time.Second)
	for now := range ticker.C {
		due := q.Due(now)
		for _, job := range due {
			q.handle(job, coin, cfg)
		}
	}
}

func (q *CoinQueue) handle(job *CoinJob, coin CoinIntegration, cfg Config) {
	job.Attempts++
	job.Status = "running"
	q.Mark(job)

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
}

func (q *CoinQueue) dispatch(job *CoinJob, coin CoinIntegration, cfg Config) error {
	switch job.Kind {
	case JobPost:
		tid, _ := job.Payload["task_id"].(string)
		template, _ := job.Payload["template"].(string)
		reward, _ := job.Payload["reward"].(string)
		_, err := coin.client.PostBounty(context.Background(), coin.poster, template, reward)
		if err != nil {
			return err
		}
		// best-effort: update task in memory if exists
		if tid != "" {
			updateCoinStatus(tid, "posted", "", "")
		}
		return nil
	case JobSubmit:
		bid, _ := job.Payload["bounty_id"].(string)
		agent, _ := job.Payload["agent"].(string)
		stake, _ := job.Payload["stake"].(string)
		_, err := coin.client.SubmitSolution(context.Background(), bid, agent, stake, job.Payload)
		if err != nil {
			return err
		}
		updateCoinStatus(job.TaskID, "submitted", "", bid)
		return nil
	case JobSettle:
		bid, _ := job.Payload["bounty_id"].(string)
		success, _ := job.Payload["success"].(bool)
		evidence := map[string]any{"ci_passed": success}
		if res, err := coin.client.Verify(context.Background(), bid, evidence); err != nil {
			return err
		} else if res != nil && !res.Passed {
			return fmt.Errorf("verify failed bounty %s", bid)
		}
		_, err := coin.client.Settle(context.Background(), bid)
		if err == nil {
			updateCoinStatus(job.TaskID, "settled", "", bid)
		}
		return err
	default:
		return fmt.Errorf("unknown coin job kind: %s", job.Kind)
	}
}
