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
	if isCommandAllowed("$HOME/bin/tool", allowed, false) {
		t.Fatal("env var path should still be blocked unless allowlisted")
	}
	if isCommandAllowed("sh -c 'echo hi'", allowed, false) {
		t.Fatal("shell wrapper should not pass")
	}
	if isCommandAllowed("echo hi && ls", allowed, false) {
		t.Fatal("chained command should not pass")
	}
	if isCommandAllowed("echo $(uname)", allowed, false) {
		t.Fatal("subshell should not pass")
	}
	if isCommandAllowed("cat <(ls)", allowed, false) {
		t.Fatal("process substitution should not pass")
	}
	if isCommandAllowed("bash -c 'whoami'", allowed, true) {
		t.Fatal("allowAll should still block shell wrappers")
	}
	if isCommandAllowed("echo hi", allowed, true) == false {
		t.Fatal("allowAll should bypass allowlist after safety filters")
	}
}
