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
	APIToken     string `json:"api_token"`
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
	Status       string     `json:"status,omitempty"`
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
	ClaimedBy    string   `json:"claimed_by,omitempty"`
	LeaseUntil   string   `json:"lease_until,omitempty"`
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
	mux.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) { handleRegister(w, r, registry, cfg) })
	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) { handleHeartbeat(w, r, registry, cfg) })
	mux.HandleFunc("/devices", func(w http.ResponseWriter, r *http.Request) { handleListDevices(w, r, registry, cfg) })
	mux.HandleFunc("/tasks/submit", func(w http.ResponseWriter, r *http.Request) { handleSubmitTask(w, r, store, cfg) })
	mux.HandleFunc("/tasks/claim", func(w http.ResponseWriter, r *http.Request) { handleClaimTask(w, r, store, cfg) })
	mux.HandleFunc("/tasks/report", func(w http.ResponseWriter, r *http.Request) { handleReportTask(w, r, store, cfg) })
	mux.HandleFunc("/tasks/list", func(w http.ResponseWriter, r *http.Request) { handleListTasks(w, r, store, cfg) })

	log.Printf("control-plane listening on %s", cfg.ListenAddr)
	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           loggingMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
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

func handleRegister(w http.ResponseWriter, r *http.Request, registry *Registry, cfg Config) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var payload Device
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if payload.DeviceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	payload.LastSeen = time.Now().UTC().Format(time.RFC3339)
	registry.mu.Lock()
	registry.devices[payload.DeviceID] = &payload
	registry.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleHeartbeat(w http.ResponseWriter, r *http.Request, registry *Registry, cfg Config) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
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

func handleListDevices(w http.ResponseWriter, r *http.Request, registry *Registry, cfg Config) {
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	list := make([]*Device, 0, len(registry.devices))
	for _, d := range registry.devices {
		d.Status = computeStatus(d.LastSeen)
		list = append(list, d)
	}
	_ = json.NewEncoder(w).Encode(list)
}

func handleSubmitTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var t Task
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if t.ID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if t.Type != "shell" && t.Type != "script" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if t.Type == "shell" && t.Command == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if t.Type == "script" && t.ScriptPath == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	t.Status = "queued"
	now := time.Now().UTC().Format(time.RFC3339)
	t.CreatedAt = now
	t.UpdatedAt = now
	store.mu.Lock()
	if _, exists := store.tasks[t.ID]; exists {
		store.mu.Unlock()
		w.WriteHeader(http.StatusConflict)
		return
	}
	store.tasks[t.ID] = &t
	store.mu.Unlock()
	store.appendEvent(t)
	w.WriteHeader(http.StatusOK)
}

func handleClaimTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req struct {
		Tags []string `json:"tags"`
		AgentID string `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if req.AgentID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, t := range store.tasks {
		if t.Status != "queued" {
			if t.Status == "running" && leaseExpired(t.LeaseUntil) {
				t.Status = "queued"
			} else {
				continue
			}
		}
		if t.Status != "queued" {
			continue
		}
		if matchesTags(req.Tags, t.RequiredTags) {
			t.Status = "running"
			t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			t.ClaimedBy = req.AgentID
			t.LeaseUntil = time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339)
			store.appendEvent(*t)
			_ = json.NewEncoder(w).Encode(t)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleReportTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var report Task
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	store.mu.Lock()
	t, ok := store.tasks[report.ID]
	if !ok {
		store.mu.Unlock()
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if t.ClaimedBy == "" || t.ClaimedBy != report.ClaimedBy {
		store.mu.Unlock()
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if leaseExpired(t.LeaseUntil) {
		store.mu.Unlock()
		w.WriteHeader(http.StatusConflict)
		return
	}
	if report.Status != "completed" && report.Status != "failed" {
		store.mu.Unlock()
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if t.Status != "running" {
		store.mu.Unlock()
		w.WriteHeader(http.StatusConflict)
		return
	}
	t.Status = report.Status
	t.Result = report.Result
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	store.appendEvent(*t)
	store.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleListTasks(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if !checkAuth(r, cfg.APIToken) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
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
	_ = f.Sync()
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

func checkAuth(r *http.Request, token string) bool {
	if token == "" {
		return true
	}
	auth := r.Header.Get("Authorization")
	return auth == "Bearer "+token
}

func leaseExpired(leaseUntil string) bool {
	if leaseUntil == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, leaseUntil)
	if err != nil {
		return true
	}
	return time.Now().UTC().After(t)
}

func computeStatus(lastSeen string) string {
	if lastSeen == "" {
		return "unknown"
	}
	t, err := time.Parse(time.RFC3339, lastSeen)
	if err != nil {
		return "unknown"
	}
	if time.Since(t) <= 60*time.Second {
		return "online"
	}
	return "offline"
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
