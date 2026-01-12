package main

import (
	"fmt"
	"log"
	"time"
)

const (
	maxSettleAttempts = 3
	settleRetryDelay  = 5 * time.Minute
	jobCleanupAge     = 24 * time.Hour
)

// Reconciler tracks and repairs coin operations across restarts/failures
type Reconciler struct {
	coin  CoinIntegration
	store *TaskStore
	queue *CoinQueueSQLite
}

// NewReconciler creates a new reconciler
func NewReconciler(coin CoinIntegration, store *TaskStore, queue *CoinQueueSQLite) *Reconciler {
	return &Reconciler{
		coin:  coin,
		store: store,
		queue: queue,
	}
}

// Run starts the reconciliation loop
func (r *Reconciler) Run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Initial reconciliation on startup
	r.reconcileOnce()

	for range ticker.C {
		if !r.coin.enabled || r.queue == nil {
			continue
		}
		r.reconcileOnce()
	}
}

// reconcileOnce performs a single reconciliation pass
func (r *Reconciler) reconcileOnce() {
	// 1. Reconcile tasks needing coin operations
	r.reconcileTaskCoinStatus()

	// 2. Reconcile stuck settle jobs
	r.reconcileStuckSettles()

	// 3. Cleanup old completed jobs
	r.cleanupOldJobs()
}

// reconcileTaskCoinStatus enqueues missing coin jobs based on task state
func (r *Reconciler) reconcileTaskCoinStatus() {
	r.store.mu.RLock()
	tasks := make([]*Task, 0, len(r.store.tasks))
	for _, t := range r.store.tasks {
		tasks = append(tasks, t)
	}
	r.store.mu.RUnlock()

	for _, t := range tasks {
		// Skip if coin is disabled for this task type
		if !r.coin.enabled {
			continue
		}

		// Reconcile: task queued but no bounty posted
		if t.CoinBountyID == "" && (t.CoinStatus == "" || t.CoinStatus == "pending_post") {
			// Check if post job already exists
			jobs, _ := r.queue.GetByTaskID(t.ID)
			alreadyQueued := false
			for _, j := range jobs {
				if j.Kind == JobPost && j.Status != "done" && j.Status != "failed" {
					alreadyQueued = true
					break
				}
			}
			if !alreadyQueued {
				job := &CoinJob{
					ID:        "coin-post-" + t.ID,
					TaskID:    t.ID,
					Kind:      JobPost,
					Payload:   map[string]any{"task_id": t.ID, "template": t.Type, "reward": fmt.Sprintf("%d", r.coin.reward)},
					Status:    "pending",
					CreatedAt: time.Now().UTC(),
					NextRun:   time.Now().UTC(),
					RequestID: "post-" + t.ID,
				}
				r.queue.Enqueue(job)
				updateCoinStatus(t.ID, "pending_post", "", "")
			}
		}

		// Reconcile: bounty posted but not submitted
		if t.CoinBountyID != "" && t.ClaimedBy != "" && (t.CoinStatus == "posted" || t.CoinStatus == "pending_submit") {
			// Only submit if task is running or completed
			if t.Status == string(StateRunning) || t.Status == string(StateCompleted) {
				jobs, _ := r.queue.GetByTaskID(t.ID)
				alreadyQueued := false
				for _, j := range jobs {
					if j.Kind == JobSubmit && j.Status != "done" && j.Status != "failed" {
						alreadyQueued = true
						break
					}
				}
				if !alreadyQueued {
					job := &CoinJob{
						ID:        "coin-submit-" + t.ID,
						TaskID:    t.ID,
						Kind:      JobSubmit,
						Payload:   map[string]any{"bounty_id": t.CoinBountyID, "agent": t.ClaimedBy, "stake": fmt.Sprintf("%d", (r.coin.reward*r.coin.stakePct)/100)},
						Status:    "pending",
						CreatedAt: time.Now().UTC(),
						NextRun:   time.Now().UTC(),
						RequestID: "submit-" + t.ID,
					}
					r.queue.Enqueue(job)
					updateCoinStatus(t.ID, "pending_submit", "", "")
				}
			}
		}

		// Reconcile: task completed but not settled
		if t.CoinBountyID != "" && (t.Status == string(StateCompleted) || t.Status == string(StateFailed)) {
			if t.CoinStatus == "submitted" || t.CoinStatus == "pending_settle" || t.CoinStatus == "settle_failed" {
				jobs, _ := r.queue.GetByTaskID(t.ID)
				alreadyQueued := false
				for _, j := range jobs {
					if j.Kind == JobSettle && j.Status != "done" && j.Status != "failed" {
						alreadyQueued = true
						break
					}
				}
				if !alreadyQueued {
					job := &CoinJob{
						ID:         "coin-settle-" + t.ID,
						TaskID:     t.ID,
						Kind:       JobSettle,
						MaxAttempt: maxSettleAttempts,
						Payload: map[string]any{
							"bounty_id": t.CoinBountyID,
							"success":   t.Status == string(StateCompleted),
							"task_id":   t.ID,
							"task_type": t.Type,
						},
						Status:    "pending",
						CreatedAt: time.Now().UTC(),
						NextRun:   time.Now().UTC(),
						RequestID: "settle-" + t.ID,
					}
					r.queue.Enqueue(job)
					updateCoinStatus(t.ID, "pending_settle", "", "")
				}
			}
		}
	}
}

