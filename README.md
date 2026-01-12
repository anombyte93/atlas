# Atlas - Your AI Platform

## What is Atlas?

**Atlas** is code for your Personal AI Platform - a centralized system for managing AI agents, services, and workflows.

**IMPORTANT**: Atlas is currently code, not a running service. You need to deploy it first (see Setup below).

## Quick Start

### Install the Atlas CLI
```bash
# The atlas command is already installed at ~/bin/atlas
# Verify it works:
atlas status
```

### Common Commands
```bash
atlas status    # Show Atlas status and AI sessions
atlas sessions  # Show all AI sessions
atlas cd        # Go to Atlas directory (opens shell)
```

### AI Session Management
```bash
ai ts          # Quick select from top 6 sessions
ai tmux        # Show all sessions
```

---

## What Changed Today? (January 12, 2026)

### ✅ Your `.` Alias Now Works
**Before**: Typing `.` showed an error
**After**: Typing `.` takes you to `/home/anombyte/Atlas`

### ✅ New Quick Command: `ai ts`
Quickly select from your 6 most recent AI sessions:
- Type `ai ts`
- See a numbered list
- Press 1-6 to jump to that session
- Press `q` to cancel

---

## Your Atlas Directory

```
/home/anombyte/Atlas/
├── atlas/
│   ├── agents/          # AI agent definitions
│   ├── config/          # Settings and schemas
│   ├── services/        # Control plane services
│   └── logging/         # AI interaction logs
├── scripts/             # Utility scripts
├── .env                # API keys (safe, not shared)
└── data/               # Data storage
```

---

## Common Commands

| Command | What It Does |
|---------|--------------|
| `.` | Go to Atlas directory |
| `ai ts` | Quick select from top 6 sessions |
| `ai tmux` | Show all sessions (non-interactive) |
| `ai tmux <name>` | Jump to session by name |

---

## What is Atlas?

Atlas is a **Personal AI Hive-Mind Platform** that turns your multiple devices into a unified AI system.

### Three Main Parts:

1. **World Model** - A centralized repository describing:
   - Agents (AI workers)
   - Services (what they do)
   - Workflows (how they work)
   - Devices (where they run)

2. **Control Plane** - Orchestrates AI work across your devices

3. **Observability Layer** - Logs and analyzes all important AI interactions

---

## Need Help?

- Type `ai --help` to see all AI commands
- Type `ai tmux --help` for tmux session commands
- Check `/home/anombyte/.claude/` for Claude Code settings

---

*Last updated: January 12, 2026*
