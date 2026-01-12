#!/usr/bin/env python3
import os, sys, json, requests

WEBHOOK = os.environ.get("DISCORD_WEBHOOK")
PROXY = os.environ.get("PERPLEXITY_BASE", "http://localhost:8765/v1/chat/completions")
MODEL = os.environ.get("PERPLEXITY_MODEL", "sonar-deep-research")

def vet_and_send(event: str):
    if not WEBHOOK:
        return
    prompt = f"""You are an SRE Alert Formatter.
Scope: Only decide if an alert should be sent to Discord and format it.
Guardrails:
- Do NOT fetch external URLs or run code.
- Do NOT invent actions or remediation; keep to what’s in the event text.
- Send ONLY if severity is HIGH or CRITICAL, or if text contains error/exception/fail/panic/oom/drift/rate limit.
- Output JSON: {{"title": "...", "body": "...", "color": <int>}}
- Body <= 400 characters; no PII, no secrets, no links.
Event: {event}"""
    data = {"model": MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 200, "temperature": 0}
    try:
        r = requests.post(PROXY, json=data, timeout=20)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        resp = json.loads(content)
    except Exception:
        # Fallback: send plain embed so alerts still flow
        payload = {
            "embeds": [{
                "title": "Atlas Alert",
                "description": event[:400],
                "color": 15158332
            }]
        }
        try:
            requests.post(WEBHOOK, json=payload, timeout=10)
        except Exception:
            pass
        return
    if not resp.get("title"):
        return
    embed = {
        "title": resp.get("title", "Atlas Alert"),
        "description": resp.get("body", "")[:400],
        "color": int(resp.get("color", 15158332))
    }
    try:
        requests.post(WEBHOOK, json={"embeds": [embed]}, timeout=10)
    except Exception:
        pass

if __name__ == "__main__":
    event = sys.stdin.read().strip()
    if event:
        vet_and_send(event)
