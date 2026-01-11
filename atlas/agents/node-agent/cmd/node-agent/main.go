package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type AgentConfig struct {
	ID                string   `json:"id"`
	DeviceID          string   `json:"device_id"`
	Version           string   `json:"version"`
	ControlPlaneURL   string   `json:"control_plane_url"`
	APIToken          string   `json:"api_token"`
	HeartbeatInterval int      `json:"heartbeat_interval_sec"`
	TaskPollInterval  int      `json:"task_poll_interval_sec"`
	WorldRepoPath     string   `json:"world_repo_path"`
	Tags              []string `json:"tags"`
	Permissions       struct {
		ReadOnly    bool     `json:"read_only"`
		AllowedPath []string `json:"allowed_paths"`
	} `json:"permissions"`
}

type Capability struct {
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	CPUCores int      `json:"cpu_cores"`
	MemoryMB int      `json:"memory_mb"`
	GPU      string   `json:"gpu,omitempty"`
	Tags     []string `json:"tags,omitempty"`
}

type RegisterPayload struct {
	SchemaVersion string     `json:"schema_version"`
	DeviceID      string     `json:"device_id"`
	Hostname      string     `json:"hostname"`
	Roles         []string   `json:"roles"`
	Capabilities  Capability `json:"capabilities"`
}

type HeartbeatPayload struct {
	DeviceID     string     `json:"device_id"`
	Timestamp    string     `json:"timestamp"`
	Capabilities Capability `json:"capabilities"`
}

func main() {
	configPath := flag.String("config", "../../config/agents/local-agent.json", "Path to agent config JSON")
	dataDir := flag.String("data", "./data", "Data directory")
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		fatal("config load failed", err)
	}
	if envToken := os.Getenv("ATLAS_API_TOKEN"); envToken != "" {
		cfg.APIToken = envToken
	}
	currentToken = cfg.APIToken
	deviceID := cfg.DeviceID
	if deviceID == "" {
		deviceID = loadOrCreateDeviceID(*dataDir)
		cfg.DeviceID = deviceID
	}

	cap := discoverCapabilities(cfg.Tags)
	registerIfNeeded(cfg, cap)

	interval := time.Duration(cfg.HeartbeatInterval) * time.Second
	if interval < 5*time.Second {
		interval = 15 * time.Second
	}
	taskInterval := time.Duration(cfg.TaskPollInterval) * time.Second
	if taskInterval < 5*time.Second {
		taskInterval = 20 * time.Second
	}
	lastTaskPoll := time.Now().Add(-taskInterval)
	for {
		sendHeartbeat(cfg, cap)
		if time.Since(lastTaskPoll) >= taskInterval {
			lastTaskPoll = time.Now()
			pollAndExecute(cfg)
		}
		time.Sleep(interval)
	}
}

func loadConfig(path string) (AgentConfig, error) {
	var cfg AgentConfig
	f, err := os.Open(path)
	if err != nil {
		return cfg, err
	}
	defer f.Close()
	dec := json.NewDecoder(f)
	err = dec.Decode(&cfg)
	return cfg, err
}

func loadOrCreateDeviceID(dataDir string) string {
	if err := os.MkdirAll(dataDir, 0o755); err == nil {
		path := dataDir + "/device_id"
		if b, err := os.ReadFile(path); err == nil {
			id := strings.TrimSpace(string(b))
			if id != "" {
				return id
			}
		}
		id := "dev-" + randHex(8)
		_ = os.WriteFile(path, []byte(id), 0o600)
		return id
	}
	return "dev-" + randHex(8)
}

func randHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func discoverCapabilities(tags []string) Capability {
	return Capability{
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		CPUCores: runtime.NumCPU(),
		MemoryMB: detectMemoryMB(),
		Tags:     tags,
	}
}

func detectMemoryMB() int {
	if runtime.GOOS != "linux" {
		return 0
	}
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return atoi(fields[1]) / 1024
			}
		}
	}
	return 0
}

