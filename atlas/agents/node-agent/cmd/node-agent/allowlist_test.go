package main

import "testing"

func TestIsCommandAllowed(t *testing.T) {
	allowed := []string{"echo", "ls"}
	if !isCommandAllowed("echo hello", allowed, false) {
		t.Fatal("expected echo to be allowed")
	}
	if isCommandAllowed("e", allowed, false) {
		t.Fatal("single-letter should not pass")
	}
	if isCommandAllowed("rm -rf /", allowed, false) {
		t.Fatal("rm should not pass")
	}
}
