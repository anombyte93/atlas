#!/bin/bash
set -euo pipefail

DB_PATH="${XDG_CONFIG_HOME:-$HOME/.config}/atlas/visibility.db"

echo "=== Atlas Database Performance ==="
echo ""

# Database size
echo "Database Size:"
du -h "$DB_PATH"
echo ""

# Entry count
echo "Entry Count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries;"
echo ""

# Entries by status
echo "Entries by Status:"
sqlite3 "$DB_PATH" "SELECT status, COUNT(*) FROM entries GROUP BY status;"
echo ""

# Average entry size
echo "Average Entry Size (KB):"
sqlite3 "$DB_PATH" "SELECT ROUND(AVG(LENGTH(COALESCE(stdout, '')) + LENGTH(COALESCE(stderr, '')) + LENGTH(description)) / 1024.0, 2) FROM entries;"
echo ""

# Index statistics
echo "Index Statistics:"
sqlite3 "$DB_PATH" "PRAGMA index_list('entries');"
echo ""

# Fragmentation
echo "Database Pages:"
sqlite3 "$DB_PATH" "PRAGMA page_count;"
echo "Free Pages:"
sqlite3 "$DB_PATH" "PRAGMA freelist_count;"
