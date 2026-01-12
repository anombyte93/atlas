package main

import (
	"time"
)

// reconcileCoinJobs scans tasks and enqueues missing coin jobs so that
// restarts or transient failures eventually recover.
func reconcileCoinJobs(coin CoinIntegration, store *TaskStore) {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		if !coin.enabled || coin.queue == nil {
			continue
		}
		store.mu.RLock()
		tasks := make([]*Task, 0, len(store.tasks))
		for _, t := range store.tasks {
			tasks = append(tasks, t)
		}
		store.mu.RUnlock()

		for _, t := range tasks {
			if t.CoinBountyID == "" && t.CoinStatus == "pending_post" {
				job := &CoinJob{
					ID:        "coin-post-" + t.ID,
					TaskID:    t.ID,
					Kind:      JobPost,
					Payload:   map[string]any{"task_id": t.ID, "template": t.Type, "reward": "0"},
					Status:    "pending",
					CreatedAt: time.Now(),
					NextRun:   time.Now(),
					RequestID: "post-" + t.ID,
				}
				coin.queue.Enqueue(job)
			}
			if t.CoinBountyID != "" && t.CoinStatus == "pending_submit" {
				job := &CoinJob{
					ID:        "coin-submit-" + t.ID,
					TaskID:    t.ID,
					Kind:      JobSubmit,
					Payload:   map[string]any{"bounty_id": t.CoinBountyID, "agent": t.ClaimedBy, "stake": "0"},
					Status:    "pending",
					CreatedAt: time.Now(),
					NextRun:   time.Now(),
					RequestID: "submit-" + t.ID,
				}
				coin.queue.Enqueue(job)
			}
		}
	}
}
