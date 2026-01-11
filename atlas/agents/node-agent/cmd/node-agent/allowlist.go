package main

import "strings"

func isCommandAllowed(cmd string, allowed []string, allowAll bool) bool {
	if allowAll {
		return true
	}
	for _, prefix := range allowed {
		if strings.HasPrefix(strings.TrimSpace(cmd), prefix) {
			return true
		}
	}
	return false
}
