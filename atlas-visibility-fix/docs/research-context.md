# Research Context: SQLite + Bash Best Practices

## Key Findings from Research

### Transactional Integrity
1. **Use `BEGIN IMMEDIATE TRANSACTION`** - Acquires write locks early, avoids SQLITE_BUSY
2. **Always wrap operations in transactions** - 23,000 inserts/sec vs 50 without
3. **Implement rollback on error** - Use bash traps for cleanup
4. **Enable WAL mode** - Better concurrency, faster commits

### Error Handling Patterns
1. **Bash traps for cleanup**:
```bash
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        sqlite3 "$DB_FILE" "ROLLBACK;" 2>/dev/null || true
    fi
}
trap cleanup EXIT ERR INT TERM
```

2. **Check SQLite result codes** - SQLITE_OK (0), SQLITE_BUSY (5), etc.
3. **Use ON CONFLICT clauses** - INSERT OR ROLLBACK for safety
4. **Run integrity checks** - PRAGMA integrity_check after errors

### Performance Optimizations
1. **Enable WAL mode**: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`
2. **Set busy timeout**: `PRAGMA busy_timeout=5000;` (milliseconds)
3. **Batch operations** - Use temporary SQL files for bulk inserts
4. **Use prepared statements** - Multiple -cmd flags for sqlite3

### Data Integrity
1. **Enable foreign keys**: `PRAGMA foreign_keys=ON;`
2. **Run PRAGMA integrity_check** periodically
3. **Check foreign_key_check** for constraint violations
4. **Use UNIQUE constraints** to prevent duplicates

### Proven Patterns from Codebase
From terminal-context-kb search:
- Database-backed deduplication pattern (den-0day-hunt project)
- Transactional operations with proper cleanup
- File locking with stale lock detection
- Exponential backoff with jitter for retries

From ideas search:
- Hook system 9/10 validation through symlinks and purging stale data
- Docker volume persistence for databases
- Systemd EnvironmentFile for API keys

## Sources
- [10 Common SQLite Bugs](https://medium.com/top-python-libraries/10-common-sqlite-bugs-things-i-wish-i-knew-earlier-c3dd3e542aec)
- [File Locking And Concurrency In SQLite Version 3](https://www.sqlite.org/lockingv3.html)
- [Error handling and RollBack Transaction in SQLITE](https://stackoverflow.com/questions/5308272/error-handling-and-rollback-transaction-in-sqlite-from-sql-statement)
- [How to trap exit code in Bash script](https://stackoverflow.com/questions/5312266/how-to-trap-exit-code-in-bash-script)
- [Using Databases From Bash Scripts](https://www.michael-joost.de/bash_db.html)
- [sqlite-shell-lib GitHub](https://github.com/ngirard/sqlite-shell-lib)
- [SQLAlchemy SQLite Dialect](https://websites/sqlalchemy_en_20_dialects_sqlite)
- [Better SQLite3 Node.js](https://wiselibs/better-sqlite3)
