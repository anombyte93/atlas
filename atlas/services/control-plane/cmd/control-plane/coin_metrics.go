package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"
)

// CoinMetricsDB handles persistent coin operation metrics
type CoinMetricsDB struct {
	db *sql.DB
}

// LogCoinOperation records a coin operation to the database
func LogCoinOperation(db *sql.DB, operation string, success bool, taskID, bountyID string, errMsg string) {
	if db == nil {
		return
	}
	_, err := db.Exec(`
		INSERT INTO coin_metrics (timestamp, operation, success, task_id, bounty_id, error_message)
		VALUES (?, ?, ?, ?, ?, ?)
	`, time.Now().UTC().Format(time.RFC3339), operation, boolToInt(success), taskID, bountyID, errMsg)
	if err != nil {
		// Log but don't fail - metrics are best-effort
		println("coin metrics log error:", err.Error())
	}
}

// boolToInt converts bool to int (1 for true, 0 for false)
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// GetCoinMetricsHistory retrieves historical metrics from the database
func GetCoinMetricsHistory(db *sql.DB, since time.Time) ([]map[string]any, error) {
	if db == nil {
		return nil, nil
	}

	rows, err := db.Query(`
		SELECT timestamp, operation, success, task_id, bounty_id, error_message
		FROM coin_metrics
		WHERE timestamp >= ?
		ORDER BY timestamp DESC
		LIMIT 1000
	`, since.UTC().Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]any
	for rows.Next() {
		var timestamp, operation, taskID, bountyID, errMsg string
		var successInt int

		if err := rows.Scan(&timestamp, &operation, &successInt, &taskID, &bountyID, &errMsg); err != nil {
			continue
		}

		results = append(results, map[string]any{
			"timestamp":     timestamp,
			"operation":     operation,
			"success":       successInt == 1,
			"task_id":       taskID,
			"bounty_id":     bountyID,
			"error_message": errMsg,
		})
	}

	return results, rows.Err()
}

func handleCoinMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET required")
		return
	}

	// Check for history query parameter
	historyParam := r.URL.Query().Get("history")
	if historyParam != "" {
		// Parse duration or return last 24 hours
		var since time.Time
		if duration, err := time.ParseDuration(historyParam); err == nil {
			since = time.Now().UTC().Add(-duration)
		} else {
			since = time.Now().UTC().Add(-24 * time.Hour)
		}

		if taskStoreInstance != nil && taskStoreInstance.db != nil {
			history, err := GetCoinMetricsHistory(taskStoreInstance.db, since)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "db_error", "failed to fetch metrics history")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"since":    since.Format(time.RFC3339),
				"history":  history,
				"in_memory": map[string]uint64{
					"post_ok":     atomic.LoadUint64(&coinMetrics.postOK),
					"post_fail":   atomic.LoadUint64(&coinMetrics.postFail),
					"submit_ok":   atomic.LoadUint64(&coinMetrics.submitOK),
					"submit_fail": atomic.LoadUint64(&coinMetrics.submitFail),
					"verify_ok":   atomic.LoadUint64(&coinMetrics.verifyOK),
					"verify_fail": atomic.LoadUint64(&coinMetrics.verifyFail),
					"settle_ok":   atomic.LoadUint64(&coinMetrics.settleOK),
					"settle_fail": atomic.LoadUint64(&coinMetrics.settleFail),
				},
			})
			return
		}
	}

	// Default: return in-memory metrics
	metrics := map[string]uint64{
		"post_ok":     atomic.LoadUint64(&coinMetrics.postOK),
		"post_fail":   atomic.LoadUint64(&coinMetrics.postFail),
		"submit_ok":   atomic.LoadUint64(&coinMetrics.submitOK),
		"submit_fail": atomic.LoadUint64(&coinMetrics.submitFail),
		"verify_ok":   atomic.LoadUint64(&coinMetrics.verifyOK),
		"verify_fail": atomic.LoadUint64(&coinMetrics.verifyFail),
		"settle_ok":   atomic.LoadUint64(&coinMetrics.settleOK),
		"settle_fail": atomic.LoadUint64(&coinMetrics.settleFail),
	}
	_ = json.NewEncoder(w).Encode(metrics)
}

// Update coin operation functions to log to database
// These functions are integrated into the existing coin operations in main.go
// via the LogCoinOperation helper function
