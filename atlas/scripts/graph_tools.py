#!/usr/bin/env python3
import argparse
import os

from atlas.services.log_parser import parse_log_file, extract_relationships
from atlas.services.context_graph import ContextGraph
from atlas.services.graph_viz import export_dot, export_json, export_ascii


def build_graph(log_path):
    _entities, events = parse_log_file(log_path)
    nodes, edges = extract_relationships(events)
    graph = ContextGraph()
    for n in nodes:
        graph.add_node(n["id"], n["type"], n.get("attributes"))
    for e in edges:
        graph.add_edge(e["source"], e["target"], e["type"], e.get("attributes"))
    return graph, nodes, edges


def cmd_query(args):
    graph, _, _ = build_graph(args.log)
    if args.context:
        print(graph.get_context_for_run(args.context))
    if args.produced:
        print(graph.get_produced_files(args.produced))
    if args.history:
        print(graph.get_run_history(args.history))


def cmd_export(args):
    _, nodes, edges = build_graph(args.log)
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    if args.format == "dot":
        export_dot(nodes, edges, args.output)
    elif args.format == "json":
        export_json(nodes, edges, args.output)
    else:
        export_ascii(nodes, edges, args.output)


def main():
    parser = argparse.ArgumentParser(description="Atlas context graph tools")
    sub = parser.add_subparsers(dest="cmd")

    p_query = sub.add_parser("query")
    p_query.add_argument("--log", default="atlas/logs/ai.jsonl")
    p_query.add_argument("--context")
    p_query.add_argument("--produced")
    p_query.add_argument("--history")
    p_query.set_defaults(func=cmd_query)

    p_export = sub.add_parser("export")
    p_export.add_argument("--log", default="atlas/logs/ai.jsonl")
    p_export.add_argument("--format", choices=["dot", "json", "ascii"], default="dot")
    p_export.add_argument("--output", default="atlas/docs/graph-examples/graph.dot")
    p_export.set_defaults(func=cmd_export)

    args = parser.parse_args()
    if not hasattr(args, "func"):
        parser.print_help()
        return
    args.func(args)


if __name__ == "__main__":
    main()
