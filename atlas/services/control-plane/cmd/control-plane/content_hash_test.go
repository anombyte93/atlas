package main

import (
	"path/filepath"
	"testing"
)

func TestTaskContentHashStable(t *testing.T) {
	base := Task{Type: "shell", Command: "echo hi", TimeoutSec: 10}
	h1 := taskContentHash(base, "")
	h2 := taskContentHash(base, "")
	if h1 != h2 {
		t.Fatalf("hash not stable: %s vs %s", h1, h2)
	}
}

func TestTaskContentHashIncludesScriptBytes(t *testing.T) {
	// uses repo path with a small file under testdata
	base := Task{Type: "script", ScriptPath: "sample.sh", TimeoutSec: 5}
	h := taskContentHash(base, "testdata")
	if h == "" {
		t.Fatal("expected hash for script")
	}
}

func TestTaskContentHashRejectsMissingRepo(t *testing.T) {
	base := Task{Type: "script", ScriptPath: "sample.sh", TimeoutSec: 5}
	if h := taskContentHash(base, ""); h != "" {
		t.Fatalf("expected empty hash when worldRepo missing, got %s", h)
	}
}

func TestPersistRejectsOlderLeader(t *testing.T) {
	tmp := t.TempDir()
	store := &TaskStore{tasks: map[string]*Task{}, queued: map[string]struct{}{}, db: initDB(filepath.Join(tmp, "test.db"))}
	leaderEnabled = true
	leaderToken = 10
	newer := Task{ID: "t1", LeaderToken: 10}
	if err := store.persistTask(newer); err != nil {
		t.Fatalf("seed persist failed: %v", err)
	}
	older := Task{ID: "t1", LeaderToken: 9}
	if err := store.persistTask(older); err != ErrLeaderConflict {
		t.Fatalf("expected leader conflict, got %v", err)
	}
}
