# Research: Atlas Visibility System & MCP Integration

**Date**: 2025-01-12
**Mode**: Ultra
**Tier Used**: 3 (Perplexity Pro)
**Confidence**: 0.87
**Complexity**: 8/10

## Executive Summary

**Key Finding**: Atlas should adopt OpenTelemetry-first observability with MCP as a thin, stateless integration layer wrapping existing Go microservices, not embedding business logic directly in tools.

The research reveals that 2025 best practices favor treating MCP servers as OAuth resource servers with strict input validation, centralized discovery registries, and clear separation between orchestration (MCP) and domain logic (existing gRPC/HTTP services). For visibility, OpenTelemetry everywhere with traces-first architecture feeding a single logical observability backplane is the dominant pattern.

## Findings

### 1. Atlas Visibility System Architecture

**Current State (from codebase analysis)**:
- Atlas is a distributed task execution system with control-plane → node-agent architecture
- Task execution API includes: submit, claim, report, renew with content hash validation
- Existing visibility components:
  - `/home/anombyte/Atlas/atlas-visibility-fix/` - Dedicated visibility system rewrite worktree
  - `Atlas_MCP/` - Discord alerting stack with AI-powered log monitoring
  - Task execution tracking with claim tokens, leader election, content hash enforcement

**Key Components Identified**:
1. **Task Execution Layer** (atlas/docs/task-execution.md):
   - Claim tokens for lease management
   - Content hash validation for security
   - Leader token enforcement for distributed coordination
   - Schema versioning (v1.0.0)

2. **Alerting Layer** (Atlas_MCP/):
   - Discord webhook notifications
   - AI-powered alert filtering (Perplexity proxy on port 8765)
   - Log watcher with grep-based error detection
   - Priority-based routing (CRITICAL → discord+ntfy, HIGH → discord, MEDIUM/LOW → digest)

3. **Visibility System Rewrite** (atlas-visibility-fix/):
   - Worktree with sprint prompts (A-E)
   - Audit trail and validation documentation
   - Comprehensive workflow planning

**Gap Analysis**:
- **Missing**: Distributed tracing (no OpenTelemetry integration found)
- **Missing**: Centralized metrics collection (no Prometheus/Mimir setup)
- **Missing**: Structured logging correlation (logs not linked to trace IDs)
- **Partial**: Alerting exists but lacks observability backplane integration
- **Partial**: Content hash validation exists but no execution visibility

### 2. MCP Integration Patterns

**From Perplexity Pro Research**:

**Architecture & Layering**:
- Keep MCP servers **stateless** and wrap existing gRPC/HTTP services
- Use MCP only as orchestration and translation layer
- Model each microservice as distinct MCP server with cohesive tool surface
- Centralize discovery and trust in registry (per org, env, cluster)

**Go Implementation Patterns**:
- Use maintained Go MCP implementation (mcp-go, go-go-mcp) instead of rolling own JSON-RPC
- If using gRPC/Connect, generate MCP handlers from protobuf (protoc-gen-go-mcp)
- Structure tools around stable, idempotent operations with explicit JSON Schema
- Keep payloads small, design for streaming on large/incremental responses

**Security, Auth, Tenancy (2025 Updates)**:
- Treat MCP servers as OAuth resource servers
- Require auth on every non-trivial tool call
- Use resource indicators/scopes to lock tools to specific tenants/datasets
- Implement strict input validation at MCP boundary (JSON Schema, rate limits, size limits)
- Isolate sensitive tools into separate MCP servers with per-server trust policies

**Ops, Observability, Performance**:
- Log every MCP call with correlation IDs, user/session IDs, tool name, latency, result size
- Apply SRE practices: QPS, p95/p99 latency, error rates per tool, circuit breakers
- Cache cheap, deterministic reads near MCP server
- Coalesce multiple fine-grained tools into "task-level" tools to reduce round-trips

**Relevant to Atlas**:
- Current Atlas_MCP is bash/Python scripts, not Go microservices
- Should migrate to Go-based MCP servers wrapping control-plane HTTP API
- Implement OAuth-style auth for task submission/claiming/reporting
- Add observability to every MCP tool call (correlation ID tracing)

### 3. Go Microservices Environment Setup

