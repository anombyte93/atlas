package main

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	ListenAddr   string `json:"listen_addr"`
	DataDir      string `json:"data_dir"`
	ConfigPath   string `json:"config_path"`
	WorldRepo    string `json:"world_repo_path"`
	AllowedRoles []string `json:"allowed_roles"`
}

type Registry struct {
	mu      sync.RWMutex
	devices map[string]*Device
}

type Device struct {
	DeviceID     string     `json:"device_id"`
	Hostname     string     `json:"hostname"`
	Roles        []string   `json:"roles"`
	Capabilities Capability `json:"capabilities"`
	LastSeen     string     `json:"last_seen"`
}

type Capability struct {
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	CPUCores int      `json:"cpu_cores"`
	MemoryMB int      `json:"memory_mb"`
	Tags     []string `json:"tags"`
}

type Task struct {
	ID           string   `json:"id"`
	Type         string   `json:"type"`
	Status       string   `json:"status"`
	Command      string   `json:"command,omitempty"`
	ScriptPath   string   `json:"script_path,omitempty"`
	TimeoutSec   int      `json:"timeout_sec"`
	RequiredTags []string `json:"required_tags,omitempty"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
	Result       *TaskResult `json:"result,omitempty"`
}

type TaskResult struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type TaskStore struct {
	mu    sync.RWMutex
	tasks map[string]*Task
	logPath string
}

func main() {
	cfg := loadConfig("../../config/control-plane.json")
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":8080"
	}
	if cfg.DataDir == "" {
		cfg.DataDir = "./data"
	}
	_ = os.MkdirAll(cfg.DataDir, 0o755)
	registry := &Registry{devices: map[string]*Device{}}
	store := &TaskStore{tasks: map[string]*Task{}, logPath: filepath.Join(cfg.DataDir, "tasks.jsonl")}
	store.loadFromLog()

	go watchConfig(cfg.ConfigPath, func() {
		newCfg := loadConfig(cfg.ConfigPath)
		if newCfg.ListenAddr != "" {
			cfg.ListenAddr = newCfg.ListenAddr
		}
		if newCfg.WorldRepo != "" {
			cfg.WorldRepo = newCfg.WorldRepo
		}
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) { handleRegister(w, r, registry) })
	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) { handleHeartbeat(w, r, registry) })
	mux.HandleFunc("/devices", func(w http.ResponseWriter, r *http.Request) { handleListDevices(w, r, registry) })
	mux.HandleFunc("/tasks/submit", func(w http.ResponseWriter, r *http.Request) { handleSubmitTask(w, r, store) })
	mux.HandleFunc("/tasks/claim", func(w http.ResponseWriter, r *http.Request) { handleClaimTask(w, r, store) })
	mux.HandleFunc("/tasks/report", func(w http.ResponseWriter, r *http.Request) { handleReportTask(w, r, store) })
	mux.HandleFunc("/tasks/list", func(w http.ResponseWriter, r *http.Request) { handleListTasks(w, r, store) })

	log.Printf("control-plane listening on %s", cfg.ListenAddr)
	log.Fatal(http.ListenAndServe(cfg.ListenAddr, loggingMiddleware(mux)))
}

func loadConfig(path string) Config {
	cfg := Config{ConfigPath: path}
	f, err := os.Open(path)
	if err != nil {
		return cfg
	}
	defer f.Close()
	_ = json.NewDecoder(f).Decode(&cfg)
	if cfg.ConfigPath == "" {
		cfg.ConfigPath = path
	}
	return cfg
}

func watchConfig(path string, onChange func()) {
	if path == "" {
		return
	}
	var lastMod time.Time
	for {
		fi, err := os.Stat(path)
		if err == nil {
			if fi.ModTime().After(lastMod) {
				lastMod = fi.ModTime()
				onChange()
			}
		}
		time.Sleep(2 * time.Second)
	}
}

func handleRegister(w http.ResponseWriter, r *http.Request, registry *Registry) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload Device
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	payload.LastSeen = time.Now().UTC().Format(time.RFC3339)
	registry.mu.Lock()
	registry.devices[payload.DeviceID] = &payload
	registry.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleHeartbeat(w http.ResponseWriter, r *http.Request, registry *Registry) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		DeviceID     string     `json:"device_id"`
		Timestamp    string     `json:"timestamp"`
		Capabilities Capability `json:"capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	registry.mu.Lock()
	if dev, ok := registry.devices[payload.DeviceID]; ok {
		dev.LastSeen = payload.Timestamp
		dev.Capabilities = payload.Capabilities
	}
	registry.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleListDevices(w http.ResponseWriter, r *http.Request, registry *Registry) {
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	list := make([]*Device, 0, len(registry.devices))
	for _, d := range registry.devices {
		list = append(list, d)
	}
	_ = json.NewEncoder(w).Encode(list)
}

func handleSubmitTask(w http.ResponseWriter, r *http.Request, store *TaskStore) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var t Task
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	t.Status = "queued"
	now := time.Now().UTC().Format(time.RFC3339)
	t.CreatedAt = now
	t.UpdatedAt = now
	store.mu.Lock()
	store.tasks[t.ID] = &t
	store.mu.Unlock()
	store.appendEvent(t)
	w.WriteHeader(http.StatusOK)
}

func handleClaimTask(w http.ResponseWriter, r *http.Request, store *TaskStore) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, t := range store.tasks {
		if t.Status != "queued" {
			continue
		}
		if matchesTags(req.Tags, t.RequiredTags) {
			t.Status = "running"
			t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			store.appendEvent(*t)
			_ = json.NewEncoder(w).Encode(t)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleReportTask(w http.ResponseWriter, r *http.Request, store *TaskStore) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var report Task
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	store.mu.Lock()
	if t, ok := store.tasks[report.ID]; ok {
		t.Status = report.Status
		t.Result = report.Result
		t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		store.appendEvent(*t)
	}
	store.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleListTasks(w http.ResponseWriter, r *http.Request, store *TaskStore) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	list := make([]*Task, 0, len(store.tasks))
	for _, t := range store.tasks {
		list = append(list, t)
	}
	_ = json.NewEncoder(w).Encode(list)
}

func matchesTags(agentTags []string, required []string) bool {
	if len(required) == 0 {
		return true
	}
	set := map[string]bool{}
	for _, t := range agentTags {
		set[t] = true
	}
	for _, req := range required {
		if !set[req] {
			return false
		}
	}
	return true
}

func (s *TaskStore) appendEvent(t Task) {
	if s.logPath == "" {
		return
	}
	f, err := os.OpenFile(s.logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	b, _ := json.Marshal(t)
	_, _ = w.WriteString(string(b) + "\n")
	_ = w.Flush()
}

func (s *TaskStore) loadFromLog() {
	if s.logPath == "" {
		return
	}
	f, err := os.Open(s.logPath)
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var t Task
		if err := json.Unmarshal(scanner.Bytes(), &t); err != nil {
			continue
		}
		if t.ID == "" {
			continue
		}
		s.tasks[t.ID] = &t
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func stringInSlice(s string, list []string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func parseTags(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}
