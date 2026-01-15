import json
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "rag_index.sqlite"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/query":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"not found")
            return
        qs = parse_qs(parsed.query)
        q = (qs.get("q") or [""])[0]
        limit = int((qs.get("limit") or ["5"])[0])
        data = query(q, limit)
        payload = {"query": q, "results": data}
        out = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)


def query(q, limit=5):
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "SELECT title, source, snippet(docs, 1, '[', ']', '...', 10) as snip "
        "FROM docs WHERE docs MATCH ? LIMIT ?",
        (q, limit),
    )
    rows = cur.fetchall()
    conn.close()
    return [
        {"title": title, "source": source, "snippet": snip}
        for title, source, snip in rows
    ]


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8787), Handler)
    print("RAG server listening on http://127.0.0.1:8787")
    server.serve_forever()