func atoi(s string) int {
	var n int
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func registerIfNeeded(cfg AgentConfig, cap Capability) {
	payload := RegisterPayload{
		SchemaVersion: "1.0.0",
		DeviceID:      cfg.DeviceID,
		Hostname:      hostname(),
		Roles:         []string{"server"},
		Capabilities:  cap,
	}
	_ = postJSON(cfg.ControlPlaneURL+"/register", payload)
}

func sendHeartbeat(cfg AgentConfig, cap Capability) {
	payload := HeartbeatPayload{
		DeviceID:     cfg.DeviceID,
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
		Capabilities: cap,
	}
	_ = postJSON(cfg.ControlPlaneURL+"/heartbeat", payload)
}

type Task struct {
	SchemaVersion string      `json:"schema_version"`
	ID            string      `json:"id"`
	Type          string      `json:"type"`
	Status        string      `json:"status"`
	Command       string      `json:"command,omitempty"`
	ScriptPath    string      `json:"script_path,omitempty"`
	TimeoutSec    int         `json:"timeout_sec"`
	RequiredTags  []string    `json:"required_tags,omitempty"`
	ClaimedBy     string      `json:"claimed_by,omitempty"`
	Result        *TaskResult `json:"result,omitempty"`
}

type TaskResult struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

func pollAndExecute(cfg AgentConfig) {
	reqBody := map[string]any{"tags": cfg.Tags, "agent_id": cfg.ID}
	resp, err := postJSONGet(cfg.ControlPlaneURL+"/tasks/claim", reqBody, cfg.APIToken)
	if err != nil || resp == nil {
		return
	}
	var task Task
	if err := json.Unmarshal(resp, &task); err != nil || task.ID == "" {
		return
	}
	if task.SchemaVersion == "" {
		task.SchemaVersion = "1.0.0"
	}
	result, status := executeTask(cfg, task)
	task.Status = status
	task.Result = result
	task.ClaimedBy = cfg.ID
	_, _ = postJSONGet(cfg.ControlPlaneURL+"/tasks/report", task, cfg.APIToken)
}

func executeTask(cfg AgentConfig, task Task) (*TaskResult, string) {
	timeout := time.Duration(task.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	var cmdStr string
	if task.Type == "shell" {
		cmdStr = task.Command
	} else if task.Type == "script" {
		if cfg.WorldRepoPath == "" {
			return &TaskResult{ExitCode: 1, Stderr: "world_repo_path not set"}, "failed"
		}
		if filepath.IsAbs(task.ScriptPath) || strings.Contains(task.ScriptPath, "..") {
			return &TaskResult{ExitCode: 1, Stderr: "invalid script path"}, "failed"
		}
		full := filepath.Join(cfg.WorldRepoPath, task.ScriptPath)
		if _, err := os.Stat(full); err != nil {
			return &TaskResult{ExitCode: 1, Stderr: "script not found"}, "failed"
		}
		cmdStr = full
	}
	if cmdStr == "" {
		return &TaskResult{ExitCode: 1, Stderr: "empty command"}, "failed"
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", cmdStr)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", cmdStr)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		exitCode = 1
	}
	status := "completed"
	if exitCode != 0 || ctx.Err() != nil {
		status = "failed"
	}
	return &TaskResult{ExitCode: exitCode, Stdout: stdout.String(), Stderr: stderr.String()}, status
}

func postJSON(url string, payload any) error {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if currentToken != "" {
		req.Header.Set("Authorization", "Bearer "+currentToken)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return nil
}

var currentToken string

func postJSONGet(url string, payload any, token string) ([]byte, error) {
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	return io.ReadAll(resp.Body)
}
func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}

func fatal(msg string, err error) {
	_, _ = os.Stderr.WriteString(msg + ": " + err.Error() + "\n")
	os.Exit(1)
}
