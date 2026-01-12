package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

// Evidence represents structured verification evidence for a task result
type Evidence struct {
	ExitCode        int              `json:"exit_code"`
	Success         bool             `json:"success"`
	ContentHash     string           `json:"content_hash,omitempty"`
	StdoutHash      string           `json:"stdout_hash,omitempty"`
	StderrHash      string           `json:"stderr_hash,omitempty"`
	DurationSeconds int              `json:"duration_seconds,omitempty"`
	TaskType        string           `json:"task_type"`
	Tags            []string         `json:"tags,omitempty"`
	Timestamp       string           `json:"timestamp"`
	Metadata        map[string]any   `json:"metadata,omitempty"`
}

// BuildEvidence constructs structured evidence from task result and metadata
func BuildEvidence(payload map[string]any) map[string]any {
	evidence := make(map[string]any)

	// Basic task info
	if taskID, ok := payload["task_id"].(string); ok {
		evidence["task_id"] = taskID
	}
	if taskType, ok := payload["task_type"].(string); ok {
		evidence["task_type"] = taskType
	}

	// CI result
	if success, ok := payload["success"].(bool); ok {
		evidence["ci_passed"] = success
	}

	// Exit code
	if exitCode, ok := payload["exit_code"].(int); ok {
		evidence["exit_code"] = exitCode
	}

	// Content hashes
	if h, ok := payload["content_hash"].(string); ok {
		evidence["content_hash"] = h
	}
	if h, ok := payload["stdout_hash"].(string); ok {
		evidence["stdout_hash"] = h
	}
	if h, ok := payload["stderr_hash"].(string); ok {
		evidence["stderr_hash"] = h
	}

	// Duration
	if duration, ok := payload["duration_seconds"].(int); ok {
		evidence["duration_seconds"] = duration
	} else if duration, ok := payload["duration_seconds"].(float64); ok {
		evidence["duration_seconds"] = int(duration)
	}

	// Timestamp
	evidence["verified_at"] = time.Now().UTC().Format(time.RFC3339)

	return evidence
}

// BuildEvidenceFromTask constructs evidence from a completed Task
func BuildEvidenceFromTask(t *Task) map[string]any {
	if t.Result == nil {
		return BuildEvidence(map[string]any{
			"task_id":   t.ID,
			"task_type": t.Type,
			"success":   false,
		})
	}

	evidence := BuildEvidence(map[string]any{
		"task_id":      t.ID,
		"task_type":    t.Type,
		"success":      t.Status == string(StateCompleted),
		"exit_code":    t.Result.ExitCode,
		"content_hash": t.ContentHash,
	})

	// Compute hashes for stdout/stderr
	if t.Result.Stdout != "" {
		evidence["stdout_hash"] = hashString(t.Result.Stdout)
	}
	if t.Result.Stderr != "" {
		evidence["stderr_hash"] = hashString(t.Result.Stderr)
	}

	// Duration estimation from timestamps
	if t.UpdatedAt != "" && t.ClaimedBy != "" {
		if updated, err := time.Parse(time.RFC3339, t.UpdatedAt); err == nil {
			if created, err := time.Parse(time.RFC3339, t.CreatedAt); err == nil {
				duration := int(updated.Sub(created).Seconds())
				if duration > 0 {
					evidence["duration_seconds"] = duration
				}
			}
		}
	}

	// Tags
	if len(t.RequiredTags) > 0 {
		evidence["tags"] = t.RequiredTags
	}

	return evidence
}

// hashString computes SHA256 hash of a string
func hashString(s string) string {
	if s == "" {
		return ""
	}
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))[:16] // Truncate for readability
}

// ValidateEvidence checks if evidence meets verification criteria
func ValidateEvidence(evidence map[string]any, template string) (bool, string) {
	// Check CI passed flag
	ciPassed, ok := evidence["ci_passed"].(bool)
	if !ok || !ciPassed {
		return false, "ci_passed not true"
	}

	// Check exit code is 0 for success
	exitCode, _ := evidence["exit_code"].(int)
	if exitCode != 0 {
		return false, fmt.Sprintf("non-zero exit code: %d", exitCode)
	}

	// Template-specific validation
	switch template {
	case "shell":
		// Shell tasks require exit_code check
		if exitCode != 0 {
			return false, fmt.Sprintf("shell task failed with exit code %d", exitCode)
		}
	case "script":
		// Script tasks require content hash
		if _, ok := evidence["content_hash"].(string); !ok {
			return false, "script task missing content hash"
		}
	}

	return true, ""
}
