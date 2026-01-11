import json


def export_dot(nodes, edges, path):
    lines = ["digraph atlas {"]
    for n in nodes:
        lines.append(f"\"{n['id']}\" [label=\"{n['id']}\"]; ")
    for e in edges:
        lines.append(f"\"{e['source']}\" -> \"{e['target']}\" [label=\"{e['type']}\"]; ")
    lines.append("}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def export_json(nodes, edges, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"nodes": nodes, "edges": edges}, f, indent=2)


def export_ascii(nodes, edges, path):
    lines = ["Nodes:"]
    for n in nodes:
        lines.append(f"- {n['id']} ({n['type']})")
    lines.append("Edges:")
    for e in edges:
        lines.append(f"- {e['source']} -> {e['target']} ({e['type']})")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
