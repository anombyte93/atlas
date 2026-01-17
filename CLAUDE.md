# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Atlas is a **Personal AI Hive-Mind Platform** - a distributed system that orchestrates AI work across multiple devices. Think of it as mission control for your AI ecosystem.

### Architecture

Atlas follows a **microservices architecture** with three core components:

1. **World Model** (`atlas/config/`) - Git-based configuration repository with JSON Schema validation defining agents, devices, services, and policies
2. **Control Plane** (`atlas/services/control-plane/`) - Central orchestrator for device registry, task routing, and leader election
3. **Node Agent** (`atlas/agents/node-agent/`) - Lightweight per-device daemon that advertises capabilities and executes tasks

### Key Design Principles

- **Each service is a separate Go module** - No monorepo dependencies; `atlas-control-plane` and `atlas-node-agent` build independently
- **Schema-first configuration** - All entities (agents, devices, tasks, policies) have JSON schemas in `atlas/config/`
- **SQLite for persistence** - Control plane uses `modernc.org/sqlite` (pure Go, no CGo) for device registry, tasks, and leases
- **Leader lease mechanism** - Prevents split-brain scenarios in distributed deployments
- **Content hash enforcement** - Tasks have SHA-256 content hashes for integrity verification
- **AtlasCoin integration** - Token-based economics for task rewards (optional feature)

## Build and Development

### Building Services

Each service is a separate Go module with its own `go.mod`:

```bash
# Build control plane
cd atlas/services/control-plane
go build -o bin/control-plane ./cmd/control-plane

# Build node agent
cd atlas/agents/node-agent
go build -o bin/node-agent ./cmd/node-agent
```

### Running Tests

```bash
# Control plane tests
cd atlas/services/control-plane
go test ./cmd/control-plane/...
go test ./internal/atlascoin/...

# Run specific test
go test -v ./cmd/control-plane -run TestContentHash
```

### Running Services

```bash
# Control plane (default port :8080)
cd atlas/services/control-plane
./bin/control-plane -config control-plane.json

# Node agent
cd atlas/agents/node-agent
./bin/node-agent -config archie.json
```

## Directory Structure

```
atlas/
├── agents/node-agent/          # Per-device agent (separate Go module)
│   ├── cmd/node-agent/         # Entry point
│   └── go.mod
├── services/control-plane/     # Central orchestrator (separate Go module)
│   ├── cmd/control-plane/      # Entry point + main logic
│   ├── internal/atlascoin/     # AtlasCoin client
│   └── go.mod
├── config/                     # World model - all configuration
│   ├── schemas/                # JSON Schema definitions
│   ├── examples/               # Sample configurations
│   ├── agents/                 # Agent definitions
│   ├── devices/                # Device definitions
│   ├── control-plane.json      # Control plane config
│   └── llm-providers.json      # LLM provider configs
├── logging/                    # Log event schemas
└── chezmoi/                    # Machine-specific config sync (dotfile management)

Atlas_MCP/                      # MCP integration (Discord alerts, Perplexity proxy)
scripts/                        # Utility scripts
.env                            # API keys (not tracked - use .env.example)
data/                           # SQLite databases and runtime data
```

## Configuration System

### JSON Schemas

All entities are validated against JSON schemas:

- `agent.schema.json` - Agent configuration (heartbeat intervals, permissions, allowed commands)
- `device.schema.json` - Device definition (hostname, roles, capabilities)
- `task.schema.json` - Task definition (command, timeout, required tags, content hash)
- `policy.schema.json` - Security policies
- `log-event.schema.json` - AI interaction logging schema

### Device Roles

Devices declare roles from: `server`, `network_device`, `workstation`, `container_host`, `iot_embedded`

### Capability Matching

Tasks are routed to devices based on:
- CPU cores, memory requirements
- OS and architecture
- Custom tags (e.g., "gpu", "nvidia", "local-llm")

## Control Plane Internals

### Core Data Structures

Located in `cmd/control-plane/main.go`:

- `Device` - Registered devices with capabilities and metrics
- `Task` - Task queue with state machine (pending → running → completed/failed)
- `Config` - Service configuration from JSON

### Task State Machine

Tasks progress through states: `pending` → `running` → `completed`|`failed`. Tasks have:
- `ClaimToken` - Unique token to prevent duplicate claims
- `LeaseUntil` - Timeout for task execution
- `ContentHash` - SHA-256 of command/script for integrity
- `Attempts` - Retry tracking with `MaxAttempts`

### Leader Election

When enabled (`LeaderLeaseEnabled: true`), control planes compete for leadership via:
- `LeaderID` - Unique identifier for this instance
- `LeaderLeaseSeconds` - Lease duration
- `LeaderRenewSeconds` - Renewal interval

### SQLite Schema

Tables: `devices`, `tasks`, `leases`, `metrics`, `atlascoin_queue`

Database location: Configured via `DataDir` in control-plane.json (default: `./data/`)

## Security Model

