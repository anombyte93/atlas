package main

import (
	"bufio"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Config struct {
	ListenAddr                 string   `json:"listen_addr"`
	DataDir                    string   `json:"data_dir"`
	ConfigPath                 string   `json:"config_path"`
	WorldRepo                  string   `json:"world_repo_path"`
	AllowedRoles               []string `json:"allowed_roles"`
	APIToken                   string   `json:"api_token"`
	TLSCertPath                string   `json:"tls_cert_path"`
	TLSKeyPath                 string   `json:"tls_key_path"`
	CACertPath                 string   `json:"ca_cert_path"`
	DeviceTTLHours             int      `json:"device_ttl_hours"`
	DevicePruneIntervalMinutes int      `json:"device_prune_interval_minutes"`
	LeaderLeaseEnabled         bool     `json:"leader_lease_enabled"`
	LeaderID                   string   `json:"leader_id"`
}

type Registry struct {
	mu      sync.RWMutex
	devices map[string]*Device
}

type Device struct {
	SchemaVersion string     `json:"schema_version"`
	DeviceID      string     `json:"device_id"`
	Hostname      string     `json:"hostname"`
	Roles         []string   `json:"roles"`
	Capabilities  Capability `json:"capabilities"`
	LastSeen      string     `json:"last_seen"`
	Status        string     `json:"status,omitempty"`
}

type Capability struct {
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	CPUCores int      `json:"cpu_cores"`
	MemoryMB int      `json:"memory_mb"`
	Tags     []string `json:"tags"`
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
	LeaseUntil    string      `json:"lease_until,omitempty"`
	Attempts      int         `json:"attempts,omitempty"`
	MaxAttempts   int         `json:"max_attempts,omitempty"`
	LeaseExpiries int         `json:"lease_expiries,omitempty"`
	NextEligible  string      `json:"next_eligible_at,omitempty"`
	CreatedAt     string      `json:"created_at"`
	UpdatedAt     string      `json:"updated_at"`
	Result        *TaskResult `json:"result,omitempty"`
}

type TaskResult struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type TaskStore struct {
	mu         sync.RWMutex
	tasks      map[string]*Task
	queued     map[string]struct{}
	logPath    string
	db         *sql.DB
	audit      *AuditLogger
	writeCount int
}

var auditLogger *AuditLogger
var deviceStore *DeviceStore

type DeviceStore struct {
	db *sql.DB
}

func main() {
	cfg := loadConfig("../../config/control-plane.json")
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":8080"
	}
	if cfg.DataDir == "" {
		cfg.DataDir = "./data"
	}
	if envToken := os.Getenv("ATLAS_API_TOKEN"); envToken != "" {
		cfg.APIToken = envToken
	}
	if !insecureAllowed() && (cfg.APIToken == "" || cfg.APIToken == "change-me") {
		log.Fatal("api_token is empty or default; set ATLAS_API_TOKEN or change config, or set ATLAS_INSECURE=1 for dev")
	}
	_ = os.MkdirAll(cfg.DataDir, 0o755)
	registry := &Registry{devices: map[string]*Device{}}
	db := initDB(filepath.Join(cfg.DataDir, "tasks.db"))
	deviceStore = &DeviceStore{db: db}
	audit := &AuditLogger{logPath: filepath.Join(cfg.DataDir, "audit.jsonl")}
	auditLogger = audit
	if cfg.LeaderLeaseEnabled {
		if cfg.LeaderID == "" {
			cfg.LeaderID = getHostname()
		}
		ok := acquireLeaderLease(db, cfg.LeaderID)
		if !ok {
			log.Fatal("failed to acquire leader lease")
		}
		go renewLeaderLease(db, cfg.LeaderID)
	}
	store := &TaskStore{tasks: map[string]*Task{}, logPath: filepath.Join(cfg.DataDir, "tasks.jsonl"), db: db, audit: audit}
	store.queued = map[string]struct{}{}
	store.loadFromLog()
	store.loadFromDB()
	loadDevicesFromDB(registry)

	go watchConfig(cfg.ConfigPath, func() {
		newCfg := loadConfig(cfg.ConfigPath)
		if newCfg.ListenAddr != "" {
			cfg.ListenAddr = newCfg.ListenAddr
		}
		if newCfg.WorldRepo != "" {
			cfg.WorldRepo = newCfg.WorldRepo
		}
	})
	go pruneDevicesLoop(registry, cfg.DeviceTTLHours, cfg.DevicePruneIntervalMinutes)

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
	if cfg.TLSCertPath != "" && cfg.TLSKeyPath != "" {
		tlsConfig, err := loadTLSConfig(cfg.CACertPath)
		if err != nil {
			log.Fatalf("tls config error: %v", err)
		}
		server.TLSConfig = tlsConfig
		log.Fatal(server.ListenAndServeTLS(cfg.TLSCertPath, cfg.TLSKeyPath))
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
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var payload Device
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	if !validSchemaVersion(payload.SchemaVersion) {
		writeError(w, http.StatusBadRequest, "schema_version", "unsupported schema_version")
		return
	}
	if payload.DeviceID == "" {
		writeError(w, http.StatusBadRequest, "validation", "device_id required")
		return
	}
	payload.LastSeen = time.Now().UTC().Format(time.RFC3339)
	registry.mu.Lock()
	registry.devices[payload.DeviceID] = &payload
	registry.mu.Unlock()
	persistDevice(payload)
	w.WriteHeader(http.StatusOK)
}

func handleHeartbeat(w http.ResponseWriter, r *http.Request, registry *Registry, cfg Config) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var payload struct {
		DeviceID     string     `json:"device_id"`
		Timestamp    string     `json:"timestamp"`
		Capabilities Capability `json:"capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	registry.mu.Lock()
	if dev, ok := registry.devices[payload.DeviceID]; ok {
		dev.LastSeen = payload.Timestamp
		dev.Capabilities = payload.Capabilities
		persistDevice(*dev)
	}
	registry.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleListDevices(w http.ResponseWriter, r *http.Request, registry *Registry, cfg Config) {
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
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
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var t Task
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	if t.ID == "" {
		writeError(w, http.StatusBadRequest, "validation", "id required")
		return
	}
	if !validSchemaVersion(t.SchemaVersion) {
		writeError(w, http.StatusBadRequest, "schema_version", "unsupported schema_version")
		return
	}
	if t.Type != "shell" && t.Type != "script" {
		writeError(w, http.StatusBadRequest, "validation", "type must be shell or script")
		return
	}
	if t.Type == "shell" && t.Command == "" {
		writeError(w, http.StatusBadRequest, "validation", "command required for shell")
		return
	}
	if t.Type == "script" && t.ScriptPath == "" {
		writeError(w, http.StatusBadRequest, "validation", "script_path required for script")
		return
	}
	t.Status = "queued"
	now := time.Now().UTC().Format(time.RFC3339)
	t.CreatedAt = now
	t.UpdatedAt = now
	store.mu.Lock()
	if _, exists := store.tasks[t.ID]; exists {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "conflict", "duplicate task id")
		return
	}
	store.tasks[t.ID] = &t
	if t.Status == "queued" {
		store.queued[t.ID] = struct{}{}
	}
	store.mu.Unlock()
	store.appendEvent(t)
	store.persistTask(t)
	store.audit.Log("task_submit", map[string]any{"task_id": t.ID})
	w.WriteHeader(http.StatusOK)
}

func handleClaimTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req struct {
		Tags    []string `json:"tags"`
		AgentID string   `json:"agent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	if req.AgentID == "" {
		writeError(w, http.StatusBadRequest, "validation", "agent_id required")
		return
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	for id := range store.queued {
		t := store.tasks[id]
		if t == nil {
			delete(store.queued, id)
			continue
		}
		if t.Status != "queued" {
			if t.Status == "running" && leaseExpired(t.LeaseUntil) {
				t.Status = "queued"
				t.NextEligible = time.Now().UTC().Add(jitteredDelay(5 * time.Second)).Format(time.RFC3339)
				t.ClaimedBy = ""
				t.LeaseUntil = ""
				store.queued[t.ID] = struct{}{}
				t.LeaseExpiries += 1
				if t.LeaseExpiries%3 == 0 {
					t.Attempts += 1
					t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
					if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
						t.Status = "failed"
						delete(store.queued, t.ID)
					}
				}
			} else {
				continue
			}
		}
		if t.Status != "queued" {
			continue
		}
		if t.NextEligible != "" && !eligibleNow(t.NextEligible) {
			continue
		}
		if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
			continue
		}
		if matchesTags(req.Tags, t.RequiredTags) {
			t.Status = "running"
			t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			t.ClaimedBy = req.AgentID
			t.LeaseUntil = time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339)
			store.appendEvent(*t)
			store.persistTask(*t)
			store.audit.Log("task_claim", map[string]any{"task_id": t.ID, "agent_id": req.AgentID})
			delete(store.queued, t.ID)
			_ = json.NewEncoder(w).Encode(t)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleReportTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var report Task
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	if !validSchemaVersion(report.SchemaVersion) {
		writeError(w, http.StatusBadRequest, "schema_version", "unsupported schema_version")
		return
	}
	store.mu.Lock()
	t, ok := store.tasks[report.ID]
	if !ok {
		store.mu.Unlock()
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	if t.ClaimedBy == "" || t.ClaimedBy != report.ClaimedBy {
		store.mu.Unlock()
		writeError(w, http.StatusUnauthorized, "unauthorized", "claim mismatch")
		return
	}
	if leaseExpired(t.LeaseUntil) {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "lease_expired", "task lease expired")
		return
	}
	if report.Status != "completed" && report.Status != "failed" {
		store.mu.Unlock()
		writeError(w, http.StatusBadRequest, "validation", "status must be completed or failed")
		return
	}
	if t.Status != "running" {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "state_conflict", "task not running")
		return
	}
	t.Status = report.Status
	t.Result = report.Result
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if report.Status == "failed" {
		t.Attempts += 1
		t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
		t.ClaimedBy = ""
		t.LeaseUntil = ""
		if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
			t.Status = "failed"
		} else {
			t.Status = "queued"
		}
	}
	store.appendEvent(*t)
	store.persistTask(*t)
	store.audit.Log("task_report", map[string]any{"task_id": t.ID, "status": report.Status, "agent_id": report.ClaimedBy})
	if t.Status == "queued" {
		store.queued[t.ID] = struct{}{}
	}
	store.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleListTasks(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if !checkAuth(r, cfg.APIToken) {
		logAuthFail(r)
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
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
	rotateIfNeeded(s.logPath)
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

func initDB(path string) *sql.DB {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil
	}
	_, _ = db.Exec("PRAGMA journal_mode=WAL;")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		json TEXT NOT NULL,
		status TEXT,
		updated_at TEXT,
		attempts INTEGER DEFAULT 0,
		lease_expiries INTEGER DEFAULT 0,
		claimed_by TEXT,
		lease_until TEXT,
		next_eligible TEXT
	)`)
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN lease_expiries INTEGER")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN next_eligible TEXT")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		json TEXT NOT NULL,
		last_seen TEXT
	)`)
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON devices(last_seen)")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS leader_lease (
		id TEXT PRIMARY KEY,
		holder TEXT NOT NULL,
		expires_at TEXT NOT NULL
	)`)
	return db
}

func (s *TaskStore) persistTask(t Task) {
	if s.db == nil {
		return
	}
	b, _ := json.Marshal(t)
	_, _ = s.db.Exec(`INSERT INTO tasks (id, json, status, updated_at, attempts, lease_expiries, claimed_by, lease_until, next_eligible)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET json=excluded.json, status=excluded.status, updated_at=excluded.updated_at,
			attempts=excluded.attempts, lease_expiries=excluded.lease_expiries, claimed_by=excluded.claimed_by, lease_until=excluded.lease_until, next_eligible=excluded.next_eligible`,
		t.ID, string(b), t.Status, t.UpdatedAt, t.Attempts, t.LeaseExpiries, t.ClaimedBy, t.LeaseUntil, t.NextEligible)
	s.writeCount += 1
	if s.writeCount%100 == 0 {
		_, _ = s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE);")
	}
}

func (s *TaskStore) loadFromDB() {
	if s.db == nil {
		return
	}
	rows, err := s.db.Query("SELECT json FROM tasks")
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		var t Task
		if err := json.Unmarshal([]byte(raw), &t); err != nil {
			continue
		}
		if t.ID == "" {
			continue
		}
		s.tasks[t.ID] = &t
		if t.Status == "queued" {
			s.queued[t.ID] = struct{}{}
		}
	}
}

func persistDevice(d Device) {
	if deviceStore == nil || deviceStore.db == nil {
		return
	}
	b, _ := json.Marshal(d)
	_, _ = deviceStore.db.Exec(`INSERT INTO devices (id, json, last_seen)
		VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET json=excluded.json, last_seen=excluded.last_seen`,
		d.DeviceID, string(b), d.LastSeen)
}

func loadDevicesFromDB(registry *Registry) {
	if deviceStore == nil || deviceStore.db == nil {
		return
	}
	rows, err := deviceStore.db.Query("SELECT json FROM devices")
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		var d Device
		if err := json.Unmarshal([]byte(raw), &d); err != nil {
			continue
		}
		if d.DeviceID == "" {
			continue
		}
		registry.devices[d.DeviceID] = &d
	}
}

func pruneDevicesLoop(registry *Registry, ttlHours int, intervalMinutes int) {
	if ttlHours <= 0 {
		return
	}
	if intervalMinutes <= 0 {
		intervalMinutes = 60
	}
	ticker := time.NewTicker(time.Duration(intervalMinutes) * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().UTC().Add(-time.Duration(ttlHours) * time.Hour)
		count := pruneDevices(registry, cutoff)
		if count > 0 && auditLogger != nil {
			auditLogger.Log("device_prune", map[string]any{
				"count":  count,
				"cutoff": cutoff.Format(time.RFC3339),
			})
		}
	}
}

func pruneDevices(registry *Registry, cutoff time.Time) int {
	count := 0
	registry.mu.Lock()
	for id, d := range registry.devices {
		t, err := time.Parse(time.RFC3339, d.LastSeen)
		if err != nil || t.Before(cutoff) {
			delete(registry.devices, id)
			count += 1
		}
	}
	registry.mu.Unlock()
	if deviceStore == nil || deviceStore.db == nil {
		return count
	}
	_, _ = deviceStore.db.Exec("DELETE FROM devices WHERE last_seen < ?", cutoff.Format(time.RFC3339))
	return count
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
		if t.Status == "queued" {
			s.queued[t.ID] = struct{}{}
		}
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

func validSchemaVersion(v string) bool {
	return strings.HasPrefix(v, "1.")
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":   code,
		"message": message,
	})
}

func insecureAllowed() bool {
	return os.Getenv("ATLAS_INSECURE") == "1"
}

func eligibleNow(ts string) bool {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return true
	}
	return time.Now().UTC().After(t)
}

func retryBackoff(attempt int) time.Duration {
	if attempt < 1 {
		return 5 * time.Second
	}
	delay := time.Second * time.Duration(5*(1<<uint(attempt-1)))
	if delay > 2*time.Minute {
		delay = 2 * time.Minute
	}
	return delay + jitteredDelay(2*time.Second)
}

func jitteredDelay(base time.Duration) time.Duration {
	if base <= 0 {
		return 0
	}
	n := time.Now().UnixNano() % int64(base)
	return time.Duration(n)
}

func rotateIfNeeded(path string) {
	info, err := os.Stat(path)
	if err != nil {
		return
	}
	if info.Size() < 10*1024*1024 {
		return
	}
	ts := time.Now().UTC().Format("20060102-150405")
	_ = os.Rename(path, path+"."+ts)
}

func getHostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}

func acquireLeaderLease(db *sql.DB, leaderID string) bool {
	if db == nil {
		return false
	}
	expires := time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339)
	_, _ = db.Exec("INSERT OR IGNORE INTO leader_lease (id, holder, expires_at) VALUES ('primary', ?, ?)", leaderID, expires)
	var holder string
	var exp string
	row := db.QueryRow("SELECT holder, expires_at FROM leader_lease WHERE id='primary'")
	if err := row.Scan(&holder, &exp); err != nil {
		return false
	}
	if holder == leaderID {
		return true
	}
	t, err := time.Parse(time.RFC3339, exp)
	if err != nil || time.Now().UTC().After(t) {
		_, _ = db.Exec("UPDATE leader_lease SET holder=?, expires_at=? WHERE id='primary'", leaderID, expires)
		return true
	}
	return false
}

func renewLeaderLease(db *sql.DB, leaderID string) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		expires := time.Now().UTC().Add(30 * time.Second).Format(time.RFC3339)
		_, _ = db.Exec("UPDATE leader_lease SET expires_at=? WHERE id='primary' AND holder=?", expires, leaderID)
	}
}

func logAuthFail(r *http.Request) {
	if auditLogger == nil {
		return
	}
	auditLogger.Log("auth_fail", map[string]any{
		"path":   r.URL.Path,
		"remote": r.RemoteAddr,
	})
}

type AuditLogger struct {
	logPath string
	mu      sync.Mutex
}

func (a *AuditLogger) Log(event string, fields map[string]any) {
	if a == nil || a.logPath == "" {
		return
	}
	rotateIfNeeded(a.logPath)
	entry := map[string]any{
		"event_type": event,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	}
	for k, v := range fields {
		entry[k] = v
	}
	b, _ := json.Marshal(entry)
	a.mu.Lock()
	defer a.mu.Unlock()
	f, err := os.OpenFile(a.logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(b, '\n'))
	_ = f.Sync()
}

func loadTLSConfig(caPath string) (*tls.Config, error) {
	tlsConfig := &tls.Config{}
	if caPath == "" {
		return tlsConfig, nil
	}
	caCert, err := os.ReadFile(caPath)
	if err != nil {
		return nil, err
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, nil
	}
	tlsConfig.ClientCAs = caPool
	tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	return tlsConfig, nil
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
