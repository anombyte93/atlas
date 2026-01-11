# Context Graph Prototype

## Build from logs
```
python3 atlas/scripts/graph_tools.py export --log atlas/logs/ai.jsonl --format dot --output atlas/docs/graph-examples/graph.dot
```

## Query
```
python3 atlas/scripts/graph_tools.py query --log atlas/logs/ai.jsonl --context run-1
```

## Demo
```
./atlas/scripts/build_demo_graph.sh
```
