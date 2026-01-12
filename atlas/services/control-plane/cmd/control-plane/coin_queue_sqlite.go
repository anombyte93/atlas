package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	slowDBThreshold    = 200 * time.Millisecond
	slowJobThreshold   = 3 * time.Second
	coinRequestTimeout = 10 * time.Second
)

// CoinQueueSQLite manages coin jobs with durable SQLite persistence
type CoinQueueSQLite struct {
	mu  sync.Mutex
	db  *sql.DB
	log string // Legacy JSON path for migration
}

// NewCoinQueueSQLite creates a new SQLite-backed coin queue
func NewCoinQueueSQLite(dbPath, legacyPath string) (*CoinQueueSQLite, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open coin queue db: %w", err)
	}
	// Enable modest pooling for concurrent access with WAL.
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)
	db.SetConnMaxLifetime(15 * time.Minute)

	// Enable WAL for concurrent access
	if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
		return nil, fmt.Errorf("enable WAL: %w", err)
	}

	// Create coin_jobs table
	schema := `
	CREATE TABLE IF NOT EXISTS coin_jobs (
		id TEXT PRIMARY KEY,
		task_id TEXT NOT NULL,
		kind TEXT NOT NULL,
		payload TEXT NOT NULL,
		attempts INTEGER DEFAULT 0,
		max_attempt INTEGER DEFAULT 5,
		status TEXT NOT NULL,
		last_error TEXT,
		next_run TEXT,
		created_at TEXT NOT NULL,
		request_id TEXT
	);
	CREATE INDEX IF NOT EXISTS coin_jobs_status_idx ON coin_jobs(status);
	CREATE INDEX IF NOT EXISTS coin_jobs_next_run_idx ON coin_jobs(next_run);
	CREATE INDEX IF NOT EXISTS coin_jobs_task_id_idx ON coin_jobs(task_id);
	`
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("create coin_jobs table: %w", err)
	}

	q := &CoinQueueSQLite{
		db:  db,
		log: legacyPath,
	}

	// Migrate from JSON if exists
	if legacyPath != "" {
		if err := q.migrateFromJSON(); err != nil {
			// Log but don't fail - migration is best-effort
			fmt.Printf("coin queue migration warning: %v\n", err)
		}
		// Remove legacy file after successful migration
		_ = os.Remove(legacyPath)
	}

	return q, nil
}

// migrateFromJSON loads jobs from legacy JSON file into SQLite
func (q *CoinQueueSQLite) migrateFromJSON() error {
	if q.log == "" {
		return nil
	}
	data, err := os.ReadFile(q.log)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var entries []*CoinJob
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	toInsert := make([]*CoinJob, 0, len(entries))
	for _, j := range entries {
		// Check if already migrated
		var exists bool
		err := q.db.QueryRow("SELECT 1 FROM coin_jobs WHERE id = ?", j.ID).Scan(&exists)
		if err == nil {
			continue // Already exists
		}
		if err != sql.ErrNoRows {
			return err
		}

		prepareJobDefaults(j)
		toInsert = append(toInsert, j)
	}

	if len(toInsert) > 0 {
		if err := q.insertJobsBatch(toInsert); err != nil {
			return err
		}
	}

	return nil
}

// prepareJobDefaults ensures required fields are set before insertion.
func prepareJobDefaults(j *CoinJob) {
	if j.RequestID == "" {
		j.RequestID = j.ID
	}
	if j.MaxAttempt == 0 {
		j.MaxAttempt = 5 // Default max attempts
	}
	if j.CreatedAt.IsZero() {
		j.CreatedAt = time.Now().UTC()
	}
}

