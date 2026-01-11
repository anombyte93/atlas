#!/usr/bin/env python3
import argparse
import json
from atlas.logging.jsonl_store import JSONLStore


def main():
    parser = argparse.ArgumentParser(description="Query Atlas JSONL logs")
    parser.add_argument("--log", default="atlas/logs/ai.jsonl")
    parser.add_argument("--device")
    parser.add_argument("--agent")
    parser.add_argument("--since")
    args = parser.parse_args()

    store = JSONLStore(args.log)
    results = store.query(device_id=args.device, agent_id=args.agent, since_ts=args.since)
    for entry in results:
        print(json.dumps(entry))


if __name__ == "__main__":
    main()
