#!/bin/bash
set -x

echo "=== Debug Test ==="

# Check if script exists and is executable
ls -la atlas-track-v2

# Initialize database
./src/init-db.sh

# Check database schema
echo ""
echo "=== Database Schema ==="
sqlite3 ~/.config/atlas/visibility.db ".schema entries"

echo ""
echo "=== Simple Test ==="
./atlas-track-v2 "test" -- echo "hello world"

echo ""
echo "=== Database Contents ==="
sqlite3 ~/.config/atlas/visibility.db "SELECT task_id, description, status, length(stdout) as stdout_len, length(stderr) as stderr_len FROM entries ORDER BY created_at DESC LIMIT 1;"
