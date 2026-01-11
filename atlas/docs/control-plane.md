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
- `ATLAS_API_TOKEN` environment variable overrides config.
- `ATLAS_INSECURE=1` allows empty/default tokens for local dev only.

## Endpoints
- `POST /register`
- `POST /heartbeat`
- `GET /devices`
- `POST /tasks/submit`
- `POST /tasks/claim`
- `POST /tasks/report`
- `GET /tasks/list`
- `GET /health`

## Errors
- Error responses are JSON, see `atlas/docs/errors.md`.

## Hot Reload
- Polls config file mtime every 2s and reloads values.

## TLS
- Set `tls_cert_path` and `tls_key_path` to enable TLS.
- Set `ca_cert_path` to require client certs (mTLS).

## mTLS Client Example
```
curl --cacert ca.pem --cert client.pem --key client.key https://localhost:8080/health
```

## Smoke Test
```
./atlas/scripts/smoke_test.sh
```

## Device Registry
- Device registrations are persisted to SQLite (`tasks.db`).
- See `atlas/docs/device-registry.md`.
- Optional TTL pruning via `device_ttl_hours` in config.

## Leader Lease
- `leader_lease_enabled` uses a SQLite lease to avoid multiple schedulers.
