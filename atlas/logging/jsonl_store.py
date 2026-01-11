import json
import os
import time


class JSONLStore:
    def __init__(self, path):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)

    def append(self, entry):
        line = json.dumps(entry)
        with open(self.path, "a", encoding="utf-8") as f:
            _lock(f)
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
            _unlock(f)

    def query(self, device_id=None, agent_id=None, since_ts=None):
        results = []
        if not os.path.exists(self.path):
            return results
        with open(self.path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if device_id and entry.get("device_id") != device_id:
                    continue
                if agent_id and entry.get("agent_id") != agent_id:
                    continue
                if since_ts and entry.get("timestamp", "") < since_ts:
                    continue
                results.append(entry)
        return results


def _lock(f):
    try:
        import fcntl

        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
    except Exception:
        try:
            import msvcrt

            msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
        except Exception:
            pass


def _unlock(f):
    try:
        import fcntl

        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    except Exception:
        try:
            import msvcrt

            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        except Exception:
            pass
