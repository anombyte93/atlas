import json
import networkx as nx


class ContextGraph:
    def __init__(self):
        self.graph = nx.MultiDiGraph()

    def add_node(self, node_id, node_type, attributes=None):
        self.graph.add_node(node_id, type=node_type, **(attributes or {}))

    def add_edge(self, source, target, edge_type, attributes=None):
        self.graph.add_edge(source, target, type=edge_type, **(attributes or {}))

    def save_graph(self, path):
        nx.write_graphml(self.graph, path)

    def load_graph(self, path):
        self.graph = nx.read_graphml(path)

    def export_json(self, path):
        data = {
            "nodes": [
                {"id": n, "attributes": self.graph.nodes[n]} for n in self.graph.nodes
            ],
            "edges": [
                {"source": u, "target": v, "attributes": d} for u, v, d in self.graph.edges(data=True)
            ],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_context_for_run(self, run_id):
        return list(self.graph.predecessors(run_id))

    def get_produced_files(self, run_id):
        return [u for u, v, d in self.graph.edges(data=True) if v == run_id and d.get("type") == "produced_by"]

    def get_run_history(self, file_path):
        return [v for u, v, d in self.graph.edges(data=True) if u == file_path and d.get("type") in ("used_in", "produced_by")]
