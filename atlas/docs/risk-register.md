# Atlas Risk Register (v1)

Date: 2026-01-11
Source: Perplexity deep-research critique outputs (see `.taskmaster/reports/perplexity-critique-x10-*.json`)

## Critical
1) **Single-process control plane SPOF**
- **Impact:** correlated request storms, global outages, thundering herd on recovery.
- **Mitigation:** backpressure, rate limits, jittered agent polling, circuit breakers, crash recovery, SLOs.
- **Owner Tasks:** 5, 6, 9, 12

2) **No durable task queue**
- **Impact:** task loss, state corruption, inconsistent retries.
- **Mitigation:** persistent task state (append-only log), idempotency keys, reconciliation loop.
- **Owner Tasks:** 6, 8

3) **Security boundaries weak**
- **Impact:** unauthorized device registration, token leakage, supply-chain compromise.
- **Mitigation:** auth gates, TLS/mTLS, least-privilege policy, signed updates, audit logs.
- **Owner Tasks:** 12
 - **Status:** Mitigated in v1 with shared API token; still needs mTLS and rotation.

## High
4) **Schema/config evolution without migrations**
- **Impact:** rollbacks fail, agents incompatible, config drift.
- **Mitigation:** versioned schemas, migration playbooks, compatibility matrix.
- **Owner Tasks:** 2, 10, 12
 - **Status:** Schema versioning added; migration playbook required.

5) **JSONL durability/observability gaps**
- **Impact:** partial writes, silent corruption, low queryability.
- **Mitigation:** atomic append, file locking, rotation, optional SQLite ingestion.
- **Owner Tasks:** 7, 8

## Medium
6) **Cross-platform test gaps**
- **Impact:** OS-specific failures in production.
- **Mitigation:** OS/role test matrix, failure injection, integration tests.
- **Owner Tasks:** 4, 5, 6, 11

7) **Dependency/version skew**
- **Impact:** agent-control plane incompatibility.
- **Mitigation:** explicit version contracts, release tagging, rollback plan.
- **Owner Tasks:** 9, 12

## Operational
8) **Change-management drift**
- **Impact:** task list diverges from repo state, hard to audit.
- **Mitigation:** stricter git/PR discipline, ADRs, task status updates tied to commits.
- **Owner Tasks:** 9, 12
