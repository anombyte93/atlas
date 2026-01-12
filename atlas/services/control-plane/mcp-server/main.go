package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

type MCPServer struct {
	controlPlaneURL string
	tokenFile       string
	client          *http.Client
}

type MCPRequest struct {
	Jsonrpc string                 `json:"jsonrpc"`
	ID      interface{}            `json:"id,omitempty"`
	Method  string                 `json:"method"`
	Params  map[string]interface{} `json:"params,omitempty"`
}

type MCPResponse struct {
	Jsonrpc string      `json:"jsonrpc"`
	ID      interface{} `json:"id,omitempty"`
	Result  interface{} `json:"result,omitempty"`
	Error   *MCPError   `json:"error,omitempty"`
}

type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func main() {
	tokenFile := os.Getenv("ATLAS_API_TOKEN_FILE")
	if tokenFile == "" {
		tokenFile = os.Getenv("HOME") + "/.secrets/atlas-token"
	}

	server := &MCPServer{
		controlPlaneURL: os.Getenv("ATLAS_CONTROL_PLANE_URL"),
		tokenFile:       tokenFile,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// MCP stdio protocol
	encoder := json.NewEncoder(os.Stdout)
	decoder := json.NewDecoder(os.Stdin)

	go func() {
		<-sigChan
		log.Println("Shutting down MCP server...")
		os.Exit(0)
	}()

	for {
		var request MCPRequest
		if err := decoder.Decode(&request); err != nil {
			if err != io.EOF {
				log.Printf("Decode error: %v", err)
			}
			continue
		}

		response := server.HandleRequest(request)
		if err := encoder.Encode(response); err != nil {
			log.Printf("Encode error: %v", err)
		}
	}
}

func (s *MCPServer) HandleRequest(req MCPRequest) MCPResponse {
	resp := MCPResponse{
		Jsonrpc: req.Jsonrpc,
		ID:      req.ID,
	}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"serverInfo": map[string]interface{}{
				"name":    "atlas-control-plane",
				"version": "0.1.0",
			},
			"capabilities": map[string]interface{}{
				"tools": map[string]interface{}{},
			},
		}
	case "tools/list":
		result, err := s.ListTools()
		if err != nil {
			resp.Error = &MCPError{Code: -32603, Message: err.Error()}
		} else {
			resp.Result = result
		}
	case "tools/call":
		result, err := s.CallTool(req)
		if err != nil {
			resp.Error = &MCPError{Code: -32603, Message: err.Error()}
		} else {
			resp.Result = result
		}
	default:
		resp.Error = &MCPError{Code: -32601, Message: fmt.Sprintf("Method not found: %s", req.Method)}
	}

	return resp
}
