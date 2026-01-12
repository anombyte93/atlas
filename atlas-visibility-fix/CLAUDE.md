# Atlas Visibility System - Production Rewrite

## Scope
Complete rewrite of the Atlas visibility system to address 15+ critical issues identified in audit.

## Current Issues
1. Race conditions in task submission/reporting
2. Silent failures (curl > /dev/null)
3. Shell injection vulnerabilities
4. File corruption (no locking)
5. Task ID collisions
6. No transactional integrity
7. Memory exhaustion (read entire file)
8. Deprecated APIs
9. No authentication verification
10. No cleanup strategy

## Target Architecture
- SQLite backend for ACID compliance
- Proper error handling and retry logic
- UUID v4 for collision-resistant IDs
- Schema validation with version negotiation
- File locking or database-backed storage
- Health checks that verify functionality
- Cleanup/retention policy
- Comprehensive error logging
- Parameterized queries/escaping
- Integration tests

## Outputs
- [ ] Production-ready atlas-track script
- [ ] Production-ready atlas.py skill
- [ ] Test suite with acceptance criteria
- [ ] Migration guide from old system
- [ ] Documentation

## Constraints
- Must integrate with Claude Code
- Must use existing Atlas control plane
- Must be reliable for daily use
- Arch Linux, zsh shell

## Created By
/pa on 2026-01-12

## Parent Project
/home/anombyte/Atlas
