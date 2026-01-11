# HA / Scale Roadmap (v1 → v2)

## Current State (v1)
- Single-process control plane.
- In-memory registry + SQLite persistence.

## Next Steps (v2)
1) Split registry and task scheduler into separate services.
2) Add leader election (etcd/consul) for scheduler.
3) Move tasks and devices to shared database service.
4) Add read-only replicas for query endpoints.

## Interim (v1.5)
- Optional SQLite leader lease (`leader_lease_enabled`) to prevent multiple active schedulers.
