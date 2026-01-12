package main

import "sync"

var coinStatusMu sync.Mutex

// updateCoinStatus is best-effort: updates in-memory Task and persists to DB.
func updateCoinStatus(taskID, status, errMsg, bountyID string) {
	coinStatusMu.Lock()
	defer coinStatusMu.Unlock()
	if taskStoreInstance == nil {
		return
	}
	taskStoreInstance.mu.Lock()
	defer taskStoreInstance.mu.Unlock()
	t, ok := taskStoreInstance.tasks[taskID]
	if !ok {
		return
	}
	if status != "" {
		t.CoinStatus = status
	}
	if errMsg != "" {
		t.CoinLastError = errMsg
	}
	if bountyID != "" {
		t.CoinBountyID = bountyID
	}
	_ = taskStoreInstance.persistTask(*t) // best-effort persist
}
