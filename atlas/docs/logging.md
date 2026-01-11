# Logging

## JSONL Storage
- Default path: `atlas/logs/ai.jsonl`
- Append-only with file locking

## Query
```
python3 atlas/scripts/log_query.py --log atlas/logs/ai.jsonl --device dev-123
```

## Rotation (v1)
- Manual rotation (rename file); ingestion to SQLite planned later.
