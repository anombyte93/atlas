package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"

	"atlas-control-plane/internal/atlascoin"
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
	LeaderLeaseSeconds         int      `json:"leader_lease_seconds"`
	LeaderRenewSeconds         int      `json:"leader_renew_seconds"`
	CoinEnabled                bool     `json:"coin_enabled"`
	CoinURL                    string   `json:"coin_url"`
	CoinRewardDefault          int      `json:"coin_reward_default"`
	CoinStakePercent           int      `json:"coin_stake_percent"`
	CoinPoster                 string   `json:"coin_poster"`
	CoinAuthToken              string   `json:"coin_auth_token"`
	CoinQueuePath              string   `json:"coin_queue_path"`
}

type Registry struct {
	mu      sync.RWMutex
	devices map[string]*Device
}

type Device struct {
	SchemaVersion string       `json:"schema_version"`
	DeviceID      string       `json:"device_id"`
	Hostname      string       `json:"hostname"`
	Roles         []string     `json:"roles"`
	Capabilities  Capability   `json:"capabilities"`
	Metrics       AgentMetrics `json:"metrics,omitempty"`
	LastSeen      string       `json:"last_seen"`
	Status        string       `json:"status,omitempty"`
}

type Capability struct {
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	CPUCores int      `json:"cpu_cores"`
	MemoryMB int      `json:"memory_mb"`
	Tags     []string `json:"tags"`
}

type AgentMetrics struct {
	HashMismatches    uint64 `json:"hash_mismatches,omitempty"`
	HashBackfillSkips uint64 `json:"hash_backfill_skips,omitempty"`
}

type Task struct {
	SchemaVersion string      `json:"schema_version"`
	ID            string      `json:"id"`
	Type          string      `json:"type"`
	Status        string      `json:"status"`
	Command       string      `json:"command,omitempty"`
	ScriptPath    string      `json:"script_path,omitempty"`
	ContentHash   string      `json:"content_hash,omitempty"`
	TimeoutSec    int         `json:"timeout_sec"`
	RequiredTags  []string    `json:"required_tags,omitempty"`
	ClaimedBy     string      `json:"claimed_by,omitempty"`
	ClaimToken    string      `json:"claim_token,omitempty"`
	LeaseUntil    string      `json:"lease_until,omitempty"`
	Attempts      int         `json:"attempts,omitempty"`
	MaxAttempts   int         `json:"max_attempts,omitempty"`
	LeaseExpiries int         `json:"lease_expiries,omitempty"`
	NextEligible  string      `json:"next_eligible_at,omitempty"`
	LeaderToken   int64       `json:"leader_token,omitempty"`
	CoinBountyID  string      `json:"coin_bounty_id,omitempty"`
	CoinStatus    string      `json:"coin_status,omitempty"`
	CoinLastError string      `json:"coin_last_error,omitempty"`
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
	worldRepo  string
}

type CoinIntegration struct {
	enabled  bool
	client   CoinClient
	poster   string
	reward   int
	stakePct int
	timeout  time.Duration
	auth     string
	queue    CoinQueueInterface
}

// CoinQueueInterface defines the queue operations needed by CoinIntegration
type CoinQueueInterface interface {
	Enqueue(job *CoinJob)
	Mark(job *CoinJob)
	Due(now time.Time) []*CoinJob
	WorkerLoop(coin CoinIntegration, cfg Config)
}

type CoinClient interface {
	PostBounty(ctx context.Context, poster, template, escrowAmount string) (*atlascoin.Bounty, error)
	SubmitSolution(ctx context.Context, bountyID, claimant, stakeAmount string, evidence any) (*atlascoin.Bounty, error)
	Verify(ctx context.Context, bountyID string, evidence any) (*atlascoin.VerificationResult, error)
	Settle(ctx context.Context, bountyID string) (*atlascoin.Bounty, error)
}

