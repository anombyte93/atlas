# Migration Guide: v0.x → v1.0

## What Changed

### v0.x (Old)
- File-based logging (`~/.atlas/tasks.log`)
- Timestamp-based task IDs (collision-prone)
- No query capability
- No cleanup mechanism
- No integrity guarantees

### v1.0 (New)
- SQLite database (`~/.config/atlas/visibility.db`)
- UUID v4 task IDs (collision-resistant)
- Paginated queries with filtering
- Automatic retention cleanup
- ACID compliance for data integrity

## Migration Steps

### 1. Backup Current Data

```bash
# Backup old log file
cp ~/.atlas/tasks.log ~/.atlas/tasks.log.backup
```

### 2. Install v1.0

```bash
cd /home/anombyte/Atlas/atlas-visibility-fix
./scripts/install.sh
```

### 3. Run Migration Tool

```bash
./scripts/migrate-from-v0.sh
```

**Expected Output:**
```
=== Atlas Migration: v0.x → v1.0 ===

Old log: /home/user/.atlas/tasks.log
New database: /home/user/.config/atlas/visibility.db

Backing up old log to: /home/user/.atlas/tasks.log.backup-20260113-120000

Migrating entries...

Migration Complete:
  ✓ Migrated: 1234 entries
  ✗ Failed:   0 entries

✅ Migration successful
```

### 4. Verify Migration

```bash
# Check entry count matches
wc -l ~/.atlas/tasks.log
python3 ~/.claude/skills/atlas.py status | jq '.stats.total_entries'

# View recent entries
python3 ~/.claude/skills/atlas.py log --limit 10
```

### 5. Update Scripts

Replace old `atlas-track` calls with `atlas-track-v2`:

```bash
# Old
atlas-track "description" -- command

# New
atlas-track-v2 "description" -- command
```

Or use the symlink from `install.sh`:
```bash
atlas-track "description" -- command
```

### 6. Remove Old System (After Verification)

```bash
# Wait 1 week to ensure everything works
# Then remove old log
rm ~/.atlas/tasks.log
rm -rf ~/.atlas/
```

## Rollback

If issues occur:

```bash
# Restore old log
cp ~/.atlas/tasks.log.backup-* ~/.atlas/tasks.log

# Remove new database
rm ~/.config/atlas/visibility.db

# Reinstall old system
# (Use git checkout to previous version)
```

## Compatibility

### Breaking Changes

- **Command name:** `atlas-track` → `atlas-track-v2` (install.sh creates symlink)
- **Database format:** Text file → SQLite (use migration tool)
- **Query method:** Grep/log parsing → SQL queries (use atlas.py)

### Non-Breaking

- **Environment variables:** Same (`ATLAS_RETENTION_DAYS`, `ATLAS_URL`)
- **Output format:** Similar text output
- **Usage pattern:** Same `atlas-track "desc" -- command`

## Support

For issues or questions:
- GitHub Issues: https://github.com/anombyte/Atlas/issues
- Documentation: /home/anombyte/Atlas/atlas-visibility-fix/README.md