// reconcileStuckSettles retries failed settle operations with age-based backoff
func (r *Reconciler) reconcileStuckSettles() {
	// Find all settle jobs that failed or are stuck
	r.store.mu.RLock()
	defer r.store.mu.RUnlock()

	for _, t := range r.store.tasks {
		// Look for tasks with failed settle
		if t.CoinStatus == "settle_failed" || t.CoinStatus == "verify_failed" {
			// Check when it failed
			var failedAt time.Time
			if t.UpdatedAt != "" {
				failedAt, _ = time.Parse(time.RFC3339, t.UpdatedAt)
			}

			// Retry if enough time has passed
			if !failedAt.IsZero() && time.Since(failedAt) > settleRetryDelay {
				// Check existing jobs
				jobs, _ := r.queue.GetByTaskID(t.ID)
				hasPendingSettle := false
				for _, j := range jobs {
					if j.Kind == JobSettle && (j.Status == "pending" || j.Status == "running") {
						hasPendingSettle = true
						break
					}
				}

				if !hasPendingSettle {
					job := &CoinJob{
						ID:         "coin-settle-" + t.ID,
						TaskID:     t.ID,
						Kind:       JobSettle,
						MaxAttempt: maxSettleAttempts,
						Payload: map[string]any{
							"bounty_id": t.CoinBountyID,
							"success":   t.Status == string(StateCompleted),
							"task_id":   t.ID,
							"task_type": t.Type,
						},
						Status:    "pending",
						CreatedAt: time.Now().UTC(),
						NextRun:   time.Now().UTC(),
						RequestID: "settle-" + t.ID,
					}
					r.queue.Enqueue(job)
					log.Printf("reconcile: retry settle for task %s after failure", t.ID)
					updateCoinStatus(t.ID, "pending_settle", "", "")
				}
			}
		}
	}
}

// cleanupOldJobs removes completed/failed jobs older than jobCleanupAge
func (r *Reconciler) cleanupOldJobs() {
	deleted, err := r.queue.CleanupOld(jobCleanupAge)
	if err != nil {
		log.Printf("reconcile: cleanup old jobs error: %v", err)
	} else if deleted > 0 {
		log.Printf("reconcile: cleaned up %d old coin jobs", deleted)
	}
}

// reconcileCoinJobs scans tasks and enqueues missing coin jobs so that
// restarts or transient failures eventually recover.
//
// DEPRECATED: Use Reconciler.Run() instead. This function is kept for
// backwards compatibility during migration.
func reconcileCoinJobs(coin CoinIntegration, store *TaskStore) {
	reconciler := &Reconciler{
		coin:  coin,
		store: store,
		queue: nil, // Will use legacy queue
	}
	reconciler.reconcileTaskCoinStatus()
}