type CoinMetrics struct {
	postOK     uint64
	postFail   uint64
	submitOK   uint64
	submitFail uint64
	verifyOK   uint64
	verifyFail uint64
	settleOK   uint64
	settleFail uint64
}

var ErrLeaderConflict = fmt.Errorf("leader conflict")

var auditLogger *AuditLogger
var leaderActive bool
var leaderToken int64
var leaderEnabled bool
var deviceStore *DeviceStore
var coinMetrics CoinMetrics
var taskStoreInstance *TaskStore

type DeviceStore struct {
	db *sql.DB
}

func main() {
	cfg := loadConfig("../../config/control-plane.json")
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":8080"
	}
	if envAddr := os.Getenv("ATLAS_LISTEN_ADDR"); envAddr != "" {
		cfg.ListenAddr = envAddr
	}
	if cfg.DataDir == "" {
		cfg.DataDir = "./data"
	}
	if envData := os.Getenv("ATLAS_DATA_DIR"); envData != "" {
		cfg.DataDir = envData
	}
	if envToken := os.Getenv("ATLAS_API_TOKEN"); envToken != "" {
		cfg.APIToken = envToken
	}
	if env := os.Getenv("ATLAS_COIN_URL"); env != "" {
		cfg.CoinURL = env
	}
	if env := os.Getenv("ATLAS_COIN_AUTH_TOKEN"); env != "" {
		cfg.CoinAuthToken = env
	}
	if env := os.Getenv("ATLAS_COIN_ENABLED"); env == "1" || strings.ToLower(env) == "true" {
		cfg.CoinEnabled = true
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
		ttl := time.Duration(cfg.LeaderLeaseSeconds) * time.Second
		if ttl <= 0 {
			ttl = 30 * time.Second
		}
		token, ok := acquireLeaderLease(db, cfg.LeaderID, ttl)
		if !ok {
			log.Fatal("failed to acquire leader lease")
		}
		leaderToken = token
		leaderActive = true
		leaderEnabled = true
		renewEvery := time.Duration(cfg.LeaderRenewSeconds) * time.Second
		if renewEvery <= 0 {
			renewEvery = 10 * time.Second
		}
		go renewLeaderLeaseLoop(db, cfg.LeaderID, token, ttl, renewEvery)
	}
	coin := CoinIntegration{
		enabled:  cfg.CoinEnabled && cfg.CoinURL != "",
		client:   atlascoin.New(cfg.CoinURL, cfg.CoinAuthToken),
		poster:   firstNonEmpty(cfg.CoinPoster, cfg.LeaderID, "system"),
		reward:   nonZero(cfg.CoinRewardDefault, 100), // default 100 AC
		stakePct: nonZero(cfg.CoinStakePercent, 10),   // default 10%
		timeout:  2 * time.Second,
		auth:     cfg.CoinAuthToken,
	}
	queuePath := cfg.CoinQueuePath
	legacyPath := ""
	if queuePath == "" {
		queuePath = filepath.Join(cfg.DataDir, "coin-queue.db")
		legacyPath = filepath.Join(cfg.DataDir, "coin-jobs.json")
	}
	sqliteQueue, err := NewCoinQueueSQLite(queuePath, legacyPath)
	if err != nil {
		log.Printf("failed to create sqlite coin queue: %v", err)
		// Fall back to legacy queue if SQLite fails
		if legacyPath != "" {
			coin.queue = NewCoinQueue(legacyPath)
		}
	} else {
		coin.queue = sqliteQueue
	}

	store := &TaskStore{tasks: map[string]*Task{}, logPath: filepath.Join(cfg.DataDir, "tasks.jsonl"), db: db, audit: audit, worldRepo: cfg.WorldRepo}
	taskStoreInstance = store
	store.queued = map[string]struct{}{}
	store.loadFromLog()
	store.loadFromDB()
	loadDevicesFromDB(registry)

	// Start worker loop (handles both legacy and SQLite queues)
	go coin.queue.WorkerLoop(coin, cfg)
	// Start reconciliation loop (uses SQLite queue if available, otherwise legacy)
	if sqliteQueue != nil {
		reconciler := NewReconciler(coin, store, sqliteQueue)
		go reconciler.Run()
	} else {
		go reconcileCoinJobs(coin, store)
	}

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
	mux.HandleFunc("/tasks/submit", func(w http.ResponseWriter, r *http.Request) { handleSubmitTask(w, r, store, cfg, coin) })
	mux.HandleFunc("/tasks/claim", func(w http.ResponseWriter, r *http.Request) { handleClaimTask(w, r, store, cfg, coin) })
	mux.HandleFunc("/tasks/report", func(w http.ResponseWriter, r *http.Request) { handleReportTask(w, r, store, cfg, coin) })
	mux.HandleFunc("/tasks/list", func(w http.ResponseWriter, r *http.Request) { handleListTasks(w, r, store, cfg) })
	mux.HandleFunc("/tasks/renew", func(w http.ResponseWriter, r *http.Request) { handleRenewTask(w, r, store, cfg) })
	mux.HandleFunc("/coin/metrics", func(w http.ResponseWriter, r *http.Request) { handleCoinMetrics(w, r) })

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
		DeviceID     string       `json:"device_id"`
		Timestamp    string       `json:"timestamp"`
		Capabilities Capability   `json:"capabilities"`
		Metrics      AgentMetrics `json:"metrics,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	registry.mu.Lock()
	if dev, ok := registry.devices[payload.DeviceID]; ok {
		dev.LastSeen = payload.Timestamp
		dev.Capabilities = payload.Capabilities
		if payload.Metrics.HashMismatches > 0 || payload.Metrics.HashBackfillSkips > 0 {
			dev.Metrics = payload.Metrics
		}
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

func handleSubmitTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config, coin CoinIntegration) {
	if !requireLeader(w) {
		return
	}
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
	if t.Type == "script" {
		if t.ScriptPath == "" {
			writeError(w, http.StatusBadRequest, "validation", "script_path required for script")
			return
		}
		t.ContentHash = taskContentHash(t, cfg.WorldRepo)
		if t.ContentHash == "" {
			writeError(w, http.StatusBadRequest, "validation", "unable to hash script (world_repo unset, bad path, or unreadable)")
			return
		}
	} else {
		t.ContentHash = taskContentHash(t, cfg.WorldRepo)
	}
	if t.Status != "" && t.Status != string(StateQueued) {
		writeError(w, http.StatusBadRequest, "validation", "status must be queued or empty on submit")
		return
	}
	t.Status = string(StateQueued)
	if leaderEnabled {
		t.LeaderToken = leaderToken
	}
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
	if coin.enabled {
		job := &CoinJob{
			ID:        "coin-post-" + t.ID,
			TaskID:    t.ID,
			Kind:      JobPost,
			Payload:   map[string]any{"task_id": t.ID, "template": t.Type, "reward": fmt.Sprintf("%d", coin.reward)},
			Status:    "pending",
			CreatedAt: time.Now(),
			NextRun:   time.Now(),
			RequestID: "post-" + t.ID,
		}
		coin.queue.Enqueue(job)
		t.CoinStatus = "pending_post"
	}
	if t.Status == "queued" {
		store.queued[t.ID] = struct{}{}
	}
	if err := store.persistTask(t); err != nil {
		if err == ErrLeaderConflict {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
			return
		}
		store.mu.Unlock()
		writeError(w, http.StatusInternalServerError, "persist_error", "failed to persist task")
		return
	}
	store.appendEvent(t)
	store.mu.Unlock()
	store.audit.Log("task_submit", map[string]any{"task_id": t.ID})
	w.WriteHeader(http.StatusOK)
}

func handleClaimTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config, coin CoinIntegration) {
	if !requireLeader(w) {
		return
	}
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
	for id := range store.queued {
		t := store.tasks[id]
		if t == nil {
			delete(store.queued, id)
			continue
		}
		if t.Status != string(StateQueued) {
			if t.Status == string(StateRunning) && leaseExpired(t.LeaseUntil) {
				if next, ok := transition(StateRunning, EventLeaseExpire); ok {
					t.Status = string(next)
				} else {
					continue
				}
				t.NextEligible = time.Now().UTC().Add(jitteredDelay(5 * time.Second)).Format(time.RFC3339)
				t.ClaimedBy = ""
				t.LeaseUntil = ""
				store.queued[t.ID] = struct{}{}
				t.LeaseExpiries += 1
				t.Attempts += 1
				t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
				if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
					t.Status = string(StateFailed)
					delete(store.queued, t.ID)
				}
			} else {
				continue
			}
		}
		if t.Status != string(StateQueued) {
			continue
		}
		if t.NextEligible != "" && !eligibleNow(t.NextEligible) {
			continue
		}
		if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
			continue
		}
		if matchesTags(req.Tags, t.RequiredTags) {
			if next, ok := transition(StateQueued, EventClaim); ok {
				t.Status = string(next)
			} else {
				store.mu.Unlock()
				writeError(w, http.StatusConflict, "state_conflict", "cannot claim from current state")
				return
			}
			t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			t.ClaimedBy = req.AgentID
			t.ClaimToken = randToken()
			t.LeaseUntil = time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339)
			if leaderEnabled {
				t.LeaderToken = leaderToken
			}
			if err := store.persistTask(*t); err != nil {
				if err == ErrLeaderConflict {
					// put task back in queue for another pass and unlock
					store.queued[t.ID] = struct{}{}
					store.mu.Unlock()
					writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
					return
				}
				store.queued[t.ID] = struct{}{}
				store.mu.Unlock()
				writeError(w, http.StatusInternalServerError, "persist_error", "failed to persist task")
				return
			}
			store.appendEvent(*t)
			store.audit.Log("task_claim", map[string]any{"task_id": t.ID, "agent_id": req.AgentID})
			delete(store.queued, t.ID)
			store.mu.Unlock()

			// coin submit enqueued for async worker
			if coin.enabled && t.CoinBountyID != "" {
				job := &CoinJob{
					ID:        "coin-submit-" + t.ID,
					TaskID:    t.ID,
					Kind:      JobSubmit,
					Payload:   map[string]any{"bounty_id": t.CoinBountyID, "agent": req.AgentID, "stake": fmt.Sprintf("%d", (coin.reward*coin.stakePct)/100)},
					Status:    "pending",
					CreatedAt: time.Now(),
					NextRun:   time.Now(),
					RequestID: "submit-" + t.ID,
				}
				coin.queue.Enqueue(job)
				t.CoinStatus = "pending_submit"
			}

			_ = json.NewEncoder(w).Encode(t)
			return
		}
	}
	store.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func handleReportTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config, coin CoinIntegration) {
	if !requireLeader(w) {
		return
	}
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
	if t.ClaimedBy == "" || t.ClaimedBy != report.ClaimedBy || t.ClaimToken == "" || t.ClaimToken != report.ClaimToken {
		store.mu.Unlock()
		writeError(w, http.StatusUnauthorized, "unauthorized", "claim mismatch")
		return
	}
	if leaderEnabled {
		if report.LeaderToken == 0 {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_required", "leader token missing")
			return
		}
		if report.LeaderToken != leaderToken {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
			return
		}
		if t.LeaderToken > 0 && t.LeaderToken != leaderToken {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "task owned by newer leader")
			return
		}
	}
	if report.ContentHash == "" || report.ContentHash != t.ContentHash {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "content_mismatch", "task content hash mismatch")
		return
	}
	if leaseExpired(t.LeaseUntil) {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "lease_expired", "task lease expired")
		return
	}
	if report.Status != string(StateCompleted) && report.Status != string(StateFailed) {
		store.mu.Unlock()
		writeError(w, http.StatusBadRequest, "validation", "status must be completed or failed")
		return
	}
	if t.Status != string(StateRunning) {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "state_conflict", "task not running")
		return
	}
	if report.Status == string(StateCompleted) {
		next, ok := transition(StateRunning, EventReportOK)
		if !ok {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "state_conflict", "invalid transition")
			return
		}
		t.Status = string(next)
	}
	if report.Status == string(StateFailed) {
		next, ok := transition(StateRunning, EventReportFail)
		if !ok {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "state_conflict", "invalid transition")
			return
		}
		t.Status = string(next)
	}
	t.Result = report.Result
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if leaderEnabled {
		t.LeaderToken = leaderToken
	}
	if report.Status == string(StateFailed) {
		t.Attempts += 1
		t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
		t.ClaimedBy = ""
		t.ClaimToken = ""
		t.LeaseUntil = ""
		if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
			t.Status = string(StateFailed)
		} else {
			if next, ok := transition(StateFailed, EventRetry); ok {
				t.Status = string(next)
			} else {
				t.Status = string(StateQueued)
			}
			store.queued[t.ID] = struct{}{}
		}
	}
	coinDo := coin.enabled && t.CoinBountyID != ""
	coinSuccess := report.Status == string(StateCompleted)

	if err := store.persistTask(*t); err != nil {
		if err == ErrLeaderConflict {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
			return
		}
		store.mu.Unlock()
		writeError(w, http.StatusInternalServerError, "persist_error", "failed to persist task")
		return
	}
	store.appendEvent(*t)
	store.audit.Log("task_report", map[string]any{"task_id": t.ID, "status": report.Status, "agent_id": report.ClaimedBy})
	if t.Status == "queued" {
		store.queued[t.ID] = struct{}{}
	}
	store.mu.Unlock()

	// enqueue coin settle after releasing lock
	if coinDo {
		job := &CoinJob{
			ID:        "coin-settle-" + t.ID,
			TaskID:    t.ID,
			Kind:      JobSettle,
			Payload:   map[string]any{"bounty_id": t.CoinBountyID, "success": coinSuccess},
			Status:    "pending",
			CreatedAt: time.Now(),
			NextRun:   time.Now(),
			RequestID: "settle-" + t.ID,
		}
		coin.queue.Enqueue(job)
		t.CoinStatus = "pending_settle"
	}

	w.WriteHeader(http.StatusOK)
}

func handleRenewTask(w http.ResponseWriter, r *http.Request, store *TaskStore, cfg Config) {
	if !requireLeader(w) {
		return
	}
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
		ID          string `json:"id"`
		ClaimedBy   string `json:"claimed_by"`
		ClaimToken  string `json:"claim_token"`
		LeaderToken int64  `json:"leader_token,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "malformed request body")
		return
	}
	store.mu.Lock()
	t, ok := store.tasks[req.ID]
	if !ok {
		store.mu.Unlock()
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	if t.ClaimedBy == "" || t.ClaimedBy != req.ClaimedBy || t.ClaimToken == "" || t.ClaimToken != req.ClaimToken {
		store.mu.Unlock()
		writeError(w, http.StatusUnauthorized, "unauthorized", "claim mismatch")
		return
	}
	if leaderEnabled {
		if req.LeaderToken == 0 {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_required", "leader token missing")
			return
		}
		if req.LeaderToken != leaderToken {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
			return
		}
		if t.LeaderToken > 0 && t.LeaderToken != leaderToken {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "task owned by newer leader")
			return
		}
	}
	if t.Status != string(StateRunning) {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "state_conflict", "task not running")
		return
	}
	if leaseExpired(t.LeaseUntil) {
		store.mu.Unlock()
		writeError(w, http.StatusConflict, "lease_expired", "task lease expired")
		return
	}
	t.LeaseUntil = time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339)
	t.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if leaderEnabled {
		t.LeaderToken = leaderToken
	}
	if err := store.persistTask(*t); err != nil {
		if err == ErrLeaderConflict {
			store.mu.Unlock()
			writeError(w, http.StatusConflict, "leader_conflict", "stale leader token")
			return
		}
		store.mu.Unlock()
		writeError(w, http.StatusInternalServerError, "persist_error", "failed to persist task")
		return
	}
	store.appendEvent(*t)
	store.audit.Log("task_renew", map[string]any{"task_id": t.ID, "agent_id": req.ClaimedBy})
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
		next_eligible TEXT,
		leader_token INTEGER DEFAULT 0,
		coin_bounty_id TEXT,
		coin_status TEXT,
		coin_last_error TEXT
	)`)
	// Add columns with backwards compatibility
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN lease_expiries INTEGER")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN next_eligible TEXT")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN leader_token INTEGER")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN coin_bounty_id TEXT")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN coin_status TEXT")
	_, _ = db.Exec("ALTER TABLE tasks ADD COLUMN coin_last_error TEXT")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		json TEXT NOT NULL,
		last_seen TEXT
	)`)
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS devices_last_seen_idx ON devices(last_seen)")
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS leader_lease (
		id TEXT PRIMARY KEY,
		holder TEXT NOT NULL,
		expires_at TEXT NOT NULL,
		token INTEGER DEFAULT 0
	)`)
	// Coin metrics table for persistent counters
	_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS coin_metrics (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TEXT NOT NULL,
		operation TEXT NOT NULL,
		success INTEGER NOT NULL,
		task_id TEXT,
		bounty_id TEXT,
		error_message TEXT
	)`)
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS coin_metrics_timestamp_idx ON coin_metrics(timestamp)")
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS coin_metrics_operation_idx ON coin_metrics(operation)")
	return db
}

