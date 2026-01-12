package main

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

type ToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
