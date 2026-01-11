package main

import "strings"

func isCommandAllowed(cmd string, allowed []string, allowAll bool) bool {
	if allowAll {
		return true
	}
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return false
	}
	first := strings.Fields(cmd)[0]
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
