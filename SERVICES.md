# Atlas Services Architecture

## Overview

Atlas is a distributed task execution system with two core services:
- **Control Plane**: Central task orchestration service
- **Node Agent**: Distributed task execution worker

## Services

### Control Plane

**Location**: `~/Atlas/atlas/services/control-plane/`

**Purpose**: Central task queue, device registry, and leader election.

**Key Features**:
- Task submission, claiming, reporting, renewal
- Device registration with TTL
- Content hash validation
- Atlas Coin integration (optional)
- SQLite backend
- OpenTelemetry tracing (Task 3)

**Configuration**: `~/.config/atlas/control-plane.json`

**Environment Variables**:
```bash
ATLAS_CONTROL_PLANE_URL=http://localhost:8892
ATLAS_API_TOKEN_FILE=$HOME/.secrets/atlas-token
ATLAS_DATA_DIR=$HOME/Atlas/data
ATLAS_COIN_ENABLED=false
ATLAS_INSECURE=0
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Register device |
| `/heartbeat` | POST | Device heartbeat |
| `/devices` | GET | List devices |
| `/tasks/submit` | POST | Submit task |
| `/tasks/claim` | POST | Claim task |
| `/tasks/report` | POST | Report completion |
| `/tasks/renew` | POST | Renew task lease |
| `/tasks/list` | GET | List tasks |
| `/health` | GET | Health check |
| `/coin/metrics` | GET | Coin metrics |

**How to Start**:
```bash
# Development (tmux)
cd ~/Atlas
./scripts/dev_up.sh

# Production (systemd)
systemctl --user start atlas-control-plane
```

**How to Stop**:
```bash
# Development
cd ~/Atlas
./scripts/dev_down.sh

# Production
systemctl --user stop atlas-control-plane
```

---

### Node Agent

**Location**: `~/Atlas/atlas/agents/node-agent/`

**Purpose**: Task execution worker with command allowlist.

**Key Features**:
- Task polling from control-plane
- Command allowlist enforcement
- Lease management
- Heartbeat to control-plane
- Capability reporting
- OpenTelemetry trace propagation (Task 3)

**Configuration**: `~/.config/atlas/agent.json`

**Environment Variables**:
```bash
NODE_AGENT_ID=agent-local
ATLAS_CONTROL_PLANE_URL=http://localhost:8892
ATLAS_API_TOKEN_FILE=$HOME/.secrets/atlas-token
```

**How to Start**:
```bash
# Development (via dev_up.sh)
# Started automatically in tmux bottom pane

