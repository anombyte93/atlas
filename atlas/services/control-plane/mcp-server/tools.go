package main

import (
	"encoding/json"
	"fmt"
)

func (s *MCPServer) ListTools() (map[string]interface{}, error) {
	return map[string]interface{}{
		"tools": []Tool{
			{
				Name:        "submit_task",
				Description: "Submit a new task to Atlas",
				InputSchema: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"type": map[string]interface{}{
							"type": "string",
							"enum": []string{"shell", "script"},
						},
						"command": map[string]interface{}{
							"type":        "string",
							"description": "Command to execute",
						},
					},
					"required": []string{"type", "command"},
				},
			},
			{
				Name:        "claim_task",
				Description: "Claim an available task from the queue",
				InputSchema: map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
			{
				Name:        "list_devices",
				Description: "List all registered devices",
				InputSchema: map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
			{
				Name:        "list_tasks",
				Description: "List all tasks in the queue",
				InputSchema: map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
	}, nil
}

func (s *MCPServer) CallTool(req MCPRequest) (map[string]interface{}, error) {
	params, ok := req.Params["arguments"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid arguments type")
	}

	toolName, ok := req.Params["name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid tool name type")
	}

	switch toolName {
	case "submit_task":
		return s.submitTask(params)
	case "claim_task":
		return s.claimTask(params)
	case "list_devices":
		return s.listDevices(params)
	case "list_tasks":
		return s.listTasks(params)
	default:
		return nil, fmt.Errorf("unknown tool: %s", toolName)
	}
}

func (s *MCPServer) submitTask(args map[string]interface{}) (map[string]interface{}, error) {
	// FIXED: Safe type assertions with error checking
	taskType, ok := args["type"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid type parameter")
	}

	command, ok := args["command"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid command parameter")
	}

	body := map[string]interface{}{
		"type":    taskType,
		"command": command,
	}

	// FIXED: jsonBody was undefined - properly marshal now
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	respBody, err := s.callControlPlane("/tasks/submit", jsonBody)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"content": []ToolContent{
			{
				Type: "text",
				Text: fmt.Sprintf("Task submitted: %v", result),
			},
		},
	}, nil
}

func (s *MCPServer) claimTask(args map[string]interface{}) (map[string]interface{}, error) {
	respBody, err := s.callControlPlane("/tasks/claim", []byte("{}"))
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"content": []ToolContent{
			{
				Type: "text",
				Text: fmt.Sprintf("Task claimed: %v", result),
			},
		},
	}, nil
}

func (s *MCPServer) listDevices(args map[string]interface{}) (map[string]interface{}, error) {
	respBody, err := s.callControlPlane("/devices", []byte("{}"))
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"content": []ToolContent{
			{
				Type: "text",
				Text: fmt.Sprintf("Devices: %v", result),
			},
		},
	}, nil
}

func (s *MCPServer) listTasks(args map[string]interface{}) (map[string]interface{}, error) {
	respBody, err := s.callControlPlane("/tasks/list", []byte("{}"))
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"content": []ToolContent{
			{
				Type: "text",
				Text: fmt.Sprintf("Tasks: %v", result),
			},
		},
	}, nil
}
