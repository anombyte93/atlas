#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import uuid
from datetime import datetime


def run(cmd):
    return subprocess.check_call(cmd)


def maybe_git_clone(repo, dest):
    if os.path.exists(dest):
        return
    run(["git", "clone", repo, dest])


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def write_device_config(dest, device_id, role, hostname, control_plane_url):
    config = {
        "schema_version": "1.0.0",
        "id": device_id,
        "hostname": hostname,
        "roles": [role],
        "capabilities": {
            "os": sys.platform,
            "arch": os.uname().machine if hasattr(os, "uname") else "unknown",
            "cpu_cores": os.cpu_count() or 1,
            "memory_mb": 0,
            "tags": [f"role:{role}"]
        },
        "labels": {"bootstrap": "true"},
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    device_dir = os.path.join(dest, "atlas", "config", "devices")
    ensure_dir(device_dir)
    path = os.path.join(device_dir, f"{device_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    agent_cfg = {
        "schema_version": "1.0.0",
        "id": f"agent-{device_id}",
        "device_id": device_id,
        "version": "0.1.0",
        "control_plane_url": control_plane_url,
        "heartbeat_interval_sec": 15,
        "permissions": {"read_only": True, "allowed_paths": ["/var/log", "/etc"]},
        "resources": {"cpu_limit": 2, "memory_limit_mb": 1024},
        "tags": [f"role:{role}"]
    }
    agent_dir = os.path.join(dest, "atlas", "config", "agents")
    ensure_dir(agent_dir)
    agent_path = os.path.join(agent_dir, f"{device_id}.json")
    with open(agent_path, "w", encoding="utf-8") as f:
        json.dump(agent_cfg, f, indent=2)
    return path


def register_device(control_plane_url, device_id, hostname, role):
    import urllib.request
    payload = {
        "device_id": device_id,
        "hostname": hostname,
        "roles": [role],
        "capabilities": {"os": sys.platform, "arch": os.uname().machine if hasattr(os, "uname") else "unknown"}
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if os.getenv("ATLAS_API_TOKEN"):
        headers["Authorization"] = f"Bearer {os.getenv('ATLAS_API_TOKEN')}"
    req = urllib.request.Request(f"{control_plane_url.rstrip('/')}/register", data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def main():
    parser = argparse.ArgumentParser(description="Bootstrap a new Atlas device")
    parser.add_argument("--repo", required=True, help="Git repo URL or local path")
    parser.add_argument("--dest", default="./atlas-world", help="Destination directory")
    parser.add_argument("--role", default="server", choices=["server", "network_device", "workstation", "container_host", "iot_embedded"])
    parser.add_argument("--hostname", default="atlas-node")
    parser.add_argument("--control-plane", default="http://localhost:8080")
    parser.add_argument("--register", action="store_true", help="Register with control plane")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    device_id = f"dev-{uuid.uuid4().hex[:8]}"
    if args.dry_run:
        print(f"[dry-run] would clone {args.repo} -> {args.dest}")
        print(f"[dry-run] would create device config for {device_id}")
        return

    maybe_git_clone(args.repo, args.dest)
    path = write_device_config(args.dest, device_id, args.role, args.hostname, args.control_plane)
    print(f"Device config written to {path}")

    if args.register:
        register_device(args.control_plane, device_id, args.hostname, args.role)
        print("Device registered")


if __name__ == "__main__":
    main()
