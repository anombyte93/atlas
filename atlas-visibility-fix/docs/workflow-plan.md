# Workflow Plan: Atlas Visibility Fix

## Visual Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Database Schema Design                               │
│   - Design SQLite schema with proper constraints               │
│   - Add indexes for query performance                          │
│   - Include WAL mode and pragmas                              │
│   Output: schema.sql                                          │
└────────────────┬──────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐
    │ 🛡️ GATE: Schema Valid?   │
    │    Claude reviews schema  │
    └────────────┬─────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│ PHASE 2: Migration Script                                    │
│   - Create database initialization script                     │
│   - Handle existing data migration                            │
│   - Add rollback capability                                   │
│   Output: migrate.sh                                         │
└────────────────┬──────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐
    │ 🛡️ GATE: Migration Safe? │
    │    Test on copy of data   │
    └────────────┬─────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│ PHASE 3: Implementation (P0 Stories)                          │
│   - US-001: SQLite Backend                                  │
│   - US-002: UUID v4 Task IDs                                │
│   - US-003: Error Handling                                  │
│   - US-004: Shell-Safe Escaping                             │
│   - US-005: Database Connection Pooling                      │
│   Output: atlas-track-v2, atlas.py-v2                        │
└────────────────┬──────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐
    │ 🛡️ GATE: All P0 Pass?    │
    │    Run acceptance tests  │
    └────────────┬─────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│ PHASE 4: P1 Stories (Quality Improvements)                   │
│   - US-006: Health Check That Verifies                      │
│   - US-007: Cleanup/Retention Policy                         │
│   - US-008: Retry Logic with Backoff                        │
│   Output: Enhanced scripts with health/cleanup               │
└────────────────┬──────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐
    │ 🛡️ GATE: Quality Pass?   │
    │    Integration tests     │
    └────────────┬─────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│ PHASE 5: Validation & Documentation                          │
│   - Run /karen validation                                    │
│   - Run /steve architecture review                           │
│   - Create migration guide                                   │
│   - Update documentation                                     │
│   Output: VALIDATED system                                   │
└─────────────────────────────────────────────────────────────────┘

## Command Sequence

```bash
# Phase 1: Schema Design
/codex-exec "Design SQLite schema for Atlas visibility tracking with proper constraints, indexes, and WAL mode"

# Phase 2: Migration Script  
/codex-exec "Create migration script that safely migrates existing JSONL data to SQLite"

# Phase 3: P0 Implementation
/parallel-ultra \
  "Implement US-001 SQLite backend with transactional integrity" \
  "Implement US-002 UUID v4 task IDs using uuidgen" \
  "Implement US-003 Error handling with proper user feedback" \
  "Implement US-004 Shell-safe command escaping using jq" \
  "Implement US-005 Database connection pooling with pagination"

# Phase 3 Gate: Acceptance Tests
~/.claude/skills/atlas-validate /home/anombyte/Atlas/atlas-visibility-fix/USER_STORIES.md

# Phase 4: P1 Implementation
/parallel-ultra \
  "Implement US-006 Health check with actual task execution" \
  "Implement US-007 Cleanup policy with 90-day retention" \
  "Implement US-008 Retry logic with exponential backoff"

# Phase 5: Validation
/karen "Validate all P0 stories for Atlas visibility fix"
/steve "Review architecture of Atlas visibility fix"

# Final: Documentation
/codex-exec "Create migration guide from old atlas-track to new system"
```

## Context Buffer: 2.5x

Each phase estimated at 1 hour actual → budget 2.5 hours
Total estimated: 5 hours actual → budget 12.5 hours (2-3 sessions)

## Checkpoint Opportunities

1. **After schema design** - Can checkpoint with schema.sql
2. **After migration script** - Can checkpoint with tested migration
3. **After P0 implementation** - Natural checkpoint before P1
4. **After validation** - Final checkpoint before production use

## tmux Session Preservation

The scaffold directory `atlas-visibility-fix/` will be preserved across sessions.
No cleanup scripts should kill sessions containing Claude output.
Archive to `~/.claude/logs/session-archives/` before any session destruction.