func (s *TaskStore) persistTask(t Task) error {
	if s.db == nil {
		return nil
	}
	if leaderEnabled {
		var existing int64
		row := s.db.QueryRow("SELECT leader_token FROM tasks WHERE id = ?", t.ID)
		_ = row.Scan(&existing)
		if existing > 0 && existing > t.LeaderToken {
			return ErrLeaderConflict
		}
	}
	b, _ := json.Marshal(t)
	_, err := s.db.Exec(`INSERT INTO tasks (id, json, status, updated_at, attempts, lease_expiries, claimed_by, lease_until, next_eligible, leader_token, coin_bounty_id, coin_status, coin_last_error)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET json=excluded.json, status=excluded.status, updated_at=excluded.updated_at,
			attempts=excluded.attempts, lease_expiries=excluded.lease_expiries, claimed_by=excluded.claimed_by, lease_until=excluded.lease_until,
			next_eligible=excluded.next_eligible, leader_token=excluded.leader_token, coin_bounty_id=excluded.coin_bounty_id,
			coin_status=excluded.coin_status, coin_last_error=excluded.coin_last_error`,
		t.ID, string(b), t.Status, t.UpdatedAt, t.Attempts, t.LeaseExpiries, t.ClaimedBy, t.LeaseUntil, t.NextEligible, t.LeaderToken,
		t.CoinBountyID, t.CoinStatus, t.CoinLastError)
	if err != nil {
		return err
	}
	s.writeCount += 1
	if s.writeCount%100 == 0 {
		_, _ = s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE);")
	}
	return nil
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

		// backfill content hash and leader token for legacy tasks so they can continue
		if t.ContentHash == "" {
			t.ContentHash = taskContentHash(t, s.worldRepo)
		}
		if leaderEnabled && t.LeaderToken == 0 {
			t.LeaderToken = leaderToken
		}

		s.tasks[t.ID] = &t
		if t.Status == string(StateRunning) && leaseExpired(t.LeaseUntil) {
			if next, ok := transition(StateRunning, EventLeaseExpire); ok {
				t.Status = string(next)
				t.ClaimedBy = ""
				t.ClaimToken = ""
				t.LeaseUntil = ""
				if t.MaxAttempts > 0 && t.Attempts >= t.MaxAttempts {
					t.Status = string(StateFailed)
				}
			}
		}
		if t.Status == string(StateRunning) && (t.ClaimedBy == "" || t.ClaimToken == "" || t.LeaseUntil == "") {
			if next, ok := transition(StateRunning, EventLeaseExpire); ok {
				t.Status = string(next)
				t.ClaimedBy = ""
				t.ClaimToken = ""
				t.LeaseUntil = ""
				t.LeaseExpiries += 1
				t.Attempts += 1
				t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
			}
		}
		if t.Status == string(StateRunning) {
			limit := 10 * time.Minute
			if t.TimeoutSec > 0 {
				limit = time.Duration(t.TimeoutSec) * time.Second * 2
				if limit < 30*time.Second {
					limit = 30 * time.Second
				}
				if limit > 30*time.Minute {
					limit = 30 * time.Minute
				}
			}
			stale := false
			if t.UpdatedAt != "" {
				if ts, err := time.Parse(time.RFC3339, t.UpdatedAt); err == nil && time.Since(ts) > limit {
					stale = true
				}
			} else {
				// missing timestamps still expire after the computed limit
				stale = true
			}
			if stale {
				if next, ok := transition(StateRunning, EventLeaseExpire); ok {
					t.Status = string(next)
					t.ClaimedBy = ""
					t.ClaimToken = ""
					t.LeaseUntil = ""
					t.LeaseExpiries += 1
					t.Attempts += 1
					t.NextEligible = time.Now().UTC().Add(retryBackoff(t.Attempts)).Format(time.RFC3339)
				}
			}
		}
		if t.Status == string(StateRunning) && !leaseExpired(t.LeaseUntil) {
			// reconcile long-running stale tasks (safety for clock skew / missed renewals)
			if t.UpdatedAt != "" {
				if ts, err := time.Parse(time.RFC3339, t.UpdatedAt); err == nil {
					if time.Since(ts) > 10*time.Minute {
						if next, ok := transition(StateRunning, EventLeaseExpire); ok {
							t.Status = string(next)
							t.ClaimedBy = ""
							t.ClaimToken = ""
							t.LeaseUntil = ""
						}
					}
				}
			}
		}
		if t.Status == string(StateQueued) {
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
		if err != nil {
			continue
		}
		if t.Before(cutoff) {
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

func requireLeader(w http.ResponseWriter) bool {
	if leaderEnabled && !leaderActive {
		writeError(w, http.StatusServiceUnavailable, "not_leader", "leader lease required")
		return false
	}
	return true
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
	// allow small clock skew between leader and agents
	return time.Now().UTC().After(t.Add(5 * time.Second))
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

func randToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func taskContentHash(t Task, worldRepo string) string {
	h := sha256.New()
	write := func(s string) {
		h.Write([]byte(s))
		h.Write([]byte{0})
	}
	write(t.Type)
	write(t.Command)
	write(t.ScriptPath)
	write(strconv.Itoa(t.TimeoutSec))
	write(strconv.Itoa(t.MaxAttempts))
	if len(t.RequiredTags) > 0 {
		sorted := append([]string{}, t.RequiredTags...)
		sort.Strings(sorted)
		for _, tag := range sorted {
			write(tag)
		}
	}
	if t.Type == "script" {
		// enforce repo awareness and relative paths so we hash the actual bytes we plan to run
		if worldRepo == "" || filepath.IsAbs(t.ScriptPath) || strings.Contains(t.ScriptPath, "..") || t.ScriptPath == "" {
			return ""
		}
		full := filepath.Join(worldRepo, t.ScriptPath)
		b, err := os.ReadFile(full)
		if err != nil {
			return ""
		}
		h.Write([]byte(strconv.Itoa(len(b))))
		if len(b) > 1024*1024 {
			b = b[:1024*1024]
		}
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil))
}

func getHostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
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

func coinPostBounty(ctx context.Context, coin CoinIntegration, t Task, cfg Config) (string, error) {
	if !coin.enabled || coin.client == nil {
		return "", fmt.Errorf("coin disabled")
	}
	ctx, cancel := context.WithTimeout(ctx, coin.timeout)
	defer cancel()
	reward := fmt.Sprintf("%d", coin.reward)
	var b *atlascoin.Bounty
	var err error
	for i := 0; i < 3; i++ {
		b, err = coin.client.PostBounty(ctx, coin.poster, t.Type, reward)
		if err == nil {
			atomic.AddUint64(&coinMetrics.postOK, 1)
			updateCoinStatus(t.ID, "posted", "", b.ID)
			return b.ID, nil
		}
		time.Sleep(time.Duration(i+1) * 200 * time.Millisecond)
	}
	atomic.AddUint64(&coinMetrics.postFail, 1)
	updateCoinStatus(t.ID, "post_failed", err.Error(), "")
	if err != nil {
		return "", err
	}
	return b.ID, nil
}

func coinSubmitSolution(ctx context.Context, coin CoinIntegration, t *Task, agent string) error {
	if !coin.enabled || coin.client == nil || t.CoinBountyID == "" {
		return fmt.Errorf("coin disabled or missing bounty id")
	}
	ctx, cancel := context.WithTimeout(ctx, coin.timeout)
	defer cancel()
	stake := fmt.Sprintf("%d", (coin.reward*coin.stakePct)/100)
	var err error
	for i := 0; i < 3; i++ {
		_, err = coin.client.SubmitSolution(ctx, t.CoinBountyID, agent, stake, map[string]any{
			"task_id": t.ID,
		})
		if err == nil {
			atomic.AddUint64(&coinMetrics.submitOK, 1)
			updateCoinStatus(t.ID, "submitted", "", t.CoinBountyID)
			return nil
		}
		time.Sleep(time.Duration(i+1) * 200 * time.Millisecond)
	}
	atomic.AddUint64(&coinMetrics.submitFail, 1)
	updateCoinStatus(t.ID, "submit_failed", err.Error(), t.CoinBountyID)
	return err
}

func coinSettle(ctx context.Context, coin CoinIntegration, t *Task, success bool) error {
	if !coin.enabled || coin.client == nil || t.CoinBountyID == "" {
		return fmt.Errorf("coin disabled or missing bounty id")
	}
	ctx, cancel := context.WithTimeout(ctx, coin.timeout)
	defer cancel()

	evidence := map[string]any{"ci_passed": success}
	var err error
	var res *atlascoin.VerificationResult
	for i := 0; i < 3; i++ {
		res, err = coin.client.Verify(ctx, t.CoinBountyID, evidence)
		if err == nil {
			atomic.AddUint64(&coinMetrics.verifyOK, 1)
			break
		}
		time.Sleep(time.Duration(i+1) * 200 * time.Millisecond)
	}
	if err != nil {
		atomic.AddUint64(&coinMetrics.verifyFail, 1)
		updateCoinStatus(t.ID, "verify_failed", err.Error(), t.CoinBountyID)
		return err
	}
	if res != nil && !res.Passed {
		atomic.AddUint64(&coinMetrics.verifyFail, 1)
		updateCoinStatus(t.ID, "verify_failed", "verify returned false", t.CoinBountyID)
		return fmt.Errorf("coin verify failed for bounty %s", t.CoinBountyID)
	}

	for i := 0; i < 3; i++ {
		_, err = coin.client.Settle(ctx, t.CoinBountyID)
		if err == nil {
			atomic.AddUint64(&coinMetrics.settleOK, 1)
			return nil
		}
		time.Sleep(time.Duration(i+1) * 200 * time.Millisecond)
	}
	atomic.AddUint64(&coinMetrics.settleFail, 1)
	return err
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func nonZero(v, def int) int {
	if v == 0 {
		return def
	}
	return v
}
