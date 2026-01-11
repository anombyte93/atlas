# Multi-Device Federation & Config Sync

## Overlay Strategy (v1)
- Base configs live in `atlas/config/devices/<device_id>.json`
- Optional overrides live in `atlas/config/overlays/<device_id>.json`
- Sync script applies overlay after `git pull`

## Sync
```
python3 atlas/scripts/sync_config.py --repo . --device-id dev-12345678
```

## Conflict Resolution
- Git handles conflicts at pull time.
- Overlay is last-write-wins against base config.
