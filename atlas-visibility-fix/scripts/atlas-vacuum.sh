#!/bin/bash
set -euo pipefail

DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "Vacuuming database..."
sqlite3 "$DB_PATH" "VACUUM;"
echo "✓ Vacuum complete"

echo "Analyzing for query optimization..."
sqlite3 "$DB_PATH" "ANALYZE;"
echo "✓ Analysis complete"

echo "Database optimized"
