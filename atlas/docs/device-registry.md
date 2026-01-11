# Device Registry Persistence

The control plane persists registered devices in SQLite (`tasks.db`), table `devices`.

On startup, devices are loaded into memory to restore registry state.

Notes:
- Last seen timestamps are updated on heartbeats.
- This is v1 durability; future work includes TTL cleanup and snapshots.