# Production (systemd)
systemctl --user start atlas-node-agent
```

**Command Allowlist**:
- Defined in `~/Atlas/atlas/agents/node-agent/cmd/node-agent/allowlist.go`
- Whitelist approach: only allowed commands execute
- Validates command paths and arguments

---

### MCP Server (NEW - Task 4)

**Location**: `~/Atlas/atlas/services/control-plane/mcp-server/`

**Purpose**: Expose control-plane API via Model Context Protocol for AI agent integration.

**Key Features**:
- Tools: submit_task, claim_task, list_devices, list_tasks
- Token-based authentication (from file, not env)
- JSON Schema validation for all inputs
- Graceful shutdown handling

**Configuration**: Registered in `~/.claude.json`

**How to Start**:
- Started automatically by Claude Code when MCP server configured
- Stdio protocol - no HTTP port

---

## Service Dependencies

### Required

1. **Configuration** (chezmoi-managed):
   - `~/.config/atlas/control-plane.json`
   - `~/.config/atlas/agent.json`
   - Setup: `./scripts/bootstrap_chezmoi.sh`

2. **Environment**:
   - `.env` file with required variables
   - Setup: `./scripts/setup-env.sh` (Task 1)

3. **Secrets**:
   - `~/.secrets/atlas-token` - API authentication token
   - Created by setup script with chmod 600

4. **Data Directory**:
   - `~/Atlas/data/` for SQLite database
   - Auto-created on first run

### Optional

1. **Observability** (Task 3 - OpenTelemetry):
   - OTel Collector running on `localhost:4317`
   - Jaeger/Tempo for trace visualization
   - Prometheus for metrics

2. **MCP Server** (Task 4):
   - Go MCP server wrapping control-plane API
   - Registered in `~/.claude.json`

3. **Discord Alerting** (Atlas_MCP):
   - Perplexity proxy on `localhost:8765`
   - Discord webhook in `~/.secrets/discord-atlas-webhook`

---

## Service Startup Order

**Initial Start**:
1. Configure chezmoi: `./scripts/bootstrap_chezmoi.sh`
2. Setup environment: `./scripts/setup-env.sh` (Task 1)
3. Deploy OTel Collector: `docker run -d ...` (Task 3.0)
4. Start services: `./scripts/dev_up.sh`

**Normal Start**:
1. Source environment: `source ~/Atlas/.env`
2. Start services: `./scripts/dev_up.sh`

**Production Start**:
1. Ensure environment loaded
2. `systemctl --user start otel-collector` (if deployed)
3. `systemctl --user start atlas-control-plane`
4. `systemctl --user start atlas-node-agent`

---

## Service Health Checks

### Control Plane
```bash
curl http://localhost:8892/health
# Expected: {"status":"healthy","devices":X}
```

### Node Agent
```bash
ps aux | grep node-agent | grep -v grep
# Expected: Running process
```

### MCP Server
```bash
mcp-cli tools atlas-control-plane
# Expected: List of 4 tools
```

### OTel Collector
```bash
curl http://localhost:4317/health
# Expected: 200 OK
```

---

## Troubleshooting

### Control Plane Won't Start
- Check token file exists: `ls -l ~/.secrets/atlas-token`
- Check port 8892 not in use: `ss -tlnp | grep 8892`
- Check config: `~/.config/atlas/control-plane.json`
- Check .env sourced: `echo $ATLAS_API_TOKEN_FILE`

### Node Agent Can't Claim Tasks
- Check control-plane is running: `curl http://localhost:8892/health`
- Check agent config: `~/.config/atlas/agent.json`
- Check allowlist includes command
- Check token file readable by agent

### MCP Server Not Found
- Check registered in `~/.claude.json`
- Check binary exists: `ls -l ~/Atlas/atlas/services/control-plane/mcp-server/mcp-server`
- Check token file path correct

### No Traces in OTel Collector
- Check collector running: `docker ps | grep otel`
- Check control-plane exporting to correct endpoint: `echo $OTEL_EXPORTER_OTLP_ENDPOINT`
- Check sampling not filtering: `echo $OTEL_TRACES_SAMPLER_ARG` (use 1.0 for dev)

---

## Current Status

| Service | Running | Method | Notes |
|---------|---------|--------|-------|
| Control Plane | ❌ | Manual | Requires dev_up.sh |
| Node Agent | ✅ | Process | PID: 1144334 |
| MCP Server | ❌ | N/A | Not implemented yet |
| OTel Collector | ❌ | Docker | Not deployed yet |

---

## Security Notes

**Token Storage**:
- API tokens stored in `~/.secrets/` directory with chmod 600
- NOT passed via environment variables (not visible in ps aux)
- MCP server reads from file, validates before each request

**Type Safety**:
- All MCP tool inputs validated with JSON Schema
- Safe type assertions with error returns (no panics)
- HTTP timeouts prevent hanging requests

**Graceful Shutdown**:
- OTel TracerProvider properly shutdown on SIGTERM/SIGINT
- MCP server handles signals cleanly
- No resource leaks

---

## Next Steps (This Plan)

1. ✅ Task 1: Environment setup script
2. ✅ Task 2: Commit user story tests
3. ✅ Task 3: Implement OpenTelemetry visibility
4. ✅ Task 4: Create Go MCP server
5. ✅ Task 5: Document services (this file)

---

**Last Updated**: January 12, 2026 (Cycle 1 fixes applied)
**Atlas Version**: 0.1.0 (development)
**Validation**: Passed doubt Cycle 1 with fixes applied
