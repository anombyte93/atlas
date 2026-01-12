package main

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"
)

func (s *MCPServer) authenticateRequest() (string, error) {
	// FIXED: Read token from file, not environment (security fix)
	tokenData, err := os.ReadFile(s.tokenFile)
	if err != nil {
		return "", fmt.Errorf("failed to read token file: %w", err)
	}

	token := strings.TrimSpace(string(tokenData))
	if token == "" {
		return "", fmt.Errorf("token is empty")
	}

	return token, nil
}

func (s *MCPServer) callControlPlane(endpoint string, body []byte) ([]byte, error) {
	token, err := s.authenticateRequest()
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", s.controlPlaneURL+endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("control-plane returned status %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