**From Perplexity Pro Research**:

**Core Architecture Pattern (2025)**:
```
[Per-service OTel SDK] → [OTel Collector] → [Observability Platform]
                         (batching,        (Jaeger/Tempo +
                          enrichment,       Prometheus/Mimir +
                          sampling)         Loki/ELK)
```

**Key Observability Design Patterns**:
- **Distributed tracing & context propagation**: Every request gets trace ID, propagated through HTTP/gRPC/messaging
- **Centralized, correlated telemetry**: Logs/metrics/traces tagged with service name, version, environment, trace/span IDs
- **Sampling and data control**: Head/tail-based sampling, adaptive sampling for cost control
- **Service mesh / zero-code instrumentation**: eBPF/sidecar for auto-capture when manual instrumentation inconsistent

**Go-Specific Practices (2025)**:
- Layered/service-oriented code with context-first APIs
- Standardized OpenTelemetry setup packages shared as internal libraries
- Vendor-neutral OTLP from Go services to OTel Collector
- Pervasive OTel, strong context propagation, collector tier as default

**Atlas-Specific Environment Setup**:

**Current State** (from .env example):
```bash
OPENAI_COMPATIBLE_API_KEY=local-free
PERPLEXITY_API_KEY=local-free
ANTHROPIC_API_KEY=dummy
PERPLEXITY_COOKIE=<long session token>
```

**Missing for Production**:
- Database connection strings (PostgreSQL for task queue?)
- Service discovery URLs (control-plane endpoint, node-agent registration)
- Observability backplane config (OTLP endpoint, Jaeger/Tempo URLs)
- Auth config (JWT signing keys, OAuth endpoints)
- Feature flags (leader election enabled/disabled)

**Recommended .env.example Structure**:
```bash
# Core Services
CONTROL_PLANE_URL=http://localhost:8080
NODE_AGENT_ID=agent-local
WORLD_REPO=/path/to/repo

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=atlas-node-agent
OTEL_TRACES_SAMPLING=1.0  # 100% for dev, 0.1 for prod

# Auth
API_TOKEN=<token-for-control-plane-auth>
JWT_SIGNING_KEY=<for-mcp-oauth>

# MCP Integration
MCP_SERVER_URL=http://localhost:3000
MCP_REGISTRY_URL=http://localhost:3001
MCP_AUTH_MODE=oauth  # or bearer-token

# External APIs
PERPLEXITY_PROXY_URL=http://localhost:8765
DISCORD_WEBHOOK_FILE=~/.secrets/discord-atlas-webhook
```

**Service Orchestration Recommendations**:
- **Local dev**: systemd user services (already used for atlas-log-watcher)
- **Production**: Kubernetes with operator pattern (one deployment per service)
- **Edge cases**: Docker Compose for single-node deployments

### 4. Implementation Recommendations for Atlas

**Priority 1: OpenTelemetry Integration** (Foundational)
1. Add OTel Go SDK to control-plane and node-agent
2. Initialize tracer/meter/logger with OTLP exporter
3. Add HTTP middleware for automatic tracing
4. Propagate trace context through task execution (submit → claim → report)
5. Ship to OTel Collector → Jaeger/Tempo

**Priority 2: MCP Server Go Rewrite** (Integration)
1. Create Go MCP server wrapping control-plane HTTP API
2. Use maintained Go MCP library (avoid bash/Python for core MCP)
3. Implement OAuth resource server pattern for auth
4. Add JSON Schema validation for all tool inputs
5. Log every MCP call with correlation ID

**Priority 3: Centralized Observability Backplane** (Visibility)
1. Deploy OTel Collector (per-node or per-namespace)
2. Configure traces → Tempo/Jaeger, metrics → Prometheus/Mimir, logs → Loki
3. Build Grafana dashboards for task execution visibility
4. Set up alerting rules (task failure rate, claim timeout, queue depth)
5. Integrate existing Discord alerting into observability platform

**Priority 4: Environment Configuration** (Setup)
1. Create comprehensive .env.example with all required vars
2. Add environment validation on startup (fail fast if missing)
3. Support env-specific config (dev/stage/prod registries)
4. Document all secrets management (webhooks, API keys, tokens)

## Key Takeaways

