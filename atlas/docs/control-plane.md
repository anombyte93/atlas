# Control Plane (v1)

Location: `atlas/services/control-plane`

## Build
```
cd atlas/services/control-plane

go build ./cmd/control-plane
```

## Run
```
./control-plane
```

## Auth
- If `api_token` is set in `atlas/config/control-plane.json`, all write endpoints require `Authorization: Bearer <token>`.
- Read endpoints (`/devices`, `/tasks/list`) also require the token when set.

## Endpoints
- `POST /register`
- `POST /heartbeat`
- `GET /devices`
- `POST /tasks/submit`
- `POST /tasks/claim`
- `POST /tasks/report`
- `GET /tasks/list`
- `GET /health`

## Hot Reload
- Polls config file mtime every 2s and reloads values.
