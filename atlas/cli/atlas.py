#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import urllib.request


def http_get(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return resp.read().decode("utf-8")


def http_post(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read().decode("utf-8")


def cmd_init(_args):
    os.makedirs("atlas/config/devices", exist_ok=True)
    os.makedirs("atlas/config/agents", exist_ok=True)
    print("Initialized atlas config directories")


def cmd_status(args):
    try:
        http_get(args.control_plane.rstrip("/") + "/health")
        devices = http_get(args.control_plane.rstrip("/") + "/devices")
        print("control-plane: ok")
        print("devices:")
        print(devices)
    except Exception as exc:  # noqa: BLE001
        print(f"control-plane error: {exc}")


def cmd_devices(args):
    devices = http_get(args.control_plane.rstrip("/") + "/devices")
    print(devices)


def cmd_logs_tail(args):
    path = args.log
    if not os.path.exists(path):
        print(f"log not found: {path}")
        return
    with open(path, "r", encoding="utf-8") as f:
        f.seek(0, os.SEEK_END)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.5)
                continue
            print(line.rstrip())


def main():
    parser = argparse.ArgumentParser(prog="atlas")
    sub = parser.add_subparsers(dest="cmd")

    p_init = sub.add_parser("init")
    p_init.set_defaults(func=cmd_init)

    p_status = sub.add_parser("status")
    p_status.add_argument("--control-plane", default="http://localhost:8080")
    p_status.set_defaults(func=cmd_status)

    p_devices = sub.add_parser("devices")
    p_devices.add_argument("--control-plane", default="http://localhost:8080")
    p_devices.set_defaults(func=cmd_devices)

    p_logs = sub.add_parser("logs")
    p_logs.add_argument("subcmd", choices=["tail"])
    p_logs.add_argument("--log", default="atlas/logs/ai.jsonl")
    p_logs.set_defaults(func=cmd_logs_tail)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