1. **Treat MCP as thin orchestration layer, not business logic host**: Atlas should wrap existing control-plane HTTP API in Go MCP servers, not rewrite domain logic. MCP handles translation, auth, observability; control-plane handles task execution semantics.

2. **OpenTelemetry everywhere is non-negotiable in 2025**: Distributed tracing with context propagation is the foundation of microservices observability. Atlas needs trace IDs flowing from task submission through claim/report/renew to enable request-level visibility.

3. **Security and tenancy at MCP boundary**: 2025 MCP guidance requires treating MCP servers as OAuth resource servers with per-tool auth scopes, strict input validation, and per-server trust policies. Atlas content hash validation is a good start; add OAuth-style auth for MCP layer.

4. **Observability backplane before custom tooling**: Before building custom dashboards, deploy standard OTel stack (Collector + Tempo/Prometheus/Loki). Atlas_MCP Discord alerting should consume from this backplane, not bypass it.

5. **Environment-driven configuration with validation**: Comprehensive .env.example with startup validation prevents runtime failures. Support env-specific MCP registries (dev tools, cluster tools, third-party) with different trust levels.

## Sources

### Tier 1: Local Knowledge

1. **System-Knowledge Semantic Search** (score: 0.62)
   - MCP Tool Architecture documentation
   - MCP Hub Orchestrator patterns
   - ai-workflow-orchestrator reference architecture

2. **Terminal Context Search** (47% match)
   - MCP setup completion history
   - Nextcloud/Dropbox MCP configuration patterns

### Tier 3: Perplexity Pro Research

3. **MCP Model Context Protocol integration best practices Go microservices 2025**
   - Statelessness and wrapping existing services
   - Go implementation patterns (mcp-go, protoc-gen-go-mcp)
   - OAuth resource server security model
   - Per-tool auth scopes and input validation
   - Observability requirements (correlation IDs, latency logging)

4. **Go microservices observability visibility architecture patterns 2025**
   - OpenTelemetry everywhere pattern
   - Distributed tracing with W3C trace-context propagation
   - OTel Collector layer for batching/enrichment/sampling
   - Go-specific practices (context-first APIs, shared OTel packages)
   - Service mesh vs code-based instrumentation tradeoffs

### Local Codebase Analysis

5. **Atlas Task Execution API** (/home/anombyte/Atlas/atlas/docs/task-execution.md)
   - Submit/claim/report/renew endpoints
   - Content hash and leader token validation
   - Schema versioning (v1.0.0)

6. **Atlas_MCP README** (/home/anombyte/Atlas/Atlas_MCP/README.md)
   - Discord alerting architecture
   - Perplexity proxy integration (port 8765)
   - Log watcher with grep-based error detection
   - Priority-based routing configuration

7. **Atlas Visibility System Worktree** (/home/anombyte/Atlas/atlas-visibility-fix/)
   - Sprint prompts (A-E) for visibility rewrite
   - Audit trail and validation documentation
   - Comprehensive workflow planning

## Research Metadata

- **Complexity**: 8/10 (novel systems integration, multiple architectural patterns)
- **Estimated Cost**: $0.04 (2 Perplexity Pro calls)
- **Latency**: ~6 seconds (Perplexity Pro search)
- **Tiers Executed**:
  - Tier 0: Context7 (skipped - no relevant library docs)
  - Tier 1: Local Knowledge (system-knowledge, terminal-context)
  - Tier 2: Local AI Synthesis (done by researcher)
  - Tier 3: Perplexity Pro (2 queries)
- **Confidence Score**: 0.87 (high - multiple corroborating sources)
- **Gaps Identified**:
  - No specific Atlas OTel implementation examples
  - Limited Go MCP server code patterns in local knowledge
  - No existing observability backplane deployment patterns

## Next Steps

1. **Validate architecture decisions**: Review this research with Atlas team to confirm OpenTelemetry-first approach
2. **Prototype OTel integration**: Add basic tracing to control-plane HTTP handlers
3. **Design MCP server schema**: Define JSON Schema for task submission/claim/report tools
4. **Deploy observability backplane**: Set up OTel Collector + Tempo/Prometheus/Loki stack
5. **Create comprehensive .env.example**: Document all required environment variables
