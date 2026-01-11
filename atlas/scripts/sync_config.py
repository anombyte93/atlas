#!/usr/bin/env python3
import argparse
import json
import os
import subprocess


def run(cmd, cwd=None):
    subprocess.check_call(cmd, cwd=cwd)


def merge_json(base_path, overlay_path, output_path):
    with open(base_path, "r", encoding="utf-8") as f:
        base = json.load(f)
    with open(overlay_path, "r", encoding="utf-8") as f:
        overlay = json.load(f)
    base.update(overlay)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(base, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Sync Atlas config and apply per-device overlay")
    parser.add_argument("--repo", default=".")
    parser.add_argument("--device-id", required=True)
    args = parser.parse_args()

    run(["git", "pull"], cwd=args.repo)
    overlay_path = os.path.join(args.repo, "atlas", "config", "overlays", f"{args.device_id}.json")
    device_path = os.path.join(args.repo, "atlas", "config", "devices", f"{args.device_id}.json")
    if os.path.exists(overlay_path) and os.path.exists(device_path):
        merge_json(device_path, overlay_path, device_path)
        print("Overlay applied")
    else:
        print("No overlay found; sync complete")


if __name__ == "__main__":
    main()
