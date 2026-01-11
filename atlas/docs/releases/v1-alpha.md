# Atlas v1-alpha Release Notes

Date: 2026-01-11
Tag: v1-alpha

## Highlights
- Control plane with secure defaults, token auth, TLS/mTLS support, and structured error responses.
- Task scheduler with retries/backoff, lease handling, and SQLite persistence.
- Device registry persistence with optional TTL pruning.
- Node agent skeleton with task execution, capability discovery, and OS-specific execution.
- CI smoke test and GitHub Actions workflow.

## Notable Changes
- JSONL logging with rotation and audit trails.
- Provider policy and DeepSeek provider documentation.
- HA roadmap and leader lease (optional) for single-scheduler safety.

## Known Limitations
- Single-process control plane (no full HA yet).
- Task claim loop is v1-scale (not optimized for large fleets).
- Device registry has no conflict detection; last-write-wins.

## Verification
- `./atlas/scripts/ci.sh` (build + smoke test)
