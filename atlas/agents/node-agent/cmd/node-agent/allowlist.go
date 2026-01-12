package main

import "strings"

func isCommandAllowed(cmd string, allowed []string, allowAll bool) bool {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return false
	}

	first := strings.Fields(cmd)[0]

	// baseline safety filters always apply, even when allowAll is set
	if strings.Contains(cmd, "&&") || strings.Contains(cmd, "||") || strings.Contains(cmd, "\n") {
		return false
	}
	if strings.ContainsAny(cmd, "&;|`\n") {
		return false
	}
	if strings.Contains(cmd, "$(") || strings.Contains(cmd, "<(") || strings.Contains(cmd, ">(") {
		return false
	}

	// block generic shell wrappers unless explicitly allowlisted later
	if first == "sh" || first == "bash" || first == "zsh" || first == "fish" {
		return false
	}

	if allowAll {
		return true
	}

	// explicit allowlist after safety filters
	for _, a := range allowed {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		if first == a {
			return true
		}
	}

	return false
}
