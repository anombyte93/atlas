#!/bin/bash
set -euo pipefail

OLD_LOG="${ATLAS_OLD_LOG:-$HOME/.atlas/tasks.log}"
NEW_DB="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Atlas Migration: v0.x → v1.0 ==="
echo ""

if [ ! -f "$OLD_LOG" ]; then
  echo "❌ Old log file not found: $OLD_LOG"
  echo "   Set ATLAS_OLD_LOG if using custom location"
  exit 1
fi

echo "Old log: $OLD_LOG"
echo "New database: $NEW_DB"
echo ""

# Backup old log
BACKUP="$OLD_LOG.backup-$(date +%Y%m%d-%H%M%S)"
echo "Backing up old log to: $BACKUP"
cp "$OLD_LOG" "$BACKUP"
echo ""

# Initialize new database if needed
TRACKER="/home/anombyte/Atlas/atlas-visibility-fix/atlas-track-v2"
if [ ! -f "$NEW_DB" ]; then
  echo "Initializing new database..."
  "$TRACKER" "migration-init" -- true >/dev/null
fi

# Parse and migrate entries
echo "Migrating entries..."
migrated=0
failed=0

while IFS='|' read -r timestamp description status exit_code duration; do
  if [[ "$timestamp" =~ ^# ]] || [[ -z "$description" ]]; then
    ((failed++))
    continue
  fi

  # Generate task ID from old timestamp
  task_id=$(echo -n "${timestamp}${description}" | md5sum | cut -c1-36 | sed 's/\(........\)-\(....\)-\(....\)-\(....\)-\(............\)/\1-\2-3\3-\4-\5/')

  # Insert into database
  sqlite3 "$NEW_DB" "
    INSERT OR IGNORE INTO entries (
      task_id, description, status,
      exit_code, duration_seconds,
      created_at, updated_at
    ) VALUES (
      '$task_id',
      '$(echo "$description" | sed "s/'/''/g")',
      '$(echo "$status" | sed "s/'/''/g")',
      ${exit_code:-0},
      ${duration:-0},
      '${timestamp}',
      '${timestamp}'
    );
  " 2>/dev/null && ((migrated++)) || ((failed++))

done < "$OLD_LOG"

echo ""
echo "Migration Complete:"
echo "  ✓ Migrated: $migrated entries"
echo "  ✗ Failed:   $failed entries"
echo ""

if [ $migrated -gt 0 ]; then
  echo "✅ Migration successful"
  echo ""
  echo "Next steps:"
  echo "  1. Verify entries: python3 ~/.claude/skills/atlas.py log"
  echo "  2. Remove old log: rm $OLD_LOG"
  echo "  3. Keep backup: $BACKUP"
else
  echo "❌ Migration failed"
  exit 1
fi
