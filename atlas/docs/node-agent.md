# Node Agent (v1)

Location: `atlas/agents/node-agent`

## Build
```
cd atlas/agents/node-agent

go build ./cmd/node-agent
```

## Run
```
./node-agent --config ../../config/agents/local-agent.json --data ./data
```

## Auth
- If `api_token` is set in agent config, requests include `Authorization: Bearer <token>`.

## Capabilities
- OS, arch, CPU cores, best-effort memory
- Tags from config

## Notes
- Filesystem is treated as read-only by policy; enforcement is a policy contract in v1.
- Heartbeats are POSTed to `/heartbeat` on the control plane.
