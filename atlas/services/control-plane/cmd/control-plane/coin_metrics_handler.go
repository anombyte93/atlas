package main

import (
	"encoding/json"
	"net/http"
	"sync/atomic"
)

func handleCoinMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET required")
		return
	}
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