// insertJobsBatch inserts multiple jobs in a single transaction.
func (q *CoinQueueSQLite) insertJobsBatch(jobs []*CoinJob) error {
	start := time.Now()
	tx, err := q.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`
		INSERT INTO coin_jobs (id, task_id, kind, payload, attempts, max_attempt, status, last_error, next_run, created_at, request_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status=excluded.status,
			attempts=excluded.attempts,
			last_error=excluded.last_error,
			next_run=excluded.next_run
	`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, j := range jobs {
		payload, _ := json.Marshal(j.Payload)
		var nextRunPtr *string
		if !j.NextRun.IsZero() {
			s := j.NextRun.UTC().Format(time.RFC3339)
			nextRunPtr = &s
		}
		if _, err := stmt.Exec(
			j.ID, j.TaskID, string(j.Kind), string(payload), j.Attempts, j.MaxAttempt,
			j.Status, j.LastError, nextRunPtr, j.CreatedAt.UTC().Format(time.RFC3339), j.RequestID,
		); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	if perfMetrics != nil {
		perfMetrics.Observe("coin_queue_batch_insert", time.Since(start), slowDBThreshold)
	}
	return nil
}

// insertJob inserts a job into the database
func (q *CoinQueueSQLite) insertJob(j *CoinJob) error {
	start := time.Now()
	payload, _ := json.Marshal(j.Payload)
	var nextRunPtr *string
	if !j.NextRun.IsZero() {
		s := j.NextRun.UTC().Format(time.RFC3339)
		nextRunPtr = &s
	}

	_, err := q.db.Exec(`
		INSERT INTO coin_jobs (id, task_id, kind, payload, attempts, max_attempt, status, last_error, next_run, created_at, request_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status=excluded.status,
			attempts=excluded.attempts,
			last_error=excluded.last_error,
			next_run=excluded.next_run
	`,
		j.ID, j.TaskID, string(j.Kind), string(payload), j.Attempts, j.MaxAttempt,
		j.Status, j.LastError, nextRunPtr, j.CreatedAt.UTC().Format(time.RFC3339), j.RequestID,
	)
	if perfMetrics != nil {
		perfMetrics.Observe("coin_queue_single_insert", time.Since(start), slowDBThreshold)
	}
	return err
}

// Enqueue adds a job to the queue
func (q *CoinQueueSQLite) Enqueue(job *CoinJob) {
	q.EnqueueBatch([]*CoinJob{job})
}

// EnqueueBatch adds multiple jobs in one transaction for throughput.
func (q *CoinQueueSQLite) EnqueueBatch(jobs []*CoinJob) {
	if len(jobs) == 0 {
		return
	}
	q.mu.Lock()
	defer q.mu.Unlock()

	for _, job := range jobs {
		prepareJobDefaults(job)
	}

	if len(jobs) == 1 {
		if err := q.insertJob(jobs[0]); err != nil {
			fmt.Printf("coin queue enqueue error: %v\n", err)
		}
		return
	}

	if err := q.insertJobsBatch(jobs); err != nil {
		fmt.Printf("coin queue enqueue batch error: %v\n", err)
	}
}

// Mark updates a job's status in the queue
func (q *CoinQueueSQLite) Mark(job *CoinJob) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if err := q.insertJob(job); err != nil {
		fmt.Printf("coin queue mark error: %v\n", err)
	}
}

// Due returns all jobs that are due to run
func (q *CoinQueueSQLite) Due(now time.Time) []*CoinJob {
	q.mu.Lock()
	defer q.mu.Unlock()

	start := time.Now()
	rows, err := q.db.Query(`
		SELECT id, task_id, kind, payload, attempts, max_attempt, status, last_error, next_run, created_at, request_id
		FROM coin_jobs
		WHERE status != 'done' AND (next_run IS NULL OR next_run <= ?)
		ORDER BY created_at ASC
	`, now.UTC().Format(time.RFC3339))
	if err != nil {
		return nil
	}
	defer rows.Close()

	var jobs []*CoinJob
	for rows.Next() {
		j, err := q.scanJob(rows)
		if err != nil {
			continue
		}
		jobs = append(jobs, j)
	}

	if rows.Err() != nil {
		return nil
	}
	if perfMetrics != nil {
		perfMetrics.Observe("coin_queue_due_query", time.Since(start), slowDBThreshold)
	}
	return jobs
}

