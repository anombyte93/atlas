import json
import os
import re
import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "rag_index.sqlite"


def load_foods():
    data = json.loads((BASE / "foods.json").read_text())
    docs = []
    for item in data.get("foods", []):
        title = f"food: {item.get('name', '').strip()}"
        body = (
            f"name: {item.get('name','')}
"
            f"barcode: {item.get('barcode','')}
"
            f"ingredients: {', '.join(item.get('ingredients', []))}
"
            f"chemicals: {', '.join(item.get('chemicals', []))}
"
            f"health_score: {item.get('health_score','')}"
        )
        docs.append((title, body, "foods.json"))
    return docs


def load_chemical_risks():
    text = (BASE / "chemical-risks.md").read_text()
    sections = re.split(r"
### ", text)
    docs = []
    for sec in sections:
        if sec.strip().startswith("Chemical Risks Reference") or sec.strip() == "":
            continue
        if sec.startswith("### "):
            sec = sec[4:]
        lines = sec.strip().splitlines()
        title = f"chemical: {lines[0].strip()}" if lines else "chemical"
        body = "
".join(lines)
        docs.append((title, body, "chemical-risks.md"))
    return docs


def load_user_prefs():
    prefs = json.loads((BASE / "user-preferences.json").read_text())
    title = "user: preferences"
    body = json.dumps(prefs, indent=2)
    return [(title, body, "user-preferences.json")]


def build_index():
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE VIRTUAL TABLE docs USING fts5(title, body, source)")
    docs = []
    docs.extend(load_foods())
    docs.extend(load_chemical_risks())
    docs.extend(load_user_prefs())
    conn.executemany("INSERT INTO docs(title, body, source) VALUES (?, ?, ?)", docs)
    conn.commit()
    conn.close()


if __name__ == "__main__":
    build_index()
    print(f"Built index with {DB_PATH}")
