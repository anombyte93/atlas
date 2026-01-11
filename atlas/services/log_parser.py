import json
import os


def parse_log_file(filepath):
    entities = []
    events = []
    if not os.path.exists(filepath):
        return entities, events
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            try:
                evt = json.loads(line)
                events.append(evt)
            except json.JSONDecodeError:
                continue
    return entities, events


def extract_relationships(events):
    nodes = []
    edges = []
    for evt in events:
        run_id = evt.get("payload", {}).get("run_id") or evt.get("payload", {}).get("run")
        file_path = evt.get("payload", {}).get("file_path")
        device_id = evt.get("device_id")
        model = evt.get("model")
        if run_id:
            nodes.append({"id": run_id, "type": "run", "attributes": {"timestamp": evt.get("timestamp")}})
        if file_path:
            nodes.append({"id": file_path, "type": "file", "attributes": {}})
        if device_id:
            nodes.append({"id": device_id, "type": "device", "attributes": {}})
        if model:
            nodes.append({"id": model, "type": "model", "attributes": {}})
        if run_id and file_path:
            edges.append({"source": file_path, "target": run_id, "type": "used_in"})
        if run_id and device_id:
            edges.append({"source": device_id, "target": run_id, "type": "used_in"})
    return nodes, edges
