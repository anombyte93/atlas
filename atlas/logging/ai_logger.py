import json
import os
import subprocess
from datetime import datetime


class AILogWrapper:
    def __init__(self, log_path, device_id, agent_id, world_repo_path="."):
        self.log_path = log_path
        self.device_id = device_id
        self.agent_id = agent_id
        self.world_repo_path = world_repo_path

    def log_event(self, event_type, payload, status="ok", model=None, tokens=0, latency_ms=0, error=None, context_refs=None):
        entry = {
            "schema_version": "1.0.0",
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": self.device_id,
            "agent_id": self.agent_id,
            "world_commit": self._git_commit(),
            "context_refs": context_refs or [],
            "model": model,
            "tokens": tokens,
            "latency_ms": latency_ms,
            "status": status,
            "error": error,
            "payload": payload,
        }
        self._append(entry)
        return entry

    def wrap_call(self, fn):
        def _wrapped(*args, **kwargs):
            start = datetime.utcnow()
            try:
                result = fn(*args, **kwargs)
                latency = int((datetime.utcnow() - start).total_seconds() * 1000)
                self.log_event("ai_call", {"args": str(args), "kwargs": str(kwargs), "result": str(result)}, latency_ms=latency)
                return result
            except Exception as exc:  # noqa: BLE001
                latency = int((datetime.utcnow() - start).total_seconds() * 1000)
                self.log_event("ai_call", {"args": str(args), "kwargs": str(kwargs)}, status="error", latency_ms=latency, error=str(exc))
                raise
        return _wrapped

    def _append(self, entry):
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def _git_commit(self):
        try:
            out = subprocess.check_output(["git", "-C", self.world_repo_path, "rev-parse", "HEAD"], text=True)
            return out.strip()
        except Exception:  # noqa: BLE001
            return "unknown"
