#!/bin/bash
# Initialize Atlas visibility database

DB_FILE="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/atlas}/visibility.db"
DB_DIR="$(dirname "$DB_FILE")"

mkdir -p "$DB_DIR"

echo "Initializing Atlas visibility database at: $DB_FILE"

# Run schema.sql
SCRIPT_DIR="$(dirname "$0")"
if [ -f "$SCRIPT_DIR/schema.sql" ]; then
  sqlite3 -batch "$DB_FILE" < "$SCRIPT_DIR/schema.sql"
  echo "✅ Database initialized with schema"
else
  echo "❌ Error: schema.sql not found in $SCRIPT_DIR"
  exit 1
fi

# Verify
echo ""
echo "Database tables:"
sqlite3 "$DB_FILE" ".tables"
echo ""
echo "Schema:"
sqlite3 "$DB_FILE" ".schema entries"
