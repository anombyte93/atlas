# Agent Completion Validation System

## Overview

The Agent Completion Validation System is a **Doubt Guild** pattern implementation that adds lightweight validation gates to agent completion claims. It helps detect missing evidence, logical issues, and security risks before accepting completion claims.

**Status**: Production-ready (tested with Codex-implemented UX improvements)

## Architecture

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Doubt Agents** | `~/.claude/agents/` | Specialized validators (logic, security, honesty) |
| **Completion Gate** | `~/.claude/lib/agent-completion-gate.sh` | Orchestrates doubt agents and enforces threshold |
| **Completion Tracker** | `~/.claude/lib/completion-tracker.sh` | Records validation outcomes to SQLite/log file |
| **Karen Integration** | `~/.claude/skills/karen-unified.js` | Adds spawnAgent, spawnDoubtAgentsWithTimeout |
| **Atlas Configs** | `atlas/config/agents/doubt-*.json` | World Model definitions for doubt agents |

### Separation of Concerns (Critical Architecture Decision)

### Infrastructure Layer (`~/.claude/` - NOT in this repo)

**Why it's separate:** The completion validation system is **universal infrastructure** that works across ALL your projects (Atlas, den, QR-God, etc.). It lives in your personal Claude config.

**Components in `~/.claude/` (managed separately, not in Atlas git):**

```
~/.claude/
├── agents/
│   ├── doubt-logic.sh       # Universal logic validator
│   ├── doubt-security.sh    # Universal security validator
│   └── doubt-honesty.sh     # Universal honesty validator
├── lib/
│   ├── agent-completion-gate.sh  # Universal validation gate
│   └── completion-tracker.sh     # Universal completion tracking
├── skills/
│   └── karen-unified.js     # Enhanced with spawnAgent support
└── docs/
    └── completion-validation-guide.md  # Universal quick-start
```

**Version control strategy:** These should go into a **dotfiles repo** (e.g., `github.com/anombyte/dotfiles`) with chezmoi, NOT in individual project repos.

### Application Layer (IN this repo)

**Why it's here:** Atlas-specific integration docs, World Model definitions, and usage patterns belong in the Atlas repo.

**Components in Atlas git:**

```
Atlas/
├── atlas/config/agents/
│   ├── doubt-logic.json      # Atlas World Model: logic validator
│   ├── doubt-security.json   # Atlas World Model: security validator
│   └── doubt-honesty.json    # Atlas World Model: honesty validator
└── docs/
    └── completion-validation-system.md  # This file: Atlas-specific usage
```

**Rationale:**
- World Model definitions are Atlas-specific (how agents integrate with Atlas)
- Documentation shows Atlas developers how to use the system
- Implementation details are universal infrastructure (don't repeat in every project)

## Usage

### Basic Completion Gate

```bash
~/.claude/lib/agent-completion-gate.sh <agent_id> "<claim>" [evidence_dir]
```

**Example:**
```bash
~/.claude/lib/agent-completion-gate.sh explore-123 \
  "Updated completion tracker health status" \
  /home/anombyte/Atlas/Atlas_MCP
```

### Individual Doubt Agents

```bash
~/.claude/agents/doubt-logic.sh "<claim>" [evidence_dir]
~/.claude/agents/doubt-security.sh "<claim>" [evidence_dir]
~/.claude/agents/doubt-honesty.sh "<claim>" [evidence_dir]
```

### Query Validation History

```bash
source ~/.claude/lib/completion-tracker.sh

# View statistics
get_completion_stats [days]

# Recent validations
get_recent_completions [n]

# Search pattern
query_completions <pattern>
```

## Atlas-Specific Integration

### World Model Definitions

Atlas includes three doubt agents in the World Model:

- **doubt-logic.json** - Validates logical consistency and completeness
- **doubt-security.json** - Checks for security issues, credential exposure, vulnerabilities
- **doubt-honesty.json** - Detects hallucination, overclaiming, missing evidence

These are defined in `atlas/config/agents/` and can be referenced by task routing.

### Example: Validating Atlas Development Work

When an agent claims to have completed Atlas development:

```bash
# After agent claims completion
AGENT_ID="atlas-dev-123"
CLAIM="Implemented Docker Compose setup for control-plane"

# Run validation gate
~/.claude/lib/agent-completion-gate.sh $AGENT_ID "$CLAIM" /home/anombyte/Atlas

# Check outcome
source ~/.claude/lib/completion-tracker.sh
get_recent_completions 1
```

## Validation Criteria

### Doubt-Logic Agent
Checks for:
- Empty or missing claims
- Logical contradictions
- Incomplete implementations (TODOs, stubs)
- Evidence-code mismatch

### Doubt-Security Agent
Checks for:
- Hardcoded credentials
- Insecure permissions
- Missing input validation
- Dependency vulnerabilities
- API key exposure

### Doubt-Honesty Agent
Checks for:
- Hallucinated files/features
- Overclaiming completion percentage
- Missing test evidence
- Contradictory statements

## Thresholds and Enforcement

Default threshold: **70% consensus required**

- **Pass**: ≥2/3 agents approve → completion accepted
- **Fail**: <2/3 agents approve → completion rejected, requires remediation

## Data Persistence

### Completion Log

Location: `~/.claude/logs/completions.log`

Format (JSONL):
```json
{"timestamp":"2026-01-13T12:00:00Z","agent_id":"explore-123","claim":"Updated tracker","logic":"PASS","security":"PASS","honesty":"PASS","consensus":100,"status":"ACCEPTED"}
```

### Statistics

Track:
- Total validations
- Pass/fail rate
- Agent-specific success rates
- Common failure patterns

## Troubleshooting

### "Empty claim" Error
**Cause**: No claim string provided
**Fix**: Always provide a claim in quotes after agent_id

### "No evidence directory" Warning
**Cause**: Doubt agents can't read project files
**Fix**: Pass evidence_dir as third argument: `~/.claude/lib/agent-completion-gate.sh agent-123 "claim" /path/to/project`

### "Karen not found" Error
**Cause**: karen-unified.js missing spawnAgent methods
**Fix**: Ensure karen-unified.js is updated (Codex PR #427)

### High Failure Rate
**Cause**: Threshold too strict or agents too pessimistic
**Fix**: Adjust threshold in `agent-completion-gate.sh` or tune doubt agent prompts

## Development History

- **2026-01-13**: Initial implementation with 3 doubt agents
- **2026-01-13**: Codex UX improvements (help flags, empty claim validation, health indicator)
- **2026-01-13**: Atlas World Model integration (agent definitions)

## References

- Implementation: `~/.claude/agents/doubt-*.sh`
- Gate logic: `~/.claude/lib/agent-completion-gate.sh`
- Karen integration: `~/.claude/skills/karen-unified.js`
- Quick-start guide: `~/.claude/docs/completion-validation-guide.md`

## Future Enhancements

Potential improvements:
- [ ] Per-project threshold configuration
- [ ] Custom doubt agents (domain-specific)
- [ ] Web dashboard for validation history
- [ ] Integration with Atlas MCP notifications
- [ ] Automatic remediation suggestions