- **API Token Required** - All HTTP endpoints require `Authorization: Bearer <token>` header
- **Allowlist Commands** - Agents only execute commands in `allowed_commands` array (unless `allow_all_commands: true`)
- **Path Permissions** - `permissions.read_only` and `permissions.allowed_paths` restrict filesystem access
- **TLS Support** - Optional TLS with client CA certificates for mTLS

## Environment Variables

Required API keys in `.env`:
- `ANTHROPIC_API_KEY` - Claude access
- `PERPLEXITY_API_KEY` - Perplexity AI (for Atlas_MCP proxy)
- Others optional based on provider usage

## Atlas Integration Points

### chezmoi

Machine-specific configurations are managed via chezmoi in `atlas/chezmoi/`. This allows per-device overrides while keeping the world model in git.

### Atlas_MCP

MCP (Model Context Protocol) integration provides:
- Discord webhook alerts for system events
- Perplexity proxy server (port 8765) with `sonar-deep-research` model
- AI-powered log monitoring

## Common Workflows

### Adding a New Device

1. Create device config in `atlas/config/devices/<hostname>.json`
2. Run node agent with that config
3. Agent registers with control plane via `/api/v1/register`
4. Device appears in `atlas status` output

### Submitting a Task

POST to `/api/v1/tasks` with:
```json
{
  "type": "command",
  "command": "echo 'hello'",
  "required_tags": ["gpu"],
  "timeout_sec": 60
}
```

### Debugging Task Routing

- Check device capabilities: `GET /api/v1/devices`
- View task queue: `GET /api/v1/tasks`
- Inspect device logs for heartbeat/polling activity

## Important Notes

- **Go 1.21 required** - Both services use Go 1.21 modules
- **No external dependencies for node agent** - Minimal footprint for edge devices
- **Control plane requires modernc.org/sqlite** - Pure Go SQLite, no CGo
- **Data directory** - SQLite files and runtime state stored in `./data/` by default
- **Config changes** - Control plane reloads config on restart; no hot-reload yet

---

## 🎯 1 Million Target Discovery Directive (CURRENT SESSION)

**Goal**: Discover 1 million+ targets using systematic discovery tools, then filter down to exploitable targets.

**Workflow**:

**Phase 1: Shodan MASSIVE Discovery** (Target: 500K+)
- Query Shodan API for exposed services: Apache, Nginx, OpenSSH, port 80/443
- Search for specific exposures: Elasticsearch, MongoDB, Redis, Kubernetes
- Extract IPs and hostnames from results
- **Tool**: `curl "https://api.shodan.io/shodan/search?key=$SHODAN_KEY&query=..."`

**Phase 2: Subfinder MASSIVE Enumeration** (Expand to 5M+)
- Extract root domains from Shodan results
- Run subfinder on each root domain
- Collect all subdomains
- **Tool**: `~/.pdtm/go/bin/subfinder -d $domain -silent`

**Phase 3: httpx Probing** (Find live hosts)
- Probe all discovered targets for HTTP/HTTPS
- Get status codes, titles, tech stack, server info
- **Tool**: `~/.pdtm/go/bin/httpx -l targets.txt -status-code -title -tech -server`

**Phase 4: PRIMARY FILTER** (High-value targets)
1. **Priority 1**: Exposed databases (Elasticsearch, MongoDB, Redis, Cassandra, MySQL, PostgreSQL)
2. **Priority 2**: Exposed admin panels (admin, dashboard, console, manager, login)
3. **Priority 3**: Test/Dev environments (dev, test, staging, beta, demo, sandbox, int)
4. **Priority 4**: API endpoints (api.* domains for IDOR)

**Phase 5: SECONDARY FILTER** (Refinement)
1. Keep only 200 OK responses (actually accessible)
2. Remove well-protected platforms (google, facebook, microsoft, amazon, apple, netflix, cloudflare)
3. Remove WAF-protected endpoints (Cloudflare, Incapsula, Akamai, Fastly)

**Phase 6: SCORING** (Top candidates)
- Score by exploitability factors:
  - Database exposure: +50 points
  - Admin panel exposure: +30 points
  - Test/dev environment: +20 points
  - API endpoint: +25 points
  - Fast response (<0.5s): +10 points
- Sort by score, keep top 10,000

**Phase 7: FINAL OUTPUT**
- `exploitable_targets.txt` - Top 10,000 scored targets
- `discovery_summary.txt` - Full summary with counts and top 20

**Execution**:
```bash
cd /home/anombyte/Atlas/ARC/workspace/operations/20260116
chmod +x discovery_1M.sh
nohup ./discovery_1M.sh > discovery_1M.out 2>&1 &
```

**Progress Monitoring**:
```bash
tail -f /home/anombyte/Atlas/ARC/workspace/operations/20260116/discovery_1M.log
wc -l /home/anombyte/Atlas/ARC/workspace/operations/20260116/targets_db.txt
```

**Success Criteria**:
- ✅ 1,000,000+ targets discovered
- ✅ Filtered down to top 10,000 exploitable candidates
- ✅ Prioritized by exploitability score
