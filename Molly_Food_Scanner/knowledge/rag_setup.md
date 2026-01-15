# Local RAG Setup

This folder supports a lightweight local RAG index using SQLite FTS5. It indexes:
- foods.json (each food as a document)
- chemical-risks.md (each chemical section as a document)
- user-preferences.json (single preferences document)

## Files
- rag_index.py: build or rebuild the index
- rag_server.py: tiny HTTP query endpoint
- rag_query.py: CLI query tool
- rag_index.sqlite: generated index (after running rag_index.py)

## Build Index
```bash
python rag_index.py
```

## Query via CLI
```bash
python rag_query.py "nitrite"
```

## Query via HTTP
```bash
python rag_server.py
# then:
# curl "http://127.0.0.1:8787/query?q=nitrite"
```

## Update Mechanism
- Edit foods.json, chemical-risks.md, or user-preferences.json
- Re-run `python rag_index.py` to rebuild the SQLite FTS index

The HTTP server reads the existing `rag_index.sqlite` and returns top matches.