// scanJob scans a row into a CoinJob
func (q *CoinQueueSQLite) scanJob(rows *sql.Rows) (*CoinJob, error) {
	var j CoinJob
	var kindStr, payloadStr, nextRunStr, createdAtStr string
	var nextRunPtr, requestIDPtr *string

	err := rows.Scan(
		&j.ID, &j.TaskID, &kindStr, &payloadStr, &j.Attempts, &j.MaxAttempt,
		&j.Status, &j.LastError, &nextRunPtr, &createdAtStr, &requestIDPtr,
	)
	if err != nil {
		return nil, err
	}

	j.Kind = CoinJobKind(kindStr)
	if err := json.Unmarshal([]byte(payloadStr), &j.Payload); err != nil {
		return nil, err
	}

	j.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)

	if nextRunPtr != nil {
		nextRunStr = *nextRunPtr
		j.NextRun, _ = time.Parse(time.RFC3339, nextRunStr)
	}

	if requestIDPtr != nil {
		j.RequestID = *requestIDPtr
	}

	return &j, nil
}

// GetByTaskID returns all jobs for a task
func (q *CoinQueueSQLite) GetByTaskID(taskID string) ([]*CoinJob, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	rows, err := q.db.Query(`
		SELECT id, task_id, kind, payload, attempts, max_attempt, status, last_error, next_run, created_at, request_id
		FROM coin_jobs
		WHERE task_id = ?
		ORDER BY created_at ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*CoinJob
	for rows.Next() {
		j, err := q.scanJob(rows)
		if err != nil {
			continue
		}
		jobs = append(jobs, j)
	}

	return jobs, rows.Err()
}

// Delete removes a job from the queue
func (q *CoinQueueSQLite) Delete(id string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	_, err := q.db.Exec("DELETE FROM coin_jobs WHERE id = ?", id)
	return err
}

// CleanupOld removes completed/failed jobs older than the given duration
func (q *CoinQueueSQLite) CleanupOld(olderThan time.Duration) (int64, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	cutoff := time.Now().UTC().Add(-olderThan).Format(time.RFC3339)

	res, err := q.db.Exec(`
		DELETE FROM coin_jobs
		WHERE status IN ('done', 'failed') AND next_run IS NULL AND created_at < ?
	`, cutoff)
	if err != nil {
		return 0, err
	}

	return res.RowsAffected()
}

// Close closes the database connection
func (q *CoinQueueSQLite) Close() error {
	return q.db.Close()
}

// WorkerLoop processes due jobs with retry/backoff. It runs forever.
func (q *CoinQueueSQLite) WorkerLoop(coin CoinIntegration, cfg Config) {
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

// claim marks a job as running so concurrent workers don't double-process it.
func (q *CoinQueueSQLite) claim(job *CoinJob) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	var status string
	err := q.db.QueryRow("SELECT status FROM coin_jobs WHERE id = ?", job.ID).Scan(&status)
	if err != nil {
		return false
	}
	if status == "running" {
		return false
	}
	job.Attempts++
	job.Status = "running"
	job.LastError = ""
	job.NextRun = time.Time{}
	if err := q.insertJob(job); err != nil {
		fmt.Printf("coin queue claim error: %v\n", err)
		return false
	}
	return true
}

func (q *CoinQueueSQLite) handle(job *CoinJob, coin CoinIntegration, cfg Config) {
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

func (q *CoinQueueSQLite) dispatch(job *CoinJob, coin CoinIntegration, cfg Config) error {
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
		if tid != "" {
			updateCoinStatus(tid, "posted", "", "")
		}
		return nil
	case JobSubmit:
		bid, _ := job.Payload["bounty_id"].(string)
		agent, _ := job.Payload["agent"].(string)
		stake, _ := job.Payload["stake"].(string)
		opStart := time.Now()
		_, err := coin.client.SubmitSolution(ctx, bid, agent, stake, job.Payload)
		if perfMetrics != nil {
			perfMetrics.Observe("coin_http_submit_solution", time.Since(opStart), slowJobThreshold)
		}
		if err != nil {
			return err
		}
		updateCoinStatus(job.TaskID, "submitted", "", bid)
		return nil
	case JobSettle:
		bid, _ := job.Payload["bounty_id"].(string)
		evidence := BuildEvidence(job.Payload)
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

// Context returns a background context for job execution
func (j *CoinJob) Context() context.Context {
	return context.Background()
}
