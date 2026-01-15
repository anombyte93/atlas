import sqlite3
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "rag_index.sqlite"


def query(q, limit=5):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "SELECT title, source, snippet(docs, 1, '[', ']', '...', 10) as snip "
        "FROM docs WHERE docs MATCH ? LIMIT ?",
        (q, limit),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rag_query.py "query"")
        sys.exit(1)
    q = sys.argv[1]
    results = query(q)
    for title, source, snip in results:
        print(f"- {title} ({source})")
        print(f"  {snip}")
